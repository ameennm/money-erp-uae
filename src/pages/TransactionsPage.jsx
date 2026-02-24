import { useState, useEffect } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
    Plus, X, Pencil, Trash2, Search,
    ArrowLeftRight, Copy, CheckCircle,
    SendHorizonal, Banknote, PackageCheck, Download
} from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, isAfter } from 'date-fns';
import * as XLSX from 'xlsx';

const START_TX_NUM = 20261;
const genTxId = (existingTxs) => {
    let max = START_TX_NUM - 1;
    for (const tx of existingTxs) {
        const n = parseInt(tx.tx_id, 10);
        if (!isNaN(n) && n > max) max = n;
    }
    return String(max + 1);
};

const STATUSES = [
    { value: 'pending_collection', label: 'Pending Collection', badge: 'badge-pending' },
    { value: 'pending_conversion', label: 'Pending Conversion (SAR→AED)', badge: 'badge-inprogress' },
    { value: 'pending_distribution', label: 'Pending Distribution (AED→INR)', badge: 'badge-collector' },
    { value: 'completed', label: 'Completed', badge: 'badge-completed' },
];

const statusBadge = (s) => {
    const cfg = STATUSES.find(x => x.value === s) || STATUSES[0];
    return <span className={`badge ${cfg.badge}`}>{cfg.label}</span>;
};

const DATE_RANGES = ['Today', 'This Week', 'This Month', 'All Time', 'Custom'];

const applyDateRange = (txs, range, from, to) => {
    if (range === 'All Time') return txs;
    const now = new Date();
    let start;
    if (range === 'Today') start = startOfDay(now);
    if (range === 'This Week') start = startOfWeek(now, { weekStartsOn: 1 });
    if (range === 'This Month') start = startOfMonth(now);
    if (range === 'Custom') {
        return txs.filter(r => {
            const d = new Date(r.$createdAt);
            const f = from ? new Date(from) : null;
            const t = to ? new Date(to + 'T23:59:59') : null;
            return (!f || d >= f) && (!t || d <= t);
        });
    }
    return txs.filter(tx => isAfter(new Date(tx.$createdAt), start));
};

const sum = (arr, f) => arr.reduce((a, t) => a + (Number(t[f]) || 0), 0);

const EMPTY = {
    client_name: '',
    inr_requested: '',
    collected_currency: 'SAR',
    collected_amount: '',
    collection_rate: '',
    sar_to_aed_rate: '',
    actual_aed: '',
    aed_to_inr_rate: '',
    actual_inr_distributed: '',
    profit_aed: '',
    notes: '',
    status: '',
    collection_agent_id: '',
    collection_agent_name: '',
    conversion_agent_id: '',
    conversion_agent_name: '',
    distributor_id: '',
    distributor_name: '',
};

