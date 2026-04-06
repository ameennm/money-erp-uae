import { useState, useEffect, useRef } from 'react';
import { dbService } from '../lib/appwrite';
import { ledgerService } from '../lib/ledgerService';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
    Plus, X, Pencil, Trash2, Download
} from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

// Filter components
import { SearchInput, DateRangeFilter, FilterBar } from '../components/filters';
import { applyDateRange, round2 } from '../utils/filterHelpers';
import { TRANSACTION_STATUSES } from '../constants';

const START_TX_NUM = 20261;
const genTxId = (existingTxs) => {
    let max = START_TX_NUM - 1;
    for (const tx of existingTxs) {
        const n = parseInt(tx.tx_id, 10);
        if (!isNaN(n) && n > max) max = n;
    }
    return String(max + 1);
};

const statusBadge = (s) => {
    const cfg = TRANSACTION_STATUSES.find(x => x.value === s) || TRANSACTION_STATUSES[0];
    return <span className={`badge ${cfg.badge}`}>{cfg.label}</span>;
};

const EMPTY = {
    client_name: '',
    inr_requested: '',
    collected_currency: '',
    collected_amount: '',
    collection_rate: '',
    sar_to_aed_rate: '',
    actual_aed: '',
    aed_to_inr_rate: '',
    actual_inr_distributed: '',
    profit_aed: '',
    profit_inr: '',
    notes: '',
    status: '',
    collection_agent_id: '',
    collection_agent_name: '',
    conversion_agent_id: '',
    conversion_agent_name: '',
    distributor_id: '',
    distributor_name: '',
    is_petty_cash: 0,
};

