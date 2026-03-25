import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { dbService, authService } from '../lib/appwrite';
import { ledgerService } from '../lib/ledgerService';
import { RefreshCw, CheckCircle, AlertTriangle, Play, Database, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

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

            const existingRefs = new Set(existingLedger.documents.map(l => l.related_id));
            let createdCount = 0;

            // 2. Process Transactions (Distribution & Collection)
            for (const tx of txs.documents) {
                // Agent Collection
                if (tx.agent_id && !existingRefs.has(tx.$id + '_coll')) {
                    await dbService.createLedgerEntry({
                        agent_id: tx.agent_id,
                        agent_name: tx.agent_name,
                        agent_type: 'agent',
                        amount: Number(tx.sar_amount),
                        currency: 'SAR',
                        type: 'collection',
                        description: `Automated Sync: Collection for transaction #${tx.display_id || tx.$id.slice(-6)}`,
                        related_id: tx.$id + '_coll',
                        date: tx.date || new Date().toISOString()
                    });
                    createdCount++;
                }
                
                // Distributor Send
                if (tx.distributor_id && !existingRefs.has(tx.$id + '_dist')) {
                    await dbService.createLedgerEntry({
                        agent_id: tx.distributor_id,
                        agent_name: tx.distributor_name,
                        agent_type: 'distributor',
                        amount: Number(tx.aed_amount),
                        currency: 'AED',
                        type: 'distribution',
                        description: `Automated Sync: Distribution for transaction #${tx.display_id || tx.$id.slice(-6)}`,
                        related_id: tx.$id + '_dist',
                        date: tx.date || new Date().toISOString()
                    });
                    createdCount++;
                }

                // Conversion Agent logic
                if (tx.conv_agent_id && !existingRefs.has(tx.$id + '_conv')) {
                    await dbService.createLedgerEntry({
                        agent_id: tx.conv_agent_id,
                        agent_name: tx.conv_agent_name,
                        agent_type: 'conversion_agent',
                        amount: Number(tx.sar_amount),
                        currency: 'SAR',
                        type: 'conversion_receive',
                        description: `Automated Sync: Individual conversion #${tx.display_id || tx.$id.slice(-6)}`,
                        related_id: tx.$id + '_conv',
                        date: tx.date || new Date().toISOString()
                    });
                    createdCount++;
                }
            }

            // 3. Process Expenses (Payments & Deposits)
            for (const exp of exps.documents) {
                if (existingRefs.has(exp.$id)) continue;

                if (exp.category === 'Agent Payment' && exp.agent_id) {
                    await dbService.createLedgerEntry({
                        agent_id: exp.agent_id,
                        agent_name: exp.agent_name,
                        agent_type: 'agent',
                        amount: -Number(exp.amount),
                        currency: exp.currency || 'SAR',
                        type: 'payment',
                        description: `Automated Sync: Payment record ${exp.notes || ''}`,
                        related_id: exp.$id,
                        date: exp.date || new Date().toISOString()
                    });
                    createdCount++;
                } else if (exp.category === 'Distributor Deposit' && exp.agent_id) {
                    await dbService.createLedgerEntry({
                        agent_id: exp.agent_id,
                        agent_name: exp.agent_name,
                        agent_type: 'distributor',
                        amount: -Number(exp.amount),
                        currency: exp.currency || 'AED',
                        type: 'deposit',
                        description: `Automated Sync: Deposit record ${exp.notes || ''}`,
                        related_id: exp.$id,
                        date: exp.date || new Date().toISOString()
                    });
                    createdCount++;
                } else if (exp.category === 'Conversion Deposit' && exp.agent_id) {
                    await dbService.createLedgerEntry({
                        agent_id: exp.agent_id,
                        agent_name: exp.agent_name,
                        agent_type: 'conversion_agent',
                        amount: -Number(exp.amount),
                        currency: exp.currency || 'SAR',
                        type: 'conversion_deposit',
                        description: `Automated Sync: Conversion Deposit ${exp.notes || ''}`,
                        related_id: exp.$id,
                        date: exp.date || new Date().toISOString()
                    });
                    createdCount++;
                } else if (exp.category === 'Conversion Receipt' && exp.agent_id) {
                    // This is when we receive AED/INR back from agent
                    await dbService.createLedgerEntry({
                        agent_id: exp.agent_id,
                        agent_name: exp.agent_name,
                        agent_type: 'conversion_agent',
                        amount: Number(exp.source_amount || exp.amount), // The SAR/AED cleared
                        currency: exp.source_currency || 'SAR',
                        type: 'conversion_receive',
                        description: `Automated Sync: Conversion Receipt ${exp.notes || ''}`,
                        related_id: exp.$id,
                        date: exp.date || new Date().toISOString()
                    });
                    createdCount++;
                }
            }

            // 4. Process Bulk Conversions
            for (const bulk of bulks.documents) {
                if (bulk.agent_id && !existingRefs.has(bulk.$id)) {
                    await dbService.createLedgerEntry({
                        agent_id: bulk.agent_id,
                        agent_name: bulk.agent_name,
                        agent_type: 'conversion_agent',
                        amount: Number(bulk.sar_amount || bulk.aed_amount),
                        currency: bulk.sar_amount ? 'SAR' : 'AED',
                        type: 'conversion_receive',
                        description: `Automated Sync: Bulk conversion sync`,
                        related_id: bulk.$id,
                        date: bulk.date || new Date().toISOString()
                    });
                    createdCount++;
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
                const entries = ledger.documents.filter(l => l.agent_id === agent.$id);
                
                // Agents have SAR balance
                // Distributors have AED balance
                // Conversion Agents have SAR or AED balance depending on type
                
                let newSar = 0;
                let newAed = 0;

                entries.forEach(e => {
                    if (e.currency === 'SAR') newSar += Number(e.amount);
                    if (e.currency === 'AED') newAed += Number(e.amount);
                });

                // Only update if changed
                if (agent.sar_balance !== newSar || agent.aed_balance !== newAed) {
                    await dbService.updateAgent(agent.$id, {
                        sar_balance: newSar,
                        aed_balance: newAed
                    });
                    updatedCount++;
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
                                <Trash2 size={16} /> Clear Ledger (Reset Everything)
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
                    If not, it creates a new one. This is safe to run multiple times as it uses "related_id" to prevent duplicates.
                    Use "Sync Balances" after rebuilding to ensure the main agents list shows the correct totals.
                </p>
            </div>
        </Layout>
    );
}
