import { useState, useEffect } from 'react';
import { authService, dbService, Query } from '../lib/appwrite';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import {
    Plus, X, Pencil, Trash2, RefreshCw, Phone,
    TrendingUp, Banknote, Wallet, Calendar, List, Download
} from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, isAfter } from 'date-fns';
import * as XLSX from 'xlsx';

const DATE_RANGES = ['Today', 'This Week', 'This Month', 'All Time', 'Custom'];

const applyDateRange = (arr, range, from, to) => {
    if (range === 'All Time') return arr;
    const now = new Date();
    let start;
    if (range === 'Today') start = startOfDay(now);
    if (range === 'This Week') start = startOfWeek(now, { weekStartsOn: 1 });
    if (range === 'This Month') start = startOfMonth(now);
    if (range === 'Custom') {
        return arr.filter(r => {
            const d = new Date(r.$createdAt || r.date);
            const f = from ? new Date(from) : null;
            const t = to ? new Date(to + 'T23:59:59') : null;
            return (!f || d >= f) && (!t || d <= t);
        });
    }
    return arr.filter(r => isAfter(new Date(r.$createdAt || r.date), start));
};

const EMPTY = { name: '', phone: '', notes: '', type: 'conversion_sar', currency: 'AED', sar_balance: 0, aed_balance: 0 };

const CONV_TYPES = [
    { value: 'conversion_sar', label: 'SAR → AED', color: '#4a9eff', bg: 'rgba(74,158,255,0.15)' },
    { value: 'conversion_aed', label: 'AED → INR', color: 'var(--brand-gold)', bg: 'rgba(245,166,35,0.15)' },
];

const convTypeBadge = (type) => {
    const t = CONV_TYPES.find(c => c.value === type) || CONV_TYPES[0];
    return (
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: t.bg, color: t.color }}>
            {t.label}
        </span>
    );
};