export default function TransactionsPage() {
    const { role, user } = useAuth();
    const isAdmin = role === 'admin';
    const isCollector = role === 'collector' || isAdmin;
    const isCollectorOnly = role === 'collector';

    const [txs, setTxs] = useState([]);
    const [agents, setAgents] = useState([]);
    const [settings, setSettings] = useState({ min_sar_rate: 0, min_aed_rate: 0 });
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState({ range: 'All Time', customFrom: '', customTo: '' });
    const [_loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [editTx, setEditTx] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const isSavingRef = useRef(false);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [txRes, agRes, sRes] = await Promise.all([
                dbService.listTransactions(),
                dbService.listAgents(),
                dbService.getSettings(),
            ]);
            setTxs(txRes.documents);
            setAgents(agRes.documents);
            setSettings(sRes);
        } catch (e) { toast.error('Failed to load: ' + e.message); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchAll(); }, []);

    // ── Calculations ──────────────────────────────────────────────────────────


    // Calculate INR profit from rate spread: (actual_rate - min_rate) / 1000 * inr_requested
    const calcProfitInr = (collectionRate, currency, inrRequested) => {
        const minRate = currency === 'AED' ? (settings.min_aed_rate || 0) : (settings.min_sar_rate || 0);
        const rate = parseFloat(collectionRate) || 0;
        const inr = parseFloat(inrRequested) || 0;
        if (minRate <= 0 || rate <= minRate) return 0;
        return round2((rate - minRate) / 1000 * inr);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (isSavingRef.current) return;

        const { is_petty_cash } = form;
        const isRequired = !is_petty_cash;

        // Validation: If petty cash and no target, still allowed (general migration)
        // If not petty cash, standard validation
        if (isRequired) {
            if (!form.client_name || !form.inr_requested || !form.collection_agent_id || !form.collection_rate || !form.collected_amount || !form.distributor_id) {
                return toast.error('Please fill all required fields');
            }
        } else {
            // Migration mode validation
            if (!form.collected_amount) return toast.error('Please enter the migration amount');
        }

        isSavingRef.current = true;
        setSaving(true);
        try {
            const payload = { ...form };

            // Use round2 for all amounts to avoid float issues
            payload.inr_requested = round2(form.inr_requested);
            payload.collected_amount = round2(form.collected_amount);

            // Clean optional floats
            const optionalFloats = ['collection_rate', 'sar_to_aed_rate', 'actual_aed', 'aed_to_inr_rate', 'actual_inr_distributed', 'profit_aed', 'profit_inr'];
            optionalFloats.forEach(f => {
                if (payload[f] === '' || payload[f] === undefined) {
                    delete payload[f];
                } else if (!isNaN(parseFloat(payload[f]))) {
                    payload[f] = round2(payload[f]);
                }
            });

            if (editTx) {
                if (isCollectorOnly) {
                    payload.edit_pending_approval = true;
                    await dbService.updateTransaction(editTx.$id, payload);
                    toast.success('Edit submitted — awaiting admin approval');
                    // Optimistic: update tx in state
                    setTxs(prev => prev.map(t => t.$id === editTx.$id ? { ...t, ...payload } : t));
                } else {
                    payload.edit_pending_approval = false;

                    // ── Reverse all ledger entries for this transaction ──
                    await ledgerService.reverseEntry(editTx.$id, 'transaction', 'EDIT REVERSAL: ');

                    // ── Record new ledger entries based on NEW payload ──
                    const dist = agents.find(a => a.$id === payload.distributor_id);
                    if (dist && payload.status === 'completed') {
                        await ledgerService.recordEntry({
                            agent: dist,
                            amount: payload.inr_requested,
                            currency: 'INR',
                            type: 'credit', // Agent gave INR to client
                            reference_type: 'transaction',
                            reference_id: editTx.$id,
                            description: `TX #${payload.tx_id} - Outgoing INR for ${payload.client_name} (Revised)`
                        });
                    }

                    const colAgent = agents.find(a => a.$id === payload.collection_agent_id);
                    if (colAgent) {
                        await ledgerService.recordEntry({
                            agent: colAgent,
                            amount: payload.collected_amount,
                            currency: payload.collected_currency,
                            type: 'debit', // Agent received SAR from client
                            reference_type: 'transaction',
                            reference_id: editTx.$id,
                            description: `TX #${payload.tx_id} - Collected from ${payload.client_name} (Revised)`
                        });
                    }

                    if (payload.conversion_agent_id && (payload.status === 'pending_distribution' || payload.status === 'completed')) {
                        const convAgent = agents.find(a => a.$id === payload.conversion_agent_id);
                        if (convAgent) {
                            await ledgerService.recordEntry({
                                agent: convAgent,
                                amount: payload.collected_amount,
                                currency: payload.collected_currency,
                                type: 'debit', // Agent received SAR to convert
                                reference_type: 'transaction',
                                reference_id: editTx.$id,
                                description: `TX #${payload.tx_id} - Conversion for ${payload.client_name} (Revised)`
                            });
                        }
                    }

                    // ── Calculate INR profit from rate spread ──
                    const profitInr = calcProfitInr(payload.collection_rate, payload.collected_currency, payload.inr_requested);
                    if (profitInr > 0) payload.profit_inr = profitInr;

                    await dbService.updateTransaction(editTx.$id, payload);
                    toast.success('Transaction Updated successfully');
                    fetchAll(); // Refresh to ensure state is consistent
                }
            } else {
                if (payload.is_petty_cash) {
                    // ── PETTY CASH / MIGRATION LOGIC ──
                    const amt = parseFloat(payload.collected_amount) || 0;
                    const type = amt >= 0 ? 'debit' : 'credit'; // Positive = Business Debit (They owe us)
                    const absAmt = Math.abs(amt);
                    const targetId = payload.collection_agent_id || payload.distributor_id;
                    const target = agents.find(a => a.$id === targetId);

                    payload.tx_id = genTxId(txs);
                    payload.client_name = payload.client_name || 'Migration / Petty Cash';
                    payload.status = 'completed';
                    payload.collected_amount = amt;
                    
                    // Determine currency based on selection
                    let cur = 'INR';
                    if (payload.collection_agent_id && target) {
                        cur = target.currency || 'SAR';
                    }

                    const created = await dbService.createTransaction(payload);

                    if (target) {
                        await ledgerService.recordEntry({
                            agent: target,
                            amount: absAmt,
                            currency: cur,
                            type: type,
                            reference_type: 'transaction',
                            reference_id: created.$id,
                            description: `MIGRATION: Initial balance for ${target.name}`
                        });
                    }
                    toast.success('Migration record created');
                } else {
                    // ── STANDARD TRANSACTION LOGIC ──
                    if (!payload.distributor_id) {
                        isSavingRef.current = false;
                        setSaving(false);
                        return toast.error('Please select a Distributor');
                    }

                    // ── Min rate enforcement ──
                    const currency = form.collected_currency;
                    const minRate = currency === 'AED' ? (settings.min_aed_rate || 0) : (settings.min_sar_rate || 0);
                    const collRate = parseFloat(form.collection_rate) || 0;
                    if (minRate > 0 && collRate < minRate) {
                        isSavingRef.current = false;
                        setSaving(false);
                        return toast.error(
                            `This amount can't be entered. Please check the rate and try again.`,
                            { duration: 5000 }
                        );
                    }

                    payload.tx_id = genTxId(txs);
                    payload.creator_id = user.$id;
                    payload.creator_name = user.name;
                    payload.status = 'completed';
                    payload.actual_inr_distributed = round2(payload.inr_requested);

                    const created = await dbService.createTransaction(payload);

                    // ── Update distributor balance and ledger ──
                    const dist = agents.find(a => a.$id === payload.distributor_id);
                    if (dist) {
                        await ledgerService.recordEntry({
                            agent: dist,
                            amount: payload.inr_requested,
                            currency: 'INR',
                            type: 'credit', // Agent gave INR to client
                            reference_type: 'transaction',
                            reference_id: created.$id,
                            description: `TX #${payload.tx_id} - Outgoing INR for ${payload.client_name}`
                        });
                    }

                    // ── Update collection agent's balance and ledger ──
                    if (payload.collection_agent_id) {
                        const agent = agents.find(a => a.$id === payload.collection_agent_id);
                        if (agent) {
                            await ledgerService.recordEntry({
                                agent: agent,
                                amount: payload.collected_amount,
                                currency: payload.collected_currency,
                                type: 'debit', // Agent received SAR from client
                                reference_type: 'transaction',
                                reference_id: created.$id,
                                description: `TX #${payload.tx_id} - Collected from ${payload.client_name}`
                            });
                        }
                    }

                    // ── Update conversion agent's balance and ledger ──
                    if (payload.conversion_agent_id) {
                        const convAgent = agents.find(a => a.$id === payload.conversion_agent_id);
                        if (convAgent) {
                            await ledgerService.recordEntry({
                                agent: convAgent,
                                amount: payload.collected_amount,
                                currency: payload.collected_currency,
                                type: 'debit', // Agent received SAR to convert
                                reference_type: 'transaction',
                                reference_id: created.$id,
                                description: `TX #${payload.tx_id} - Conversion for ${payload.client_name}`
                            });
                        }
                    }
                    toast.success('Transaction Logged');
                }
                fetchAll(); // Refresh everything to be safe
            }
            setModal(false);
        } catch (e) { toast.error(e.message); }
        finally {
            isSavingRef.current = false;
            setSaving(false);
        }
    };

    const handleApproveEdit = async (tx) => {
        try {
            await dbService.updateTransaction(tx.$id, { edit_pending_approval: false });
            toast.success(`Edit approved for TX #${tx.tx_id}`);
            // Optimistic: update in state
            setTxs(prev => prev.map(t => t.$id === tx.$id ? { ...t, edit_pending_approval: false } : t));
        } catch (e) { toast.error('Approve failed: ' + e.message); }
    };

    const openEdit = (tx) => {
        setEditTx(tx);
        setForm({ ...tx });
        setModal(true);
    };

    const handleDelete = async (tx) => {
        if (!isAdmin) return toast.error('Only admins can delete transactions');
        if (!confirm(`Delete transaction #${tx.tx_id} for ${tx.client_name}? This cannot be undone.`)) return;
        try {
            // ── Reverse all ledger entries for this transaction ──
            await ledgerService.reverseEntry(tx.$id, 'transaction');

            await dbService.deleteTransaction(tx.$id);
            toast.success(`Transaction #${tx.tx_id} deleted`);
            fetchAll(); // Refresh to ensure state is consistent
        } catch (e) {
            toast.error('Delete failed: ' + e.message);
        }
    };

    const filtered = applyDateRange(txs, dateRange.range, dateRange.customFrom, dateRange.customTo).filter(tx =>
        tx.client_name?.toLowerCase().includes(search.toLowerCase()) ||
        tx.tx_id?.includes(search)
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
            'Profit INR': tx.profit_inr || 0,
            'Status': tx.status || '',
            'Notes': tx.notes || '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const colWidths = Object.keys(rows[0]).map(key => ({
            wch: Math.max(key.length, ...rows.map(r => String(r[key]).length)) + 2
        }));
        ws['!cols'] = colWidths;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
        const fileName = `Transactions_${dateRange.range.replace(/\s/g, '_')}_${format(new Date(), 'dd-MMM-yyyy')}.xlsx`;
        XLSX.writeFile(wb, fileName);
        toast.success(`Downloaded ${filtered.length} transactions`);
    };

    // Derive min rate hint for form
    const minRateForCurrency = form.collected_currency === 'AED'
        ? (settings.min_aed_rate || 0)
        : (settings.min_sar_rate || 0);

    // Preview profit in form
    const previewProfit = form.collection_rate && form.inr_requested
        ? calcProfitInr(form.collection_rate, form.collected_currency, form.inr_requested)
        : 0;

    return (
        <Layout title="Transactions">
            <FilterBar>
                <DateRangeFilter
                    value={dateRange}
                    onChange={setDateRange}
                />
                <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search client or ID..."
                />
                <div className="flex gap-2 flex-wrap ml-auto">
                    {isAdmin && (
                        <button className="btn btn-outline" onClick={exportToExcel} title="Download as Excel">
                            <Download size={16} /> Excel
                        </button>
                    )}
                    {isCollector && (
                        <button className="btn btn-accent" onClick={() => { setForm(EMPTY); setEditTx(null); setModal(true); }}>
                            <Plus size={16} /> <span className="hide-on-mobile">New Transaction</span><span className="show-on-mobile">New</span>
                        </button>
                    )}
                </div>
            </FilterBar>

            <div className="card">
                <div className="table-wrapper">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: 100 }}>TX ID</th>
                                <th>Client</th>
                                <th style={{ textAlign: 'right', width: 140 }}>Requested</th>
                                <th style={{ textAlign: 'right', width: 160 }}>Amount</th>
                                <th>Agent</th>
                                {isAdmin && <th style={{ textAlign: 'right', width: 120 }}>Profit</th>}
                                {isAdmin && <th>Distributor</th>}
                                <th style={{ width: 120 }}>Status</th>
                                <th style={{ width: 100 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(tx => {
                                const profitVal = Number(tx.profit_inr) || 0;
                                return (
                                    <tr key={tx.$id} style={tx.edit_pending_approval ? { background: 'rgba(255,170,50,0.06)', outline: '1px solid rgba(255,170,50,0.25)' } : {}}>
                                        <td className="font-bold">
                                            #{tx.tx_id}
                                            {tx.edit_pending_approval && (
                                                <span style={{ marginLeft: 6, fontSize: 10, background: '#ffaa32', color: '#000', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>PENDING EDIT</span>
                                            )}
                                        </td>
                                        <td>{tx.client_name}</td>
                                        <td className="currency inr" style={{ textAlign: 'right', fontWeight: 600 }}>
                                            {!tx.is_petty_cash || (tx.distributor_id && tx.inr_requested) ? (
                                                <>₹{Number(tx.inr_requested || 0).toLocaleString('en-IN')}</>
                                            ) : '—'}
                                        </td>
                                        <td className={`currency ${(tx.collected_currency || 'SAR').toLowerCase()}`} style={{ textAlign: 'right', fontWeight: 600 }}>
                                            {tx.collected_amount?.toLocaleString()} <span style={{ fontSize: 10, opacity: 0.7 }}>{tx.collected_currency || 'SAR'}</span>
                                        </td>
                                        <td>{tx.collection_agent_name || '—'}</td>
                                        {isAdmin && (
                                            <td style={{ textAlign: 'right', color: profitVal > 0 ? 'var(--brand-accent)' : 'var(--text-muted)', fontWeight: profitVal > 0 ? 700 : 400 }}>
                                                {profitVal > 0 ? `${profitVal.toLocaleString('en-IN')}` : '—'}
                                            </td>
                                        )}
                                        {isAdmin && (
                                            <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                                {tx.distributor_name || '—'}
                                            </td>
                                        )}
                                        <td>{statusBadge(tx.status)}</td>
                                        <td>
                                            <div className="flex gap-2">
                                                {isCollector && (
                                                    <button className="btn btn-icon btn-sm" onClick={() => openEdit(tx)} title="Edit"><Pencil size={14} /></button>
                                                )}
                                                {isAdmin && tx.edit_pending_approval && (
                                                    <button className="btn btn-sm" style={{ background: '#22c55e', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12 }} onClick={() => handleApproveEdit(tx)} title="Approve Edit">✓ Approve</button>
                                                )}
                                                {isAdmin && (
                                                    <button className="btn btn-icon btn-sm btn-danger" onClick={() => handleDelete(tx)} title="Delete">
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
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
                                <div className="form-group" style={{ marginBottom: 20 }}>
                                    <label className="flex items-center gap-2 cursor-pointer p-3 rounded-xl transition-all" 
                                        style={{ 
                                            border: form.is_petty_cash ? '2px solid var(--brand-accent)' : '1px solid rgba(255,255,255,0.1)',
                                            background: form.is_petty_cash ? 'rgba(74,158,255,0.08)' : 'transparent'
                                        }}>
                                        <input
                                            type="checkbox"
                                            checked={form.is_petty_cash === 1}
                                            onChange={e => {
                                                const checked = e.target.checked;
                                                setForm({ ...EMPTY, is_petty_cash: checked ? 1 : 0 });
                                            }}
                                            className="w-5 h-5 rounded-md text-brand-accent focus:ring-brand-accent"
                                        />
                                        <div className="flex flex-col">
                                            <span style={{ fontSize: 14, fontWeight: 800, color: form.is_petty_cash ? 'var(--brand-accent)' : 'var(--text-primary)' }}>MIGRATION MODE (Petty Cash)</span>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Direct balance adjustment for historical data. Positive = They owe us.</span>
                                        </div>
                                    </label>
                                </div>

                                {form.is_petty_cash ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        <div className="form-group">
                                            <label className="form-label">Migration Description</label>
                                            <input className="form-input" placeholder="e.g. Opening Balance (Optional)" value={form.client_name}
                                                onChange={e => setForm({ ...form, client_name: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Target (Agent or Distributor)</label>
                                            <select className="form-select" value={form.collection_agent_id || form.distributor_id}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    const ag = agents.find(x => x.$id === val);
                                                    if (ag?.type === 'distributor') {
                                                        setForm({ ...form, distributor_id: val, collection_agent_id: '', distributor_name: ag.name, collected_currency: 'INR' });
                                                    } else {
                                                        setForm({ ...form, collection_agent_id: val, distributor_id: '', collection_agent_name: ag?.name || '', collected_currency: ag?.currency || 'SAR' });
                                                    }
                                                }}>
                                                <option value="">General Petty Cash (No Ledger)</option>
                                                <optgroup label="Agents">
                                                    {agents.filter(a => a.type !== 'distributor').map(a => <option key={a.$id} value={a.$id}>{a.name} ({a.currency || 'SAR'})</option>)}
                                                </optgroup>
                                                <optgroup label="Distributors">
                                                    {agents.filter(a => a.type === 'distributor').map(d => <option key={d.$id} value={d.$id}>{d.name} (INR)</option>)}
                                                </optgroup>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">
                                                Migration Amount ({
                                                    form.distributor_id ? 'INR' : 
                                                    (agents.find(a => a.$id === form.collection_agent_id)?.currency || 'SAR')
                                                })
                                            </label>
                                            <input className="form-input" type="number" step="any" required 
                                                autoFocus
                                                placeholder="Positive = They owe us, Negative = We owe them"
                                                value={form.collected_amount}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    const isDist = !!form.distributor_id;
                                                    setForm({ ...form, collected_amount: val, inr_requested: isDist ? val : '' });
                                                }}
                                                style={{ fontSize: 24, fontWeight: 800, padding: '12px 16px' }} />
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <span>💡</span>
                                                <span>Enter <b>Positive</b> if they have to pay us. Enter <b>Negative</b> if we have to pay them.</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <>
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
                                                <label className="form-label">Collection Agent *</label>
                                                <select className="form-select" required value={form.collection_agent_id}
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
                                                <label className="form-label">
                                                    Collection Rate (per 1000 INR)
                                                </label>
                                                <input className="form-input" type="number" step="0.01" required value={form.collection_rate}
                                                    placeholder="Enter rate"
                                                    style={{
                                                        borderColor: !editTx && form.collection_rate && minRateForCurrency > 0 && parseFloat(form.collection_rate) < minRateForCurrency
                                                            ? 'var(--status-failed)' : undefined
                                                    }}
                                                    onChange={e => {
                                                        const rate = parseFloat(e.target.value) || 0;
                                                        const inr = parseFloat(form.inr_requested) || 0;
                                                        const collected = rate > 0 ? (inr / 1000) * rate : form.collected_amount;
                                                        setForm({ ...form, collection_rate: e.target.value, collected_amount: rate > 0 ? collected.toFixed(2) : form.collected_amount });
                                                    }} />
                                                {!editTx && form.collection_rate && minRateForCurrency > 0 && parseFloat(form.collection_rate) < minRateForCurrency && (
                                                    <div style={{ fontSize: 11, color: 'var(--status-failed)', marginTop: 4 }}>
                                                        ⚠️ This amount can't be entered
                                                    </div>
                                                )}
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Amount Collected ({form.collected_currency})</label>
                                                <input className="form-input" type="number" step="0.01" required value={form.collected_amount}
                                                    readOnly style={{ backgroundColor: 'var(--bg-main)', opacity: 0.8 }} />
                                            </div>
                                        </div>

                                        {isAdmin && !editTx && previewProfit > 0 && (
                                            <div style={{ background: 'rgba(0,200,150,0.08)', border: '1px solid rgba(0,200,150,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                                    📈 Estimated Profit: <strong style={{ color: 'var(--brand-accent)' }}>{previewProfit.toLocaleString('en-IN')} {form.collected_currency}</strong>
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                                                        (rate spread: {parseFloat(form.collection_rate) - minRateForCurrency} × {form.inr_requested}/1000)
                                                    </span>
                                                </span>
                                            </div>
                                        )}

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="form-label">Distributor *</label>
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
                                                    {agents.filter(a => a.type === 'distributor').map(a => <option key={a.$id} value={a.$id}>{a.name} (Bal: ₹{round2(a.inr_balance || 0).toLocaleString('en-IN')})</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </>
                                )}
                                <div className="form-group">
                                    <label className="form-label">Notes</label>
                                    <textarea className="form-textarea" value={form.notes}
                                        onChange={e => setForm({ ...form, notes: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-accent" disabled={saving}>
                                    {form.is_petty_cash ? 'Confirm Migration' : 'Save Transaction'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
