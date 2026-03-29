import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { dbService, authService } from '../lib/appwrite';
import { RefreshCw, CheckCircle, AlertTriangle, Play, Database, Trash2 } from 'lucide-react';

export default function ReconciliationPage() {
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({
        ledgerCount: 0,
        transactionCount: 0,
        expenseCount: 0,
        bulkConversionCount: 0,
        agentCount: 0
    });
    const [logs, setLogs] = useState([]);
    const [user, setUser] = useState(null);

    useEffect(() => {
        const init = async () => {
            const u = await authService.getCurrentUser();
            setUser(u);
            loadStats();
        };
        init();
    }, []);

    const loadStats = async () => {
        setLoading(true);
        try {
            const [ledger, txs, exps, bulks, agts] = await Promise.all([
                dbService.listLedgerEntries(),
                dbService.listTransactions(),
                dbService.listExpenses(),
                dbService.listAedConversions(),
                dbService.listAgents()
            ]);

            setStats({
                ledgerCount: ledger.total,
                transactionCount: txs.total,
                expenseCount: exps.total,
                bulkConversionCount: bulks.total,
                agentCount: agts.total
            });
        } catch (err) {
            console.error('Failed to load stats:', err);
            addLog('Error loading stats: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const addLog = (msg, type = 'info') => {
        setLogs(prev => [{ msg, type, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 100));
    };

    const handleClearLedger = async () => {
        if (!window.confirm('WARNING: This will delete ALL existing ledger entries. Are you sure?')) return;

        setLoading(true);
        addLog('Clearing all ledger entries...', 'warning');
        try {
            const entries = await dbService.listLedgerEntries();
            for (const entry of entries.documents) {
                await dbService.deleteLedgerEntry(entry.$id);
            }
            addLog(`Deleted ${entries.total} entries.`, 'success');
            loadStats();
        } catch (err) {
            addLog('Clear failed: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleWipeAndFullRebuild = async () => {
        if (!window.confirm('⚠️ WIPE & FULL REBUILD:\n\n1. Delete ALL ledger entries\n2. Reset all agent balances to 0\n3. Rebuild everything with correct agent_type\n\nThis cannot be undone. Continue?')) return;

        setLoading(true);
        addLog('=== WIPE & FULL REBUILD STARTED ===', 'warning');

        try {
            // Step 1: Clear all ledger entries
            addLog('Step 1/3: Clearing all ledger entries...', 'warning');
            const entries = await dbService.listLedgerEntries();
            let deleted = 0;
            for (const entry of entries.documents) {
                try {
                    await dbService.deleteLedgerEntry(entry.$id);
                    deleted++;
                    if (deleted % 50 === 0) addLog(`Deleted ${deleted} entries...`, 'info');
                } catch {
                    // ignore
                }
            }
            addLog(`Deleted ${deleted} ledger entries.`, 'success');

            // Step 2: Reset all agent balances to 0
            addLog('Step 2/3: Resetting all agent balances to 0...', 'warning');
            const [agts] = await Promise.all([dbService.listAgents()]);
            let resetCount = 0;
            for (const agent of agts.documents) {
                await dbService.updateAgent(agent.$id, {
                    sar_balance: 0,
                    aed_balance: 0,
                    inr_balance: 0
                });
                resetCount++;
            }
            addLog(`Reset ${resetCount} agent balances to 0.`, 'success');

            // Step 3: Rebuild ledger with correct agent_type
            addLog('Step 3/3: Rebuilding ledger with correct agent_type...', 'warning');
            const [txs, exps, bulks, existingLedger] = await Promise.all([
                dbService.listTransactions(),
                dbService.listExpenses(),
                dbService.listAedConversions(),
                dbService.listLedgerEntries()
            ]);
            const existingRefs = new Set(existingLedger.documents.map(l => l.reference_id));
            let created = 0;

            // Process Transactions
            for (const tx of txs.documents) {
                if (tx.collection_agent_id && !existingRefs.has(tx.$id + '_coll')) {
                    const colAgent = agts.documents.find(a => a.$id === tx.collection_agent_id);
                    await dbService.createLedgerEntry({
                        agent_id: tx.collection_agent_id,
                        agent_name: tx.collection_agent_name,
                        agent_type: colAgent?.type || 'collection',
                        amount: Number(tx.collected_amount),
                        currency: tx.collected_currency || 'SAR',
                        type: 'debit',
                        reference_type: 'transaction',
                        description: `Automated Sync: Collection for transaction #${tx.tx_id || tx.$id.slice(-6)}`,
                        reference_id: tx.$id + '_coll'
                    });
                    created++;
                }
                if (tx.distributor_id && !existingRefs.has(tx.$id + '_dist')) {
                    const distAgent = agts.documents.find(a => a.$id === tx.distributor_id);
                    await dbService.createLedgerEntry({
                        agent_id: tx.distributor_id,
                        agent_name: tx.distributor_name,
                        agent_type: distAgent?.type || 'distributor',
                        amount: Number(tx.actual_inr_distributed || tx.inr_requested),
                        currency: 'INR',
                        type: 'credit',
                        reference_type: 'transaction',
                        description: `Automated Sync: Distribution for transaction #${tx.tx_id || tx.$id.slice(-6)}`,
                        reference_id: tx.$id + '_dist'
                    });
                    created++;
                }
                if (tx.conversion_agent_id && !existingRefs.has(tx.$id + '_conv')) {
                    const convAgent = agts.documents.find(a => a.$id === tx.conversion_agent_id);
                    await dbService.createLedgerEntry({
                        agent_id: tx.conversion_agent_id,
                        agent_name: tx.conversion_agent_name,
                        agent_type: convAgent?.type || 'conversion_sar',
                        amount: Number(tx.collected_amount),
                        currency: tx.collected_currency || 'SAR',
                        type: 'debit',
                        reference_type: 'transaction',
                        description: `Automated Sync: Individual conversion #${tx.tx_id || tx.$id.slice(-6)}`,
                        reference_id: tx.$id + '_conv'
                    });
                    created++;
                }
            }

            // Process Expenses
            for (const exp of exps.documents) {
                if (existingRefs.has(exp.$id)) continue;
                if (!exp.distributor_id && !exp.distributor_name) continue;
                const matchedAgent = agts.documents.find(a => a.$id === exp.distributor_id);
                if (!matchedAgent) continue;

                const targetType = matchedAgent.type;

                if (exp.category === 'Agent Payment') {
                    await dbService.createLedgerEntry({
                        agent_id: matchedAgent.$id, agent_name: matchedAgent.name, agent_type: targetType,
                        amount: Number(exp.amount), currency: exp.currency || 'SAR', type: 'credit',
                        reference_type: 'expense', description: `Automated Sync: Payment record ${exp.notes || ''}`, reference_id: exp.$id
                    });
                    created++;
                } else if (exp.category === 'Distributor Deposit') {
                    await dbService.createLedgerEntry({
                        agent_id: matchedAgent.$id, agent_name: matchedAgent.name, agent_type: targetType,
                        amount: Number(exp.amount), currency: exp.currency || 'INR', type: 'debit',
                        reference_type: 'expense', description: `Automated Sync: Deposit record ${exp.notes || ''}`, reference_id: exp.$id
                    });
                    created++;
                } else if (exp.category === 'Conversion Deposit') {
                    await dbService.createLedgerEntry({
                        agent_id: matchedAgent.$id, agent_name: matchedAgent.name, agent_type: targetType,
                        amount: Number(exp.amount), currency: exp.currency || 'SAR', type: 'debit',
                        reference_type: 'expense', description: `Automated Sync: Conversion Deposit ${exp.notes || ''}`, reference_id: exp.$id
                    });
                    created++;
                } else if (exp.category === 'Conversion Receipt') {
                    const match = exp.notes?.match(/Sourced from ([\d,.]+) /);
                    const clearedAmt = match ? Number(match[1].replace(/,/g, '')) : Number(exp.amount);
                    const clearedCur = exp.notes?.includes('SAR') ? 'SAR' : 'AED';
                    await dbService.createLedgerEntry({
                        agent_id: matchedAgent.$id, agent_name: matchedAgent.name, agent_type: targetType,
                        amount: clearedAmt, currency: clearedCur, type: 'credit',
                        reference_type: 'expense', description: `Automated Sync: Conversion Receipt ${exp.notes || ''}`, reference_id: exp.$id
                    });
                    created++;
                } else if (exp.category === 'AED→INR Conversion') {
                    if (exp.currency === 'AED') {
                        await dbService.createLedgerEntry({
                            agent_id: matchedAgent.$id, agent_name: matchedAgent.name, agent_type: targetType,
                            amount: Number(exp.amount), currency: 'AED', type: 'credit',
                            reference_type: 'expense', description: `Automated Sync: AED→INR Conversion (AED Side)`, reference_id: exp.$id
                        });
                        created++;
                    } else if (exp.currency === 'INR') {
                        await dbService.createLedgerEntry({
                            agent_id: matchedAgent.$id, agent_name: matchedAgent.name, agent_type: targetType,
                            amount: Number(exp.amount), currency: 'INR', type: 'debit',
                            reference_type: 'expense', description: `Automated Sync: AED→INR Conversion (INR Side)`, reference_id: exp.$id
                        });
                        created++;
                    }
                }
            }

            // Process Bulk Conversions
            for (const bulk of bulks.documents) {
                if (!bulk.conversion_agent_id) continue;
                const convAgent = agts.documents.find(a => a.$id === bulk.conversion_agent_id);
                if (!existingRefs.has(bulk.$id + '_src')) {
                    const srcAmt = Number(bulk.sar_amount || bulk.aed_amount);
                    const srcCur = bulk.sar_amount ? 'SAR' : 'AED';
                    await dbService.createLedgerEntry({
                        agent_id: bulk.conversion_agent_id, agent_name: bulk.conversion_agent_name,
                        agent_type: convAgent?.type || 'conversion_sar',
                        amount: srcAmt, currency: srcCur, type: 'debit',
                        reference_type: 'aed_conversion', description: `Automated Sync: Bulk conversion source (${srcCur})`, reference_id: bulk.$id + '_src'
                    });
                    created++;
                }
                if (!existingRefs.has(bulk.$id + '_tgt') && bulk.sar_amount && bulk.aed_amount) {
                    await dbService.createLedgerEntry({
                        agent_id: bulk.conversion_agent_id, agent_name: bulk.conversion_agent_name,
                        agent_type: convAgent?.type || 'conversion_sar',
                        amount: Number(bulk.aed_amount), currency: 'AED', type: 'credit',
                        reference_type: 'aed_conversion', description: `Automated Sync: Bulk conversion target (AED)`, reference_id: bulk.$id + '_tgt'
                    });
                    created++;
                }
            }

            addLog(`=== REBUILD COMPLETE: Created ${created} entries ===`, 'success');
            loadStats();
        } catch (err) {
            addLog('Wipe & Rebuild failed: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleRebuildLedger = async () => {
        setLoading(true);
        addLog('Starting Ledger Rebuild sync...', 'info');
        
        try {
            // 1. Load everything
            const [txs, exps, bulks, agts, existingLedger] = await Promise.all([
                dbService.listTransactions(),
                dbService.listExpenses(),
                dbService.listAedConversions(),
                dbService.listAgents(),
                dbService.listLedgerEntries()
            ]);

            const existingRefs = new Set(existingLedger.documents.map(l => l.reference_id));
            let createdCount = 0;

            // 2. Process Transactions (Distribution & Collection)
            for (const tx of txs.documents) {
                // Agent Collection (Receiving money from client)
                if (tx.collection_agent_id && !existingRefs.has(tx.$id + '_coll')) {
                    const colAgent = agts.documents.find(a => a.$id === tx.collection_agent_id);
                    await dbService.createLedgerEntry({
                        agent_id: tx.collection_agent_id,
                        agent_name: tx.collection_agent_name,
                        agent_type: colAgent?.type || 'collection',
                        amount: Number(tx.collected_amount),
                        currency: tx.collected_currency || 'SAR',
                        type: 'debit', // Agent received money from client
                        reference_type: 'transaction',
                        description: `Automated Sync: Collection for transaction #${tx.tx_id || tx.$id.slice(-6)}`,
                        reference_id: tx.$id + '_coll'
                    });
                    createdCount++;
                }

                // Distributor Send (Giving INR to client)
                if (tx.distributor_id && !existingRefs.has(tx.$id + '_dist')) {
                    const distAgent = agts.documents.find(a => a.$id === tx.distributor_id);
                    await dbService.createLedgerEntry({
                        agent_id: tx.distributor_id,
                        agent_name: tx.distributor_name,
                        agent_type: distAgent?.type || 'distributor',
                        amount: Number(tx.actual_inr_distributed || tx.inr_requested),
                        currency: 'INR',
                        type: 'credit', // Distributor gave INR to client (reduced balance)
                        reference_type: 'transaction',
                        description: `Automated Sync: Distribution for transaction #${tx.tx_id || tx.$id.slice(-6)}`,
                        reference_id: tx.$id + '_dist'
                    });
                    createdCount++;
                }

                // Conversion Agent logic (SAR -> AED or AED -> INR)
                if (tx.conversion_agent_id && !existingRefs.has(tx.$id + '_conv')) {
                    const convAgent = agts.documents.find(a => a.$id === tx.conversion_agent_id);
                    await dbService.createLedgerEntry({
                        agent_id: tx.conversion_agent_id,
                        agent_name: tx.conversion_agent_name,
                        agent_type: convAgent?.type || 'conversion_sar',
                        amount: Number(tx.collected_amount),
                        currency: tx.collected_currency || 'SAR',
                        type: 'debit', // Agent received SAR to convert
                        reference_type: 'transaction',
                        description: `Automated Sync: Individual conversion #${tx.tx_id || tx.$id.slice(-6)}`,
                        reference_id: tx.$id + '_conv'
                    });
                    createdCount++;
                }
            }

            // 3. Process Expenses (Payments & Deposits)
            for (const exp of exps.documents) {
                if (existingRefs.has(exp.$id)) continue;

                // Match either by ID or Name (for historical compatibility)
                if (exp.distributor_id || exp.distributor_name) {
                    const matchedAgent = agts.documents.find(a =>
                        (exp.distributor_id && a.$id === exp.distributor_id)
                    );

                    if (matchedAgent) {
                        const targetId = matchedAgent.$id;
                        const targetName = matchedAgent.name;
                        const targetType = matchedAgent.type;

                        if (exp.category === 'Agent Payment') {
                            await dbService.createLedgerEntry({
                                agent_id: targetId,
                                agent_name: targetName,
                                agent_type: targetType,
                                amount: Number(exp.amount),
                                currency: exp.currency || 'SAR',
                                type: 'credit', // Agent gave us money
                                reference_type: 'expense',
                                description: `Automated Sync: Payment record ${exp.notes || ''}`,
                                reference_id: exp.$id
                            });
                            createdCount++;
                        } else if (exp.category === 'Distributor Deposit') {
                            await dbService.createLedgerEntry({
                                agent_id: targetId,
                                agent_name: targetName,
                                agent_type: targetType,
                                amount: Number(exp.amount),
                                currency: exp.currency || 'INR',
                                type: 'debit', // Distributor received INR deposit from us
                                reference_type: 'expense',
                                description: `Automated Sync: Deposit record ${exp.notes || ''}`,
                                reference_id: exp.$id
                            });
                            createdCount++;
                        } else if (exp.category === 'Conversion Deposit') {
                            await dbService.createLedgerEntry({
                                agent_id: targetId,
                                agent_name: targetName,
                                agent_type: targetType,
                                amount: Number(exp.amount),
                                currency: exp.currency || 'SAR',
                                type: 'debit', // Conversion agent received money from us
                                reference_type: 'expense',
                                description: `Automated Sync: Conversion Deposit ${exp.notes || ''}`,
                                reference_id: exp.$id
                            });
                            createdCount++;
                        } else if (exp.category === 'Conversion Receipt') {
                            let clearedAmt = 0;
                            const match = exp.notes?.match(/Sourced from ([\d,.]+) /);
                            if (match) clearedAmt = Number(match[1].replace(/,/g, ''));
                            else clearedAmt = Number(exp.amount);

                            const clearedCur = exp.notes?.includes('SAR') ? 'SAR' : 'AED';

                            await dbService.createLedgerEntry({
                                agent_id: targetId,
                                agent_name: targetName,
                                agent_type: targetType,
                                amount: clearedAmt,
                                currency: clearedCur,
                                type: 'credit', // Conversion agent gave us converted money
                                reference_type: 'expense',
                                description: `Automated Sync: Conversion Receipt ${exp.notes || ''}`,
                                reference_id: exp.$id
                            });
                            createdCount++;
                        } else if (exp.category === 'AED→INR Conversion') {
                            // Recording the AED side for the agent
                            if (exp.currency === 'AED') {
                                await dbService.createLedgerEntry({
                                    agent_id: targetId,
                                    agent_name: targetName,
                                    agent_type: targetType,
                                    amount: Number(exp.amount),
                                    currency: 'AED',
                                    type: 'credit', // Agent gave us AED
                                    reference_type: 'expense',
                                    description: `Automated Sync: AED→INR Conversion (AED Side)`,
                                    reference_id: exp.$id
                                });
                                createdCount++;
                            } else if (exp.currency === 'INR') {
                                // Recording the INR side
                                await dbService.createLedgerEntry({
                                    agent_id: targetId,
                                    agent_name: targetName,
                                    agent_type: targetType,
                                    amount: Number(exp.amount),
                                    currency: 'INR',
                                    type: 'debit', // Agent received INR from client/distributor
                                    reference_type: 'expense',
                                    description: `Automated Sync: AED→INR Conversion (INR Side)`,
                                    reference_id: exp.$id
                                });
                                createdCount++;
                            }
                        }
                    }
                }
            }

            // 4. Process Bulk Conversions (Double entry for source and target)
            for (const bulk of bulks.documents) {
                if (!bulk.conversion_agent_id) continue;

                const convAgent = agts.documents.find(a => a.$id === bulk.conversion_agent_id);

                // A. Source Side (Agent receives funds to convert - Debit)
                if (!existingRefs.has(bulk.$id + '_src')) {
                    const srcAmt = Number(bulk.sar_amount || bulk.aed_amount);
                    const srcCur = bulk.sar_amount ? 'SAR' : 'AED';

                    await dbService.createLedgerEntry({
                        agent_id: bulk.conversion_agent_id,
                        agent_name: bulk.conversion_agent_name,
                        agent_type: convAgent?.type || 'conversion_sar',
                        amount: srcAmt,
                        currency: srcCur,
                        type: 'debit', // Agent received funds to convert
                        reference_type: 'aed_conversion',
                        description: `Automated Sync: Bulk conversion source (${srcCur})`,
                        reference_id: bulk.$id + '_src'
                    });
                    createdCount++;
                }

                // B. Target Side (Agent returns converted funds - Credit)
                if (!existingRefs.has(bulk.$id + '_tgt')) {
                    if (bulk.sar_amount && bulk.aed_amount) {
                         // SAR -> AED: Agent gives us AED
                         await dbService.createLedgerEntry({
                            agent_id: bulk.conversion_agent_id,
                            agent_name: bulk.conversion_agent_name,
                            agent_type: convAgent?.type || 'conversion_sar',
                            amount: Number(bulk.aed_amount),
                            currency: 'AED',
                            type: 'credit', // Agent returned converted funds
                            reference_type: 'aed_conversion',
                            description: `Automated Sync: Bulk conversion target (AED)`,
                            reference_id: bulk.$id + '_tgt'
                        });
                        createdCount++;
                    }
                }
            }

            addLog(`Rebuild complete. Created ${createdCount} missing entries.`, 'success');
            loadStats();
        } catch (err) {
            addLog('Rebuild failed: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSyncAgentBalances = async () => {
        if (!window.confirm('This will update the "Balance" column for all agents to match their ledger historical total. Proceed?')) return;

        setLoading(true);
        addLog('Syncing agent balances with ledger...', 'info');
        try {
            const [agts, ledger] = await Promise.all([
                dbService.listAgents(),
                dbService.listLedgerEntries()
            ]);

            let updatedCount = 0;
            for (const agent of agts.documents) {
                // Filter entries by agent_id AND agent_type to prevent cross-contamination
                const entries = ledger.documents.filter(l =>
                    l.agent_id === agent.$id &&
                    (!l.agent_type || l.agent_type === agent.type)
                );

                let newSar = 0;
                let newAed = 0;
                let newInr = 0;

                entries.forEach(e => {
                    // Debit adds to balance, Credit subtracts
                    const amt = e.type === 'debit' ? Number(e.amount) : -Number(e.amount);

                    if (e.currency === 'SAR') newSar += amt;
                    if (e.currency === 'AED') newAed += amt;
                    if (e.currency === 'INR') newInr += amt;
                });

                // Round to 2 decimal places
                newSar = Math.round(newSar * 100) / 100;
                newAed = Math.round(newAed * 100) / 100;
                newInr = Math.round(newInr * 100) / 100;

                // Only update if changed
                const curSar = Math.round((agent.sar_balance || 0) * 100) / 100;
                const curAed = Math.round((agent.aed_balance || 0) * 100) / 100;
                const curInr = Math.round((agent.inr_balance || 0) * 100) / 100;

                if (curSar !== newSar || curAed !== newAed || curInr !== newInr) {
                    await dbService.updateAgent(agent.$id, {
                        sar_balance: newSar,
                        aed_balance: newAed,
                        inr_balance: newInr
                    });
                    updatedCount++;
                    addLog(`Synced ${agent.name} (${agent.type}): SAR=${newSar}, AED=${newAed}, INR=${newInr}`, 'info');
                }
            }

            addLog(`Balance sync complete. Updated ${updatedCount} agents.`, 'success');
            loadStats();
        } catch (err) {
            addLog('Sync failed: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    if (user?.role !== 'admin') {
        return <Layout title="Access Denied"><div className="card">You do not have permission to access this page.</div></Layout>;
    }

    return (
        <Layout title="System Reconciliation">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card">
                    <div className="card-header">
                        <Database size={20} className="text-accent" />
                        <h3 style={{ margin: 0 }}>Ledger Health</h3>
                    </div>
                    <div style={{ padding: 20 }}>
                        <div className="flex flex-col gap-4">
                            <div className="flex justify-between items-center p-3 bg-dark-lighter rounded">
                                <span className="text-muted">Total Ledger Entries</span>
                                <span className="font-bold">{stats.ledgerCount}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-dark-lighter rounded">
                                <span className="text-muted">Total Transactions</span>
                                <span className="font-bold">{stats.transactionCount}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-dark-lighter rounded">
                                <span className="text-muted">Total Expenses/Payments</span>
                                <span className="font-bold">{stats.expenseCount}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-dark-lighter rounded">
                                <span className="text-muted">Total Bulk Conversions</span>
                                <span className="font-bold">{stats.bulkConversionCount}</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 mt-6">
                            <button
                                className="btn btn-accent w-full flex items-center justify-center gap-2"
                                onClick={handleRebuildLedger}
                                disabled={loading}
                            >
                                <Play size={16} /> {loading ? 'Processing...' : 'Sync & Rebuild Ledger'}
                            </button>
                            <button
                                className="btn btn-outline w-full flex items-center justify-center gap-2"
                                onClick={handleSyncAgentBalances}
                                disabled={loading}
                            >
                                <RefreshCw size={16} /> Sync Balances (Agents Table)
                            </button>
                            <button
                                className="btn btn-danger w-full flex items-center justify-center gap-2"
                                onClick={handleClearLedger}
                                disabled={loading}
                            >
                                <Trash2 size={16} /> Clear Ledger Only
                            </button>
                            <button
                                className="btn btn-danger w-full flex items-center justify-center gap-2"
                                style={{ background: 'rgba(255,84,112,0.15)', border: '1px solid rgba(255,84,112,0.4)', color: 'var(--status-failed)' }}
                                onClick={handleWipeAndFullRebuild}
                                disabled={loading}
                            >
                                <Database size={16} /> Wipe & Full Rebuild (Reset All)
                            </button>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <AlertTriangle size={20} className="text-warning" />
                        <h3 style={{ margin: 0 }}>System Logs</h3>
                    </div>
                    <div style={{ padding: 0, height: '400px', overflowY: 'auto' }}>
                        {logs.length === 0 ? (
                            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                                No activity yet. Run a tool to see logs.
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {logs.map((log, i) => (
                                    <div key={i} style={{ 
                                        padding: '10px 16px', 
                                        borderBottom: '1px solid var(--border-color)',
                                        fontSize: '13px',
                                        background: log.type === 'error' ? 'rgba(255,84,112,0.05)' : log.type === 'success' ? 'rgba(0,200,150,0.05)' : 'transparent'
                                    }}>
                                        <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>[{log.time}]</span>
                                        <span style={{ 
                                            color: log.type === 'error' ? 'var(--status-failed)' : log.type === 'success' ? 'var(--brand-accent)' : log.type === 'warning' ? 'var(--brand-gold)' : 'inherit'
                                        }}>
                                            {log.msg}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="card mt-6" style={{ padding: 24, background: 'rgba(255,165,0,0.05)', border: '1px solid rgba(255,165,0,0.2)' }}>
                <h4 className="flex items-center gap-2 text-warning" style={{ marginTop: 0 }}>
                    <AlertTriangle size={18} /> Important Note
                </h4>
                <p className="text-secondary" style={{ fontSize: 14, margin: '8px 0 0' }}>
                    The "Sync & Rebuild" tool will scan all historical transactions and expenses. 
                    It checks if a ledger entry already exists for each event. 
                    If not, it creates a new one. This is safe to run multiple times as it uses "reference_id" to prevent duplicates.
                    Use "Sync Balances" after rebuilding to ensure the main agents list shows the correct totals.
                </p>
            </div>
        </Layout>
    );
}