export default function ConversionAgentsPage() {
    const [agents, setAgents] = useState([]);
    const [convRecs, setConvRecs] = useState([]);   // AED conversion records
    const [txs, setTxs] = useState([]);
    const [expenseRecs, setExpenseRecs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [viewingAgent, setViewingAgent] = useState(null);
    const [dateRange, setDateRange] = useState('All Time');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [editItem, setEditItem] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('conversion_sar');

    // Deposit / Receive State
    const [depositModal, setDepositModal] = useState(false);
    const [receiveModal, setReceiveModal] = useState(false);
    const [activeAgent, setActiveAgent] = useState(null);
    const [actionAmount, setActionAmount] = useState('');
    const [actionRate, setActionRate] = useState('');
    const [user, setUser] = useState(null);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [ar, cr, tr, ex] = await Promise.all([
                dbService.listAgents([Query.or([Query.equal('type', 'conversion_sar'), Query.equal('type', 'conversion_aed'), Query.equal('type', 'conversion')])]),
                dbService.listAedConversions(), // Bulk SAR->AED
                dbService.listTransactions(), // Individual SAR->AED
                dbService.listExpenses(), // Bulk AED->INR
            ]);
            setAgents(ar.documents);
            setConvRecs(cr.documents);
            setTxs(tr.documents);
            setExpenseRecs(ex.documents);
        } catch (e) { toast.error(e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => {
        fetchAll();
        authService.getCurrentUser().then(setUser);
    }, []);

    // Get all combined records for an agent
    const getAgentConversions = (agentId, agentName, agentType) => {
        let combined = [];

        if (agentType !== 'conversion_aed') {
            // 1. Bulk SAR->AED from aed_conversions
            const bulkSarAed = convRecs.filter(r => r.conversion_agent_id === agentId).map(r => ({
                ...r,
                $id: r.$id,
                record_type: 'bulk_sar_aed',
                date_time: new Date(r.date || r.$createdAt),
                sar_amount: Number(r.sar_amount) || 0,
                aed_amount: Number(r.aed_amount) || 0,
                rate: r.sar_rate || (r.sar_amount ? (Number(r.aed_amount) / Number(r.sar_amount)).toFixed(4) : ''),
                profit_inr: Number(r.profit_inr) || 0,
                status: 'completed',
            }));
            combined.push(...bulkSarAed);

            // 2. Individual SAR->AED from transactions
            const indSarAed = txs.filter(t => t.conversion_agent_id === agentId).map(t => {
                const collectedAed = (t.collected_currency === 'AED') ? Number(t.collected_amount) : 0;
                const convertedAed = (t.collected_currency !== 'AED' && t.sar_to_aed_rate) ? Number(t.collected_amount) * Number(t.sar_to_aed_rate) : 0;
                const aedAmount = collectedAed || convertedAed;

                return {
                    ...t,
                    $id: t.$id,
                    record_type: 'tx_sar_aed',
                    date_time: new Date(t.$createdAt),
                    sar_amount: t.collected_currency !== 'AED' ? Number(t.collected_amount) : 0,
                    aed_amount: aedAmount,
                    rate: t.sar_to_aed_rate || '',
                    profit_inr: 0,
                    status: t.status,
                };
            });
            combined.push(...indSarAed);
        }

        if (agentType === 'conversion_aed') {
            // 3. Bulk AED->INR from expenses
            const bulkAedInr = expenseRecs.filter(e =>
                e.type === 'expense' &&
                e.category === 'AED→INR Conversion' &&
                e.currency === 'AED' &&
                (e.title.includes(agentName) || (e.notes && e.notes.includes(agentName)))
            ).map(e => {
                const inrIncome = expenseRecs.find(inc =>
                    inc.type === 'income' &&
                    inc.category === 'AED→INR Conversion' &&
                    inc.date === e.date &&
                    (
                        Math.abs(new Date(inc.$createdAt || 0) - new Date(e.$createdAt || 0)) < 15000 ||
                        (inc.notes || '').includes(`${e.amount} AED`)
                    )
                );
                const inrAmount = inrIncome ? Number(inrIncome.amount) : 0;
                const rate = e.amount ? (inrAmount / Number(e.amount)).toFixed(4) : '';

                return {
                    ...e,
                    $id: e.$id,
                    record_type: 'bulk_aed_inr',
                    date_time: new Date(e.date || e.$createdAt),
                    aed_amount: Number(e.amount) || 0,
                    inr_amount: inrAmount,
                    rate: rate,
                    profit_inr: 0,
                    status: 'completed',
                    inr_expense_id: inrIncome ? inrIncome.$id : null
                };
            });
            combined.push(...bulkAedInr);
        }

        // 4. Deposits & Receipts
        const depositsAndReceipts = expenseRecs.filter(e =>
            (e.category === 'Conversion Deposit' || e.category === 'Conversion Receipt') &&
            e.distributor_name === agentName
        ).map(e => {
            let sar_amt = 0; let aed_amt = 0; let inr_amt = 0; let rate = '';
            let settled_amt = 0;

            if (e.category === 'Conversion Deposit') {
                if (e.currency === 'SAR') sar_amt = Number(e.amount) || 0;
                else aed_amt = Number(e.amount) || 0;
            } else { // Receipt
                const match = e.notes?.match(/Sourced from ([\d,.]+) /);
                settled_amt = match ? Number(match[1].replace(/,/g, '')) : 0;
                
                const rateMatch = e.notes?.match(/@ ([\d.]+)\)/);
                rate = rateMatch ? rateMatch[1] : '';

                if (e.currency === 'AED') {
                    aed_amt = Number(e.amount) || 0;
                    sar_amt = settled_amt;
                } else {
                    inr_amt = Number(e.amount) || 0;
                    aed_amt = settled_amt;
                }
            }

            return {
                ...e,
                $id: e.$id,
                record_type: e.category === 'Conversion Deposit' ? 'deposit' : 'receipt',
                date_time: new Date(e.date || e.$createdAt),
                sar_amount: sar_amt,
                aed_amount: aed_amt,
                inr_amount: inr_amt,
                settled_source_amount: settled_amt,
                rate: rate,
                profit_inr: 0,
                status: 'completed',
            };
        });
        combined.push(...depositsAndReceipts);

        // Sort chronological
        combined.sort((a, b) => a.date_time - b.date_time);

        // Calculate running totals
        let runningSource = 0;
        let runningProfit = 0;

        return combined.map(r => {
            if (agentType === 'conversion_sar') {
                if (r.record_type === 'deposit') {
                    runningSource += r.sar_amount;
                } else if (r.record_type === 'receipt') {
                    runningSource -= r.settled_source_amount;
                } else if (r.record_type.includes('sar_aed')) {
                    // Dashboard conversion counts as settlement for SAR balance
                    runningSource -= r.sar_amount;
                }
            } else if (agentType === 'conversion_aed') {
                if (r.record_type === 'deposit') {
                    runningSource += r.aed_amount;
                } else if (r.record_type === 'receipt') {
                    runningSource -= r.settled_source_amount;
                } else if (r.record_type.includes('aed_inr')) {
                    runningSource -= r.aed_amount;
                }
            }
            runningProfit += r.profit_inr;

            if (Math.abs(runningSource) < 0.001) runningSource = 0;
            if (Math.abs(runningProfit) < 0.001) runningProfit = 0;

            let displaySent = 0;
            let displayReceived = 0;

            if (agentType === 'conversion_sar') {
                displaySent = r.sar_amount || 0;
                displayReceived = (r.record_type === 'receipt' || r.record_type.includes('bulk')) ? (r.aed_amount || 0) : 0;
            } else if (agentType === 'conversion_aed') {
                displaySent = (r.record_type === 'deposit' || r.record_type.includes('bulk')) ? (r.aed_amount || 0) : 0;
                displayReceived = (r.record_type === 'receipt' || r.record_type.includes('bulk')) ? (r.inr_amount || 0) : 0;
            }

            return {
                ...r,
                running_source: runningSource,
                running_sar: agentType === 'conversion_sar' ? runningSource : 0,
                running_aed: agentType === 'conversion_aed' ? runningSource : (agentType === 'conversion_sar' ? 0 : 0), // Not used for balance anymore but keep for safety
                running_profit: runningProfit,
                display_sent: displaySent,
                display_received: displayReceived
            };
        });
    };

    // ── Per-agent stats ───────────────────────────────────────────────────────
    const agentStats = (agent) => {
        const recs = getAgentConversions(agent.$id, agent.name, agent.type);
        return {
            count: recs.length,
            sarSent: recs.reduce((a, r) => a + (Number(r.display_sent) || 0), 0),
            aedGot: recs.reduce((a, r) => a + (Number(r.display_received) || 0), 0),
            aedSent: recs.reduce((a, r) => a + (Number(r.display_sent) || 0), 0),
            inrGot: recs.reduce((a, r) => a + (Number(r.display_received) || 0), 0),
            profit: recs.reduce((a, r) => a + (Number(r.profit_inr) || 0), 0),
        };
    };

    const openNew = () => { setEditItem(null); setForm(EMPTY); setModal(true); };
    const openEdit = (a) => {
        setEditItem(a);
        setForm({
            name: a.name || '',
            phone: a.phone || '',
            notes: a.notes || '',
            type: a.type || 'conversion_sar',
            currency: 'AED',
            sar_balance: a.sar_balance || 0,
            aed_balance: a.aed_balance || 0
        });
        setModal(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editItem) { await dbService.updateAgent(editItem.$id, form); toast.success('Updated'); }
            else { await dbService.createAgent(form); toast.success('Conversion agent added'); }
            setModal(false);
            fetchAll();
        } catch (e) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    const handleDelete = async (agent) => {
        const agentRecs = convRecs.filter(r => r.conversion_agent_id === agent.$id);
        const msg = agentRecs.length > 0
            ? `Delete "${agent.name}"? This will also delete ${agentRecs.length} conversion record(s) from the dashboard. This cannot be undone.`
            : `Delete conversion agent "${agent.name}"?`;
        if (!window.confirm(msg)) return;
        try {
            // Delete all AED conversion records for this agent first
            await Promise.all(agentRecs.map(r => dbService.deleteAedConversion(r.$id)));
            await dbService.deleteAgent(agent.$id);
            toast.success(`Deleted agent + ${agentRecs.length} conversion record(s)`);
            fetchAll();
        } catch (e) { toast.error(e.message); }
    };

    const handleDepositSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const amtIn = Number(actionAmount);
            const rate = Number(actionRate);
            if (!amtIn || !rate) throw new Error('Enter valid amount and rate');

            const incByCur = (cur) => expenseRecs.filter(e => e.type === 'income' && e.currency === cur).reduce((a, e) => a + (Number(e.amount) || 0), 0);
            const expByCur = (cur) => expenseRecs.filter(e => e.type === 'expense' && e.currency === cur).reduce((a, e) => a + (Number(e.amount) || 0), 0);
            const sumF = (arr, field) => arr.reduce((a, r) => a + (Number(r[field]) || 0), 0);

            let expenseCur = '';
            let balField = '';

            if (activeAgent.type === 'conversion_sar') {
                const totalSARConverted = sumF(convRecs, 'sar_amount');
                const balanceSAR = incByCur('SAR') - expByCur('SAR') - totalSARConverted;
                if (amtIn > (balanceSAR + 0.01)) { // small epsilon for rounding errors
                    throw new Error(`Insufficient SAR! Only ${Math.max(0, balanceSAR).toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR available.`);
                }
                expenseCur = 'SAR';
                balField = 'sar_balance';
            } else {
                const totalAEDFromConversions = sumF(convRecs, 'aed_amount');
                const balanceAED = incByCur('AED') + totalAEDFromConversions - expByCur('AED');
                if (amtIn > (balanceAED + 0.01)) { // small epsilon for rounding errors
                    throw new Error(`Insufficient AED! Only ${Math.max(0, balanceAED).toLocaleString(undefined, { maximumFractionDigits: 2 })} AED available.`);
                }
                expenseCur = 'AED';
                balField = 'aed_balance';
            }

            const currentBal = Number(activeAgent[balField]) || 0;

            await Promise.all([
                dbService.updateAgent(activeAgent.$id, { [balField]: currentBal + amtIn }),
                dbService.createExpense({
                    title: `Deposit to Conv. Agent — ${activeAgent.name}`,
                    type: 'expense',
                    category: 'Conversion Deposit',
                    amount: amtIn,
                    currency: expenseCur,
                    date: new Date().toISOString().split('T')[0],
                    notes: `Deposited ${amtIn} ${expenseCur}.`,
                    distributor_name: activeAgent.name
                })
            ]);

            toast.success(`Deposited ${amtIn} ${expenseCur}`);
            setDepositModal(false);
            fetchAll();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleReceiveSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const amtSource = Number(actionAmount);
            const rate = Number(actionRate);
            if (!amtSource || !rate) throw new Error('Enter valid amount and rate');

            let incomeCur = '';
            let balField = '';
            let targetAmt = amtSource * rate;

            if (activeAgent.type === 'conversion_sar') {
                incomeCur = 'AED';
                balField = 'sar_balance';
            } else {
                incomeCur = 'INR';
                balField = 'aed_balance';
            }

            const currentBal = Number(activeAgent[balField]) || 0;

            await Promise.all([
                dbService.updateAgent(activeAgent.$id, { [balField]: currentBal - amtSource }),
                dbService.createExpense({
                    title: `Receipt from Conv. Agent — ${activeAgent.name}`,
                    type: 'income',
                    category: 'Conversion Receipt',
                    amount: targetAmt,
                    currency: incomeCur,
                    date: new Date().toISOString().split('T')[0],
                    notes: `Received ${targetAmt.toLocaleString()} ${incomeCur} (Sourced from ${amtSource} @ ${rate}) from conversion agent`,
                    distributor_name: activeAgent.name
                })
            ]);

            toast.success(`Received ${amtRec} ${incomeCur}`);
            setReceiveModal(false);
            fetchAll();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteRecord = async (e, r) => {
        e.stopPropagation();
        if (!window.confirm('Delete this record? This cannot be undone.')) return;

        try {
            setSaving(true);
            if (r.record_type === 'tx_sar_aed') {
                toast.error('To delete a transaction, please go to the Transactions page.');
                setSaving(false);
                return;
            } else if (r.record_type === 'bulk_sar_aed') {
                await dbService.deleteAedConversion(r.$id);
            } else if (r.record_type === 'bulk_aed_inr') {
                await dbService.deleteExpense(r.$id);
                if (r.inr_expense_id) await dbService.deleteExpense(r.inr_expense_id);
            } else if (r.record_type === 'deposit' || r.record_type === 'receipt') {
                const agent = agents.find(a => a.name === r.distributor_name);
                if (agent) {
                    let undoBal = 0;
                    if (r.record_type === 'deposit') {
                        undoBal = -Number(r.amount);
                    } else {
                        // Undo receipt: Add back the source amount to agent balance
                        const match = r.notes?.match(/Sourced from ([\d,.]+) /);
                        if (match) undoBal = Number(match[1].replace(/,/g, ''));
                        else undoBal = Number(r.amount); // fallback
                    }
                    if (undoBal !== 0 && undoBal && !isNaN(undoBal)) {
                        const balField = agent.type === 'conversion_sar' ? 'sar_balance' : 'aed_balance';
                        await dbService.updateAgent(agent.$id, { [balField]: (Number(agent[balField]) || 0) + undoBal });
                    }
                }
                await dbService.deleteExpense(r.$id);
            }
            toast.success('Record deleted');
            fetchAll();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Layout title="Conversion Agents">
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    These agents convert <strong>SAR → AED</strong> for us. Select one when recording a conversion on the Dashboard.
                </div>
            </div>

            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {agents.length} agent{agents.length !== 1 ? 's' : ''} · {convRecs.length} total conversions recorded
                </div>
                <button id="new-conv-agent-btn" className="btn btn-accent" onClick={openNew}>
                    <Plus size={16} /> Add Conversion Agent
                </button>
            </div>

            {loading ? (
                <div className="loading-screen" style={{ minHeight: '40vh' }}><div className="spinner" /><p>Loading…</p></div>
            ) : agents.length === 0 ? (
                <div className="empty-state card">
                    <RefreshCw size={40} />
                    <p>No conversion agents yet. Add one to get started.</p>
                </div>
            ) : (
                <div className="card">
                    <div className="card-header" style={{ paddingBottom: 16, borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center' }}>
                        <div className="flex gap-4">
                            <button
                                style={{
                                    fontSize: 18,
                                    padding: '10px 28px',
                                    borderRadius: '12px',
                                    border: activeTab === 'conversion_sar' ? '1px solid var(--brand-accent)' : '1px solid var(--border-color)',
                                    background: activeTab === 'conversion_sar' ? 'var(--brand-accent)' : 'rgba(255,255,255,0.05)',
                                    color: '#fff',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onClick={() => setActiveTab('conversion_sar')}
                            >
                                SAR → AED Agents
                            </button>
                            <button
                                style={{
                                    fontSize: 18,
                                    padding: '10px 28px',
                                    borderRadius: '12px',
                                    border: activeTab === 'conversion_aed' ? '1px solid var(--brand-accent)' : '1px solid var(--border-color)',
                                    background: activeTab === 'conversion_aed' ? 'var(--brand-accent)' : 'rgba(255,255,255,0.05)',
                                    color: '#fff',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onClick={() => setActiveTab('conversion_aed')}
                            >
                                AED → INR Agents
                            </button>
                        </div>
                    </div>
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>#</th>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th style={{ textAlign: 'right' }}>{activeTab === 'conversion_sar' ? 'Total SAR Sent' : 'Total AED Sent'}</th>
                                    <th style={{ textAlign: 'right' }}>{activeTab === 'conversion_sar' ? 'Total AED' : 'Total INR'}</th>
                                    <th style={{ textAlign: 'right' }}>Net Profit (INR)</th>
                                    <th style={{ textAlign: 'right' }}>Balance Owed To Us</th>
                                    <th style={{ textAlign: 'center' }}>Ledger Operations</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {agents.filter(a => a.type === activeTab).map((a, i) => {
                                    const s = agentStats(a);
                                    const bal = activeTab === 'conversion_sar' ? (a.sar_balance || 0) : (a.aed_balance || 0);
                                    const balCur = activeTab === 'conversion_sar' ? 'SAR' : 'AED';

                                    return (
                                        <tr key={a.$id}>
                                            <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>
                                                    <button
                                                        onClick={() => setViewingAgent(a)}
                                                        style={{
                                                            background: 'none', border: 'none', padding: 0,
                                                            fontWeight: 'inherit', cursor: 'pointer',
                                                            textDecoration: 'underline', color: 'var(--brand-accent)'
                                                        }}
                                                    >
                                                        {a.name}
                                                    </button>
                                                </div>
                                                {a.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.notes}</div>}
                                            </td>
                                            <td style={{ color: 'var(--text-muted)' }}>{a.phone || '—'}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: activeTab === 'conversion_aed' ? 'var(--brand-gold)' : '#4a9eff' }}>
                                                {activeTab === 'conversion_aed' ? s.aedSent.toLocaleString() : s.sarSent.toLocaleString()}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: activeTab === 'conversion_aed' ? 'var(--text-primary)' : 'var(--brand-gold)' }}>
                                                {activeTab === 'conversion_aed' ? s.inrGot.toLocaleString('en-IN') : s.aedGot.toLocaleString()}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: s.profit >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)' }}>
                                                ₹{s.profit.toLocaleString('en-IN')}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: bal >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)' }}>
                                                {bal.toLocaleString()} <span style={{ fontSize: 11 }}>{balCur}</span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                    <button className="btn btn-danger btn-sm" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => { setActiveAgent(a); setActionAmount(''); setActionRate('1'); setDepositModal(true); }}>Deposit</button>
                                                    <button className="btn btn-accent btn-sm" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => { setActiveAgent(a); setActionAmount(''); setActionRate(''); setReceiveModal(true); }}>Receive</button>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                    <button className="btn btn-outline btn-sm btn-icon" title="View History" onClick={() => setViewingAgent(a)}><List size={13} /></button>
                                                    <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(a)}><Pencil size={13} /></button>
                                                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(a)}><Trash2 size={13} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>GRAND TOTAL</td>
                                    <td style={{ textAlign: 'right', fontWeight: 800, color: activeTab === 'conversion_aed' ? 'var(--brand-gold)' : '#4a9eff' }}>
                                        {agents.filter(a => a.type === activeTab).reduce((sum, a) => sum + (activeTab === 'conversion_aed' ? agentStats(a).aedSent : agentStats(a).sarSent), 0).toLocaleString()}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 800, color: activeTab === 'conversion_aed' ? 'var(--text-primary)' : 'var(--brand-gold)' }}>
                                        {agents.filter(a => a.type === activeTab).reduce((sum, a) => sum + (activeTab === 'conversion_aed' ? agentStats(a).inrGot : agentStats(a).aedGot), 0).toLocaleString(activeTab === 'conversion_aed' ? 'en-IN' : undefined)}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand-accent)' }}>
                                        ₹{agents.filter(a => a.type === activeTab).reduce((sum, a) => sum + agentStats(a).profit, 0).toLocaleString('en-IN')}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand-accent)' }}>
                                        {agents.filter(a => a.type === activeTab).reduce((sum, a) => sum + (activeTab === 'conversion_sar' ? (a.sar_balance || 0) : (a.aed_balance || 0)), 0).toLocaleString()} <span style={{ fontSize: 11 }}>{activeTab === 'conversion_sar' ? 'SAR' : 'AED'}</span>
                                    </td>
                                    <td colSpan={2}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {viewingAgent && (() => {
                let allTxs = getAgentConversions(viewingAgent.$id, viewingAgent.name, viewingAgent.type);
                const filteredTxs = applyDateRange(allTxs, dateRange, customFrom, customTo);

                const exportLedgerExcel = () => {
                    const rows = filteredTxs.map((r, idx) => ({
                        '#': idx + 1,
                        'Date': r.date || '',
                         'SAR Sent': Number(r.display_sent),
                         'Rate': r.rate,
                         'Received': Number(r.display_received),
                         'Running Balance': Number(viewingAgent.type === 'conversion_aed' ? r.running_aed : r.running_sar),
                        'Profit INR': Number(r.profit_inr || 0),
                        'Notes': r.notes || '',
                    }));
                    const ws = XLSX.utils.json_to_sheet(rows);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, viewingAgent.name);
                    XLSX.writeFile(wb, `conversion_${viewingAgent.name}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
                };

                return (
                    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setViewingAgent(null)}>
                        <div className="modal" style={{ maxWidth: '950px', width: '90%', maxHeight: '90vh' }}>
                            <div className="modal-header">
                                <div>
                                    <h3 className="modal-title">Conversion Ledger: {viewingAgent.name}</h3>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        {viewingAgent.type === 'conversion_aed' ? 'AED → INR' : 'SAR → AED'} conversions handled by this agent
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button className="btn btn-outline btn-sm" onClick={exportLedgerExcel} title="Export to Excel">
                                        <Download size={14} /> Excel
                                    </button>
                                    <button className="close-btn" onClick={() => setViewingAgent(null)}><X size={20} /></button>
                                </div>
                            </div>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
                                {/* Filters */}
                                <div className="flex flex-wrap gap-2">
                                    {DATE_RANGES.map(r => (
                                        <button key={r} onClick={() => setDateRange(r)}
                                            className={`btn btn-sm ${dateRange === r ? 'btn-accent' : 'btn-outline'}`}>{r}</button>
                                    ))}
                                    {dateRange === 'Custom' && (
                                        <>
                                            <input type="date" className="form-input" style={{ maxWidth: 130, padding: '4px 8px', fontSize: 13 }}
                                                value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                                            <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>to</span>
                                            <input type="date" className="form-input" style={{ maxWidth: 130, padding: '4px 8px', fontSize: 13 }}
                                                value={customTo} onChange={e => setCustomTo(e.target.value)} />
                                        </>
                                    )}
                                </div>

                                <div className="table-wrapper" style={{ flex: 1 }}>
                                    <table className="data-table" style={{ fontSize: 13 }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: 40 }}>#</th>
                                                <th>Type / Ref</th>
                                                <th>Date</th>
                                                <th style={{ textAlign: 'right' }}>{viewingAgent.type === 'conversion_aed' ? 'Sent (AED)' : 'Sent (SAR)'}</th>
                                                <th style={{ textAlign: 'center' }}>Rate</th>
                                                <th style={{ textAlign: 'right' }}>{viewingAgent.type === 'conversion_aed' ? 'Received (INR)' : 'Received (AED)'}</th>
                                                <th style={{ textAlign: 'right' }}>Profit (INR)</th>
                                                <th style={{ textAlign: 'right' }}>Balance</th>
                                                <th>Notes</th>
                                                <th style={{ textAlign: 'right' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTxs.length === 0 ? (
                                                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>No conversion records found.</td></tr>
                                            ) : (
                                                filteredTxs.map((r, idx) => {
                                                    const isAedToInr = viewingAgent.type === 'conversion_aed';
                                                    return (
                                                        <tr key={r.$id}>
                                                            <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                                                            <td>
                                                                <span className={`badge ${r.record_type.includes('bulk') ? 'badge-completed' : 'badge-collector'}`}>
                                                                    {r.record_type.includes('bulk') ? 'BULK' : 'INDV'}
                                                                </span>
                                                                {!r.record_type.includes('bulk') && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>#{r.tx_id}</div>}
                                                            </td>
                                                            <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                                                                <div className="flex items-center gap-1"><Calendar size={12} /> {r.date_time ? format(r.date_time, 'dd MMM yy') : ''}</div>
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 700, color: isAedToInr ? 'var(--brand-gold)' : undefined }}>
                                                                {Number(r.display_sent).toLocaleString()}
                                                            </td>
                                                            <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                                {r.rate || '—'}
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 700, color: isAedToInr ? 'var(--text-primary)' : 'var(--brand-gold)' }}>
                                                                +{Number(r.display_received).toLocaleString(isAedToInr ? 'en-IN' : undefined)}
                                                            </td>
                                                            <td style={{ textAlign: 'right', color: r.profit_inr >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)', fontWeight: 600 }}>
                                                                {r.profit_inr ? (r.profit_inr >= 0 ? '+' : '') + '₹' + Number(r.profit_inr).toLocaleString('en-IN') : '—'}
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 800, color: (isAedToInr ? r.running_aed : r.running_sar) >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)' }}>
                                                                {(isAedToInr ? r.running_aed : r.running_sar) < 0 ? '-' : ''}{Math.abs(Number(isAedToInr ? r.running_aed : r.running_sar)).toLocaleString()} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{isAedToInr ? 'AED' : 'SAR'}</span>
                                                            </td>
                                                            <td style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {r.notes || r.client_name || '—'}
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <button style={{ marginRight: 6 }} className="btn btn-outline btn-sm btn-icon" onClick={() => {
                                                                    if (r.record_type === 'tx_sar_aed') window.open(`/transactions?q=${r.tx_id}`, '_blank');
                                                                    else if (r.record_type === 'bulk_aed_inr') window.open(`/expenses`, '_blank');
                                                                    else if (r.record_type === 'deposit' || r.record_type === 'receipt') window.open(`/reports`, '_blank');
                                                                    else toast.error('Bulk SAR->AED edits not yet implemented here');
                                                                }}>
                                                                    <Pencil size={12} />
                                                                </button>
                                                                <button className="btn btn-danger btn-sm btn-icon" onClick={(e) => handleDeleteRecord(e, r)} title="Delete Record">
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>GRAND TOTAL</td>
                                                <td style={{ textAlign: 'right', fontWeight: 800, color: viewingAgent.type === 'conversion_aed' ? 'var(--brand-gold)' : undefined }}>
                                                    {filteredTxs.reduce((a, r) => a + (Number(r.display_sent) || 0), 0).toLocaleString()}
                                                </td>
                                                <td></td>
                                                <td style={{ textAlign: 'right', fontWeight: 800, color: viewingAgent.type === 'conversion_aed' ? 'var(--text-primary)' : 'var(--brand-gold)' }}>
                                                    {filteredTxs.reduce((a, r) => a + (Number(r.display_received) || 0), 0).toLocaleString(viewingAgent.type === 'conversion_aed' ? 'en-IN' : undefined)}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand-accent)' }}>
                                                    ₹{filteredTxs.reduce((a, r) => a + (Number(r.profit_inr) || 0), 0).toLocaleString('en-IN')}
                                                </td>
                                                <td></td>
                                                <td colSpan={2}></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Modal */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">{editItem ? 'Edit Conversion Agent' : 'Add Conversion Agent'}</h3>
                            <button className="close-btn" onClick={() => setModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Conversion Type *</label>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        {CONV_TYPES.map(ct => (
                                            <label key={ct.value} style={{
                                                flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                                                border: `2px solid ${form.type === ct.value ? ct.color : 'var(--border-color)'}`,
                                                borderRadius: 10, cursor: 'pointer',
                                                background: form.type === ct.value ? ct.bg : 'transparent',
                                                transition: 'all 0.15s'
                                            }}>
                                                <input type="radio" name="conv_type" value={ct.value}
                                                    checked={form.type === ct.value}
                                                    onChange={() => setForm({ ...form, type: ct.value })}
                                                    style={{ accentColor: ct.color }} />
                                                <span style={{ fontWeight: 700, color: ct.color, fontSize: 14 }}>{ct.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Full Name *</label>
                                    <input id="ca-name" className="form-input" placeholder="Agent name"
                                        value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>
                                <div className="form-row" style={{ display: 'flex', gap: 12 }}>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label">Phone</label>
                                        <input id="ca-phone" className="form-input" placeholder="+966 5X XXX XXXX"
                                            value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                                    </div>
                                    {(user?.role === 'admin' || user?.role === 'collector') && (
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label className="form-label">
                                                Balance ({form.type === 'conversion_sar' ? 'SAR' : 'AED'})
                                            </label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                step="any"
                                                value={form.type === 'conversion_sar' ? form.sar_balance : form.aed_balance}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    if (form.type === 'conversion_sar') setForm({ ...form, sar_balance: val });
                                                    else setForm({ ...form, aed_balance: val });
                                                }}
                                                style={{ border: '1px solid var(--brand-accent)', background: 'rgba(0,255,150,0.05)' }}
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notes</label>
                                    <textarea id="ca-notes" className="form-textarea" placeholder="Additional info…"
                                        value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
                                <button id="save-ca-btn" type="submit" className="btn btn-accent" disabled={saving}>
                                    {saving ? 'Saving…' : editItem ? 'Update' : 'Add Agent'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Deposit Modal */}
            {depositModal && activeAgent && (() => {
                const incByCur = (cur) => expenseRecs.filter(e => e.type === 'income' && e.currency === cur).reduce((a, e) => a + (Number(e.amount) || 0), 0);
                const expByCur = (cur) => expenseRecs.filter(e => e.type === 'expense' && e.currency === cur).reduce((a, e) => a + (Number(e.amount) || 0), 0);
                const sumF = (arr, field) => arr.reduce((a, r) => a + (Number(r[field]) || 0), 0);

                let availBal = 0;
                let availCur = '';
                if (activeAgent.type === 'conversion_sar') {
                    const totalSARConverted = sumF(convRecs, 'sar_amount');
                    availBal = incByCur('SAR') - expByCur('SAR') - totalSARConverted;
                    availCur = 'SAR';
                } else {
                    const totalAEDFromConversions = sumF(convRecs, 'aed_amount');
                    availBal = incByCur('AED') + totalAEDFromConversions - expByCur('AED');
                    availCur = 'AED';
                }
                availBal = Math.max(0, availBal);

                return (
                    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDepositModal(false)}>
                        <div className="modal-content" style={{ maxWidth: 400, background: 'var(--bg-card)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 className="modal-title" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Deposit to {activeAgent.name}</h3>
                                <button className="close-btn" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setDepositModal(false)}><X size={20} /></button>
                            </div>
                            <form style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }} onSubmit={handleDepositSubmit}>
                                <div style={{ padding: 12, background: 'rgba(74,158,255,0.1)', border: '1px solid rgba(74,158,255,0.2)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 13, color: '#4a9eff' }}>Available {availCur} to Deposit:</span>
                                    <span style={{ fontSize: 16, fontWeight: 800, color: '#4a9eff' }}>
                                        {availBal.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span style={{ fontSize: 13 }}>{availCur}</span>
                                    </span>
                                </div>
                                <div style={{ padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Agent's Owed Debt:</span>
                                    <span style={{ fontSize: 15, fontWeight: 700, color: activeAgent.type === 'conversion_sar' ? '#4a9eff' : 'var(--brand-gold)' }}>
                                        {activeAgent.type === 'conversion_sar' ? `${(Number(activeAgent.sar_balance) || 0).toLocaleString()} SAR` : `${(Number(activeAgent.aed_balance) || 0).toLocaleString()} AED`}
                                    </span>
                                </div>
                                <div className="form-group">
                                    <label className="form-label" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Deposit Amount ({activeAgent.type === 'conversion_sar' ? 'SAR' : 'AED'})</label>
                                    <input className="form-input" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)', color: '#fff' }} type="number" step="any" required
                                        value={actionAmount} onChange={e => setActionAmount(e.target.value)} />
                                </div>
                                <div style={{ marginTop: 8, padding: 12, background: 'rgba(74,158,255,0.1)', borderRadius: 8, fontSize: 13, color: '#4a9eff' }}>
                                    Money will stay in <b>{activeAgent.type === 'conversion_sar' ? 'SAR' : 'AED'}</b> until you receive converted funds from the agent.
                                </div>
                                <div className="modal-actions" style={{ marginTop: 8, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                                    <button type="button" className="btn btn-outline" style={{ padding: '8px 16px', borderRadius: 8 }} onClick={() => setDepositModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-accent" style={{ padding: '8px 16px', borderRadius: 8 }} disabled={saving}>
                                        {saving ? 'Processing...' : 'Confirm Deposit'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}

            {/* Receive Modal */}
            {receiveModal && activeAgent && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setReceiveModal(false)}>
                    <div className="modal-content" style={{ maxWidth: 400, background: 'var(--bg-card)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 className="modal-title" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Receive from {activeAgent.name}</h3>
                            <button className="close-btn" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setReceiveModal(false)}><X size={20} /></button>
                        </div>
                        <form style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }} onSubmit={handleReceiveSubmit}>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                                Specify how much <b>{activeAgent.type === 'conversion_sar' ? 'SAR' : 'AED'}</b> is being cleared
                                and at what rate. The resulting {activeAgent.type === 'conversion_sar' ? 'AED' : 'INR'} will be credited to our ledger.
                            </p>
                            <div style={{ padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Currently Owed:</span>
                                <span style={{ fontSize: 15, fontWeight: 700, color: activeAgent.type === 'conversion_sar' ? '#4a9eff' : 'var(--brand-gold)' }}>
                                    {activeAgent.type === 'conversion_sar' ? `${(Number(activeAgent.sar_balance) || 0).toLocaleString()} SAR` : `${(Number(activeAgent.aed_balance) || 0).toLocaleString()} AED`}
                                </span>
                            </div>
                            <div className="form-group">
                                <label className="form-label" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Source Amount Settled ({activeAgent.type === 'conversion_sar' ? 'SAR' : 'AED'})</label>
                                <input className="form-input" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)', color: '#fff' }} type="number" step="any" required
                                    value={actionAmount} onChange={e => setActionAmount(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label className="form-label" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Exchange Rate</label>
                                <input className="form-input" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)', color: '#fff' }} type="number" step="any" required
                                    value={actionRate} onChange={e => setActionRate(e.target.value)} />
                            </div>
                            {actionAmount && actionRate && (
                                <div style={{ marginTop: 8, padding: 12, background: 'rgba(74,158,255,0.1)', borderRadius: 8, fontSize: 14, color: '#4a9eff', fontWeight: 600 }}>
                                    Result: {(Number(actionAmount) * Number(actionRate)).toLocaleString()} {activeAgent.type === 'conversion_sar' ? 'AED' : 'INR'} will be added to ledger
                                </div>
                            )}
                            <div className="modal-actions" style={{ marginTop: 8, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-outline" style={{ padding: '8px 16px', borderRadius: 8 }} onClick={() => setReceiveModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-accent" style={{ padding: '8px 16px', borderRadius: 8 }} disabled={saving}>
                                    {saving ? 'Processing...' : 'Confirm Receipt'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )
            }

        </Layout >
    );
}