export default function TransactionsPage() {
    const { role, user } = useAuth();
    const isAdmin = role === 'admin';
    const isCollector = role === 'collector' || isAdmin;

    const [txs, setTxs] = useState([]);
    const [agents, setAgents] = useState([]);
    const [filter, setFilter] = useState('');
    const [dateRange, setDateRange] = useState('All Time');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [editTx, setEditTx] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [copiedId, setCopiedId] = useState(null);

    // Context-specific Modals
    const [convertModal, setConvertModal] = useState(false);
    const [distributeModal, setDistributeModal] = useState(false);
    const [activeTx, setActiveTx] = useState(null);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [txRes, agRes] = await Promise.all([
                dbService.listTransactions(),
                dbService.listAgents(),
            ]);
            setTxs(txRes.documents);
            setAgents(agRes.documents);
        } catch (e) { toast.error('Failed to load: ' + e.message); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchAll(); }, []);

    // ── Calculations ──────────────────────────────────────────────────────────
    const calculateProfit = (tx, sarToAed, aedToInr, distributedInr) => {
        let aedValue = 0;
        if (tx.collected_currency === 'AED') {
            aedValue = tx.collected_amount;
        } else {
            aedValue = tx.collected_amount * (parseFloat(sarToAed) || 0);
        }

        const aedCostOfInr = ((parseFloat(distributedInr) || 0) / 1000) * (parseFloat(aedToInr) || 0);
        return (aedValue - aedCostOfInr).toFixed(2);
    };

    const safeFloat = (num) => {
        let n = parseFloat(num);
        if (isNaN(n)) return 0;
        return Number.isInteger(n) ? n + 0.00001 : n;
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = { ...form };
            // Ensure numbers
            payload.inr_requested = safeFloat(form.inr_requested);
            payload.collected_amount = safeFloat(form.collected_amount);

            // Clean optional floats
            const optionalFloats = ['collection_rate', 'sar_to_aed_rate', 'actual_aed', 'aed_to_inr_rate', 'actual_inr_distributed', 'profit_aed'];
            optionalFloats.forEach(f => {
                if (payload[f] === '' || payload[f] === undefined) {
                    delete payload[f];
                } else if (!isNaN(parseFloat(payload[f]))) {
                    payload[f] = safeFloat(payload[f]);
                }
            });

            if (editTx) {
                await dbService.updateTransaction(editTx.$id, payload);
                toast.success('Updated');
            } else {
                if (!payload.distributor_id) {
                    setSaving(false);
                    return toast.error('Please select a Distributor');
                }

                payload.tx_id = genTxId(txs);
                payload.creator_id = user.$id;
                payload.creator_name = user.name;
                payload.status = 'completed';
                payload.actual_inr_distributed = safeFloat(payload.inr_requested);

                // Check distributor balance before deducting
                const dist = agents.find(a => a.$id === payload.distributor_id);
                if (dist) {
                    const currentBal = Number(dist.inr_balance) || 0;
                    if (payload.inr_requested > currentBal) {
                        setSaving(false);
                        return toast.error(
                            `Insufficient balance! ${dist.name} has ₹${currentBal.toLocaleString('en-IN')} but ₹${payload.inr_requested.toLocaleString('en-IN')} is needed. Deposit ₹${(payload.inr_requested - currentBal).toLocaleString('en-IN')} more.`,
                            { duration: 5000 }
                        );
                    }
                    const newBal = currentBal - payload.inr_requested;
                    await dbService.updateAgent(dist.$id, { inr_balance: safeFloat(newBal) });
                }

                await dbService.createTransaction(payload);
                toast.success('Transaction Logged');
            }
            setModal(false);
            fetchAll();
        } catch (e) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    const handleConversion = async (e) => {
        e.preventDefault();
        if (!form.conversion_agent_id) return toast.error('Select a conversion agent');
        setSaving(true);
        try {
            const sarRate = parseFloat(form.sar_to_aed_rate);
            const actualAed = activeTx.collected_amount * sarRate;

            await dbService.updateTransaction(activeTx.$id, {
                sar_to_aed_rate: sarRate,
                actual_aed: actualAed,
                status: 'pending_distribution',
                conversion_agent_id: form.conversion_agent_id,
                conversion_agent_name: form.conversion_agent_name
            });
            toast.success('Conversion Logged');
            setConvertModal(false);
            fetchAll();
        } catch (e) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    const handleDistribution = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const inrRate = parseFloat(form.aed_to_inr_rate);
            const inrDist = parseFloat(form.actual_inr_distributed);

            // Calculate Profit in AED
            const profit = calculateProfit(activeTx, activeTx.sar_to_aed_rate, inrRate, inrDist);

            const dist = agents.find(a => a.$id === (form.distributor_id || activeTx.distributor_id));
            if (dist) {
                const diff = inrDist - (activeTx.inr_requested || 0);
                if (diff !== 0) {
                    const newBal = (Number(dist.inr_balance) || 0) - diff;
                    await dbService.updateAgent(dist.$id, { inr_balance: parseFloat(newBal.toFixed(2)) });
                }
            }

            await dbService.updateTransaction(activeTx.$id, {
                aed_to_inr_rate: inrRate,
                actual_inr_distributed: inrDist,
                profit_aed: parseFloat(profit),
                status: 'completed',
                distributor_id: form.distributor_id || activeTx.distributor_id,
                distributor_name: form.distributor_name || activeTx.distributor_name
            });
            toast.success('Distribution Complete');
            setDistributeModal(false);
            fetchAll();
        } catch (e) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    const openEdit = (tx) => {
        setEditTx(tx);
        setForm({ ...tx });
        setModal(true);
    };

    const openConvert = (tx) => {
        setActiveTx(tx);
        setForm({
            ...EMPTY,
            sar_to_aed_rate: tx.sar_to_aed_rate || '',
            conversion_agent_id: (isAdmin || isCollector) ? (tx.conversion_agent_id || '') : user.$id,
            conversion_agent_name: (isAdmin || isCollector) ? (tx.conversion_agent_name || '') : user.name,
        });
        setConvertModal(true);
    };

    const openDistribute = (tx) => {
        setActiveTx(tx);
        setForm({
            ...EMPTY,
            aed_to_inr_rate: tx.aed_to_inr_rate || '',
            actual_inr_distributed: tx.inr_requested,
            distributor_id: (isAdmin || isCollector) ? (tx.distributor_id || '') : user.$id,
            distributor_name: (isAdmin || isCollector) ? (tx.distributor_name || '') : user.name,
        });
        setDistributeModal(true);
    };

    const handleDelete = async (tx) => {
        if (!confirm(`Delete transaction #${tx.tx_id} for ${tx.client_name}? This cannot be undone.`)) return;
        try {
            // Reverse distributor balance if transaction was completed
            if (tx.status === 'completed' && tx.distributor_id && tx.inr_requested) {
                const dist = agents.find(a => a.$id === tx.distributor_id);
                if (dist) {
                    const restored = (Number(dist.inr_balance) || 0) + Number(tx.inr_requested);
                    await dbService.updateAgent(dist.$id, { inr_balance: safeFloat(restored) });
                }
            }
            await dbService.deleteTransaction(tx.$id);
            toast.success(`Transaction #${tx.tx_id} deleted`);
            fetchAll();
        } catch (e) {
            toast.error('Delete failed: ' + e.message);
        }
    };

    const filtered = applyDateRange(txs, dateRange, customFrom, customTo).filter(tx =>
        tx.client_name?.toLowerCase().includes(filter.toLowerCase()) ||
        tx.tx_id?.includes(filter)
    );

    const exportToExcel = () => {
        if (filtered.length === 0) return toast.error('No transactions to export');
        const rows = filtered.map(tx => ({
            'TX ID': tx.tx_id || '',
            'Date': tx.$createdAt ? format(new Date(tx.$createdAt), 'dd-MM-yyyy HH:mm') : '',
            'Client Name': tx.client_name || '',
            'INR Requested': tx.inr_requested || 0,
            'Collected Currency': tx.collected_currency || '',
            'Collection Rate': tx.collection_rate || '',
            'Amount Collected': tx.collected_amount || 0,
            'Collection Agent': tx.collection_agent_name || '',
            'Distributor': tx.distributor_name || '',
            'INR Distributed': tx.actual_inr_distributed || 0,
            'Status': tx.status || '',
            'Notes': tx.notes || '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        // Auto-size columns
        const colWidths = Object.keys(rows[0]).map(key => ({
            wch: Math.max(key.length, ...rows.map(r => String(r[key]).length)) + 2
        }));
        ws['!cols'] = colWidths;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
        const fileName = `Transactions_${dateRange.replace(/\s/g, '_')}_${format(new Date(), 'dd-MMM-yyyy')}.xlsx`;
        XLSX.writeFile(wb, fileName);
        toast.success(`Downloaded ${filtered.length} transactions`);
    };

    return (
        <Layout title="Transactions">
            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <div className="flex gap-2">
                    {DATE_RANGES.map(r => (
                        <button key={r} onClick={() => setDateRange(r)}
                            className={`btn btn-sm ${dateRange === r ? 'btn-accent' : 'btn-outline'}`}>{r}</button>
                    ))}
                    {dateRange === 'Custom' && (
                        <>
                            <input type="date" className="form-input" style={{ maxWidth: 140, padding: '4px 8px', fontSize: 13 }}
                                value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                            <span style={{ color: 'var(--text-muted)' }}>to</span>
                            <input type="date" className="form-input" style={{ maxWidth: 140, padding: '4px 8px', fontSize: 13 }}
                                value={customTo} onChange={e => setCustomTo(e.target.value)} />
                        </>
                    )}
                </div>
                <div className="flex gap-3 flex-1 min-w-[300px]">
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input className="form-input" style={{ paddingLeft: 38 }} placeholder="Search client or ID..."
                            value={filter} onChange={e => setFilter(e.target.value)} />
                    </div>
                    {isAdmin && (
                        <button className="btn btn-outline" onClick={exportToExcel} title="Download as Excel">
                            <Download size={16} /> Excel
                        </button>
                    )}
                    {isCollector && (
                        <button className="btn btn-accent" onClick={() => { setForm(EMPTY); setEditTx(null); setModal(true); }}>
                            <Plus size={16} /> New Transaction
                        </button>
                    )}
                </div>
            </div>

            <div className="card">
                <div className="table-wrapper">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>TX ID</th>
                                <th>Client</th>
                                <th>Requested</th>
                                <th>Collected</th>
                                <th>Agent</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(tx => (
                                <tr key={tx.$id}>
                                    <td className="font-bold">#{tx.tx_id}</td>
                                    <td>{tx.client_name}</td>
                                    <td className="currency inr">₹{tx.inr_requested?.toLocaleString()}</td>
                                    <td className={`currency ${tx.collected_currency?.toLowerCase()}`}>
                                        {tx.collected_amount?.toLocaleString()} {tx.collected_currency}
                                    </td>
                                    <td>{tx.collection_agent_name || '—'}</td>
                                    <td>{statusBadge(tx.status)}</td>
                                    <td>
                                        <div className="flex gap-2">
                                            {isAdmin && (
                                                <button className="btn btn-icon btn-sm" onClick={() => openEdit(tx)} title="Edit"><Pencil size={14} /></button>
                                            )}
                                            <button className="btn btn-icon btn-sm btn-danger" onClick={() => handleDelete(tx)} title="Delete">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Creation Modal */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">{editTx ? 'Edit Transaction' : 'New Transaction Request'}</h3>
                            <button className="close-btn" onClick={() => setModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Client Name</label>
                                    <input className="form-input" required value={form.client_name}
                                        onChange={e => setForm({ ...form, client_name: e.target.value })} />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">INR Requested</label>
                                        <input className="form-input" type="number" required value={form.inr_requested}
                                            onChange={e => {
                                                const inr = parseFloat(e.target.value) || 0;
                                                const rate = parseFloat(form.collection_rate) || 0;
                                                const collected = rate > 0 ? (inr / 1000) * rate : form.collected_amount;
                                                setForm({ ...form, inr_requested: e.target.value, collected_amount: rate > 0 ? collected.toFixed(2) : form.collected_amount });
                                            }} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Collection Agent</label>
                                        <select className="form-select" value={form.collection_agent_id}
                                            onChange={e => {
                                                const a = agents.find(x => x.$id === e.target.value);
                                                setForm({
                                                    ...form,
                                                    collection_agent_id: e.target.value,
                                                    collection_agent_name: a?.name || '',
                                                    collected_currency: a?.currency || form.collected_currency
                                                });
                                            }}>
                                            <option value="">Select Agent</option>
                                            {agents.filter(a => a.type.startsWith('collection')).map(a => <option key={a.$id} value={a.$id}>{a.name} ({a.currency || 'SAR'})</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Collect In</label>
                                        <select className="form-select" value={form.collected_currency}
                                            onChange={e => setForm({ ...form, collected_currency: e.target.value })}>
                                            <option value="SAR">SAR</option>
                                            <option value="AED">AED</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Collection Rate (per 1000 INR)</label>
                                        <input className="form-input" type="number" step="0.01" required value={form.collection_rate}
                                            placeholder="e.g. 39.9"
                                            onChange={e => {
                                                const rate = parseFloat(e.target.value) || 0;
                                                const inr = parseFloat(form.inr_requested) || 0;
                                                const collected = rate > 0 ? (inr / 1000) * rate : form.collected_amount;
                                                setForm({ ...form, collection_rate: e.target.value, collected_amount: rate > 0 ? collected.toFixed(2) : form.collected_amount });
                                            }} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Amount Collected ({form.collected_currency})</label>
                                        <input className="form-input" type="number" step="0.01" required value={form.collected_amount}
                                            readOnly style={{ backgroundColor: 'var(--bg-main)', opacity: 0.8 }} />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Distributor (Auto-Deducts)</label>
                                        <select className="form-select" required value={form.distributor_id}
                                            onChange={e => {
                                                const a = agents.find(x => x.$id === e.target.value);
                                                setForm({
                                                    ...form,
                                                    distributor_id: e.target.value,
                                                    distributor_name: a?.name || ''
                                                });
                                            }}>
                                            <option value="">Select Distributor</option>
                                            {agents.filter(a => a.type === 'distributor').map(a => <option key={a.$id} value={a.$id}>{a.name} (Bal: ₹{a.inr_balance || 0})</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notes</label>
                                    <textarea className="form-textarea" value={form.notes}
                                        onChange={e => setForm({ ...form, notes: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-accent" disabled={saving}>Save Transaction</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Conversion Modal (SAR -> AED) */}
            {convertModal && activeTx && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConvertModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">SAR → AED Conversion</h3>
                        </div>
                        <form onSubmit={handleConversion}>
                            <div className="modal-body">
                                <div className="card mb-4" style={{ background: 'var(--bg-main)' }}>
                                    <p>Collected: <strong>{activeTx.collected_amount} SAR</strong></p>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Conversion Agent</label>
                                    <select className="form-select" required value={form.conversion_agent_id}
                                        onChange={e => {
                                            const a = agents.find(x => x.$id === e.target.value);
                                            setForm({ ...form, conversion_agent_id: e.target.value, conversion_agent_name: a?.name || '' });
                                        }}>
                                        <option value="">Select Agent</option>
                                        {agents.filter(a => a.type === 'conversion').map(a => <option key={a.$id} value={a.$id}>{a.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">SAR to AED Rate (Manual)</label>
                                    <input className="form-input" type="number" step="0.0001" required
                                        value={form.sar_to_aed_rate} onChange={e => setForm({ ...form, sar_to_aed_rate: e.target.value })}
                                        placeholder="e.g. 0.98" />
                                </div>
                                {form.sar_to_aed_rate > 0 && (
                                    <p className="mt-2 text-accent">Result: <strong>{(activeTx.collected_amount * form.sar_to_aed_rate).toFixed(2)} AED</strong></p>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setConvertModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-accent" disabled={saving}>Finalize Conversion</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Distribution Modal (AED -> INR) */}
            {distributeModal && activeTx && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDistributeModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">AED → INR Distribution</h3>
                        </div>
                        <form onSubmit={handleDistribution}>
                            <div className="modal-body">
                                <div className="card mb-4" style={{ background: 'var(--bg-main)' }}>
                                    <p>Requested: <strong>₹{activeTx.inr_requested}</strong></p>
                                    <p>AED Equivalent: <strong>{activeTx.actual_aed || activeTx.collected_amount} AED</strong></p>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Distributor (INR)</label>
                                    <select className="form-select" required value={form.distributor_id}
                                        onChange={e => {
                                            const a = agents.find(x => x.$id === e.target.value);
                                            setForm({ ...form, distributor_id: e.target.value, distributor_name: a?.name || '' });
                                        }}>
                                        <option value="">Select Distributor</option>
                                        {agents.filter(a => a.type === 'distributor').map(a => <option key={a.$id} value={a.$id}>{a.name} (Bal: ₹{a.inr_balance || 0})</option>)}
                                    </select>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">AED Cost per 1000 INR</label>
                                        <input className="form-input" type="number" step="0.01" required
                                            value={form.aed_to_inr_rate} onChange={e => setForm({ ...form, aed_to_inr_rate: e.target.value })}
                                            placeholder="e.g. 44.50" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">INR Actually Distributed</label>
                                        <input className="form-input" type="number" required
                                            value={form.actual_inr_distributed} onChange={e => setForm({ ...form, actual_inr_distributed: e.target.value })} />
                                    </div>
                                </div>
                                {form.aed_to_inr_rate > 0 && (
                                    <div className="mt-4 p-3 rounded" style={{ background: 'rgba(0,200,150,0.1)' }}>
                                        <p>Profit: <strong className="text-accent">{calculateProfit(activeTx, activeTx.sar_to_aed_rate, form.aed_to_inr_rate, form.actual_inr_distributed)} AED</strong></p>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setDistributeModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-accent" disabled={saving}>Complete Transaction</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
