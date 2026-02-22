import { useState, useEffect } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
    Plus, X, Pencil, Trash2, Search,
    ArrowLeftRight, Copy, CheckCircle,
    SendHorizonal, Banknote, PackageCheck
} from 'lucide-react';
import { format } from 'date-fns';

// ─── Unique TX ID ─────────────────────────────────────────────────────────────
const genTxId = () => {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TX-${ts}-${rand}`;
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUSES = [
    { value: 'pending', label: 'Pending', badge: 'badge-pending' },
    { value: 'sar_sent', label: 'SAR Sent to Agent', badge: 'badge-inprogress' },
    { value: 'aed_received', label: 'AED Received', badge: 'badge-collector' },
    { value: 'completed', label: 'Completed (INR)', badge: 'badge-completed' },
    { value: 'failed', label: 'Failed', badge: 'badge-failed' },
];

const statusBadge = (s) => {
    const cfg = STATUSES.find(x => x.value === s) || STATUSES[0];
    return <span className={`badge ${cfg.badge}`}>{cfg.label}</span>;
};

// ─── Empty form ───────────────────────────────────────────────────────────────
const EMPTY = {
    client_name: '', agent_id: '', agent_name: '',
    amount_sar: '', amount_given_sar: '',
    amount_aed: '', rate_aed_inr: '', amount_inr: '',
    notes: '', status: 'pending',
};

export default function TransactionsPage() {
    const { role } = useAuth();
    const isSuperAdmin = role === 'superadmin';
    const isCollector = role === 'collector';
    const isEmployee = role === 'employee';

    const [txs, setTxs] = useState([]);
    const [agents, setAgents] = useState([]);
    const [filter, setFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [editTx, setEditTx] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    // Employee inline INR update
    const [inrModal, setInrModal] = useState(false);
    const [inrTx, setInrTx] = useState(null);
    const [inrForm, setInrForm] = useState({ rate_aed_inr: '', amount_inr: '' });

    // ── Fetch ──────────────────────────────────────────────────────────────────
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

    // ── Auto-calc INR (employee) ───────────────────────────────────────────────
    const handleInrChange = (key, val) => {
        setInrForm(prev => {
            const next = { ...prev, [key]: val };
            const aed = parseFloat(inrTx?.amount_aed) || 0;
            const rate = parseFloat(next.rate_aed_inr) || 0;
            next.amount_inr = aed && rate ? (aed * rate).toFixed(2) : '';
            return next;
        });
    };

    // ── Form helpers ───────────────────────────────────────────────────────────
    const handleFormChange = (key, val) => {
        setForm(prev => {
            const next = { ...prev, [key]: val };
            if (key === 'agent_id') {
                const ag = agents.find(a => a.$id === val);
                next.agent_name = ag?.name || '';
            }
            return next;
        });
    };

    // ── Open modals ────────────────────────────────────────────────────────────
    const openNew = () => { setEditTx(null); setForm(EMPTY); setModal(true); };

    const openEdit = (tx) => {
        if (!isSuperAdmin) return;
        setEditTx(tx);
        setForm({
            client_name: tx.client_name || '',
            agent_id: tx.agent_id || '',
            agent_name: tx.agent_name || '',
            amount_sar: tx.amount_sar || '',
            amount_given_sar: tx.amount_given_sar || '',
            amount_aed: tx.amount_aed || '',
            rate_aed_inr: tx.rate_aed_inr || '',
            amount_inr: tx.amount_inr || '',
            notes: tx.notes || '',
            status: tx.status || 'pending',
        });
        setModal(true);
    };

    const openInrModal = (tx) => {
        setInrTx(tx);
        setInrForm({ rate_aed_inr: tx.rate_aed_inr || '', amount_inr: tx.amount_inr || '' });
        setInrModal(true);
    };

    // ── Save transaction ───────────────────────────────────────────────────────
    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                client_name: form.client_name,
                agent_id: form.agent_id,
                agent_name: form.agent_name,
                amount_sar: parseFloat(form.amount_sar) || 0,
                amount_given_sar: parseFloat(form.amount_given_sar) || 0,
                amount_aed: parseFloat(form.amount_aed) || 0,
                rate_aed_inr: parseFloat(form.rate_aed_inr) || 0,
                amount_inr: parseFloat(form.amount_inr) || 0,
                notes: form.notes,
                status: form.status,
            };
            if (editTx) {
                await dbService.updateTransaction(editTx.$id, payload);
                toast.success('Transaction updated');
            } else {
                payload.tx_id = genTxId();
                await dbService.createTransaction(payload);
                toast.success('Transaction created');
            }
            setModal(false);
            fetchAll();
        } catch (e) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    // ── Employee: save INR details ─────────────────────────────────────────────
    const handleInrSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await dbService.updateTransaction(inrTx.$id, {
                rate_aed_inr: parseFloat(inrForm.rate_aed_inr) || 0,
                amount_inr: parseFloat(inrForm.amount_inr) || 0,
                status: 'completed',
            });
            toast.success('Marked as Completed');
            setInrModal(false);
            fetchAll();
        } catch (e) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    // ── Collector batch status updates ─────────────────────────────────────────
    const batchUpdateStatus = async (fromStatus, toStatus, label) => {
        const targets = txs.filter(t => t.status === fromStatus);
        if (targets.length === 0) { toast.error(`No ${fromStatus} transactions found.`); return; }
        if (!window.confirm(`Mark all ${targets.length} "${fromStatus}" transactions as "${label}"?`)) return;
        try {
            await Promise.all(targets.map(t => dbService.updateTransaction(t.$id, { status: toStatus })));
            toast.success(`${targets.length} transactions updated → ${label}`);
            fetchAll();
        } catch (e) { toast.error(e.message); }
    };

    // ── Simple status update ───────────────────────────────────────────────────
    const handleStatusUpdate = async (tx, newStatus) => {
        try {
            await dbService.updateTransaction(tx.$id, { status: newStatus });
            toast.success('Status updated');
            fetchAll();
        } catch (e) { toast.error(e.message); }
    };

    // ── Delete ─────────────────────────────────────────────────────────────────
    const handleDelete = async (id) => {
        if (!window.confirm('Delete this transaction?')) return;
        try { await dbService.deleteTransaction(id); toast.success('Deleted'); fetchAll(); }
        catch (e) { toast.error(e.message); }
    };

    // ── Copy TX ID ─────────────────────────────────────────────────────────────
    const copyTxId = (id) => {
        navigator.clipboard.writeText(id);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    // ── Filter ─────────────────────────────────────────────────────────────────
    const filtered = txs.filter(tx => {
        const q = filter.toLowerCase();
        const matchText =
            tx.client_name?.toLowerCase().includes(q) ||
            tx.tx_id?.toLowerCase().includes(q) ||
            tx.agent_name?.toLowerCase().includes(q);
        const matchStatus = !statusFilter || tx.status === statusFilter;
        return matchText && matchStatus;
    });

    // ── Day-close summary (collector + superadmin) ─────────────────────────────
    const pendingTxs = txs.filter(t => t.status === 'pending');
    const sarSentTxs = txs.filter(t => t.status === 'sar_sent');
    const pendingSARSum = pendingTxs.reduce((a, t) => a + (Number(t.amount_given_sar) || 0), 0);
    const sarSentSARSum = sarSentTxs.reduce((a, t) => a + (Number(t.amount_given_sar) || 0), 0);

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <Layout title="Transactions">

            {/* ── Collector Day-Close Panel ───────────────────────────────────────── */}
            {(isCollector || isSuperAdmin) && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '16px',
                    marginBottom: '28px',
                }}>
                    {/* Step 1 — Send pending SAR to collection agent */}
                    <div className="card" style={{ border: '1px solid rgba(245,166,35,0.25)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: '10px', flexShrink: 0,
                                background: 'rgba(245,166,35,0.15)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', color: 'var(--status-pending)'
                            }}>
                                <SendHorizonal size={20} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                    Step 1 — Pending SAR to Send
                                </div>
                                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
                                    {pendingSARSum.toLocaleString()} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>SAR</span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 12px' }}>
                                    {pendingTxs.length} pending transaction{pendingTxs.length !== 1 ? 's' : ''}
                                </div>
                                <button
                                    id="btn-sar-sent"
                                    className="btn btn-sm"
                                    style={{ background: 'rgba(245,166,35,0.15)', color: 'var(--status-pending)', border: '1px solid rgba(245,166,35,0.3)' }}
                                    onClick={() => batchUpdateStatus('pending', 'sar_sent', 'SAR Sent to Agent')}
                                    disabled={pendingTxs.length === 0}
                                >
                                    Mark SAR Sent to Agent
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Step 2 — Confirm SAR→AED done */}
                    <div className="card" style={{ border: '1px solid rgba(74,158,255,0.25)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: '10px', flexShrink: 0,
                                background: 'rgba(74,158,255,0.15)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', color: 'var(--status-inprogress)'
                            }}>
                                <Banknote size={20} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                    Step 2 — SAR→AED Conversion Done
                                </div>
                                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
                                    {sarSentSARSum.toLocaleString()} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>SAR</span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 12px' }}>
                                    {sarSentTxs.length} sent transaction{sarSentTxs.length !== 1 ? 's' : ''} awaiting confirmation
                                </div>
                                <button
                                    id="btn-aed-received"
                                    className="btn btn-sm"
                                    style={{ background: 'rgba(74,158,255,0.15)', color: 'var(--status-inprogress)', border: '1px solid rgba(74,158,255,0.3)' }}
                                    onClick={() => batchUpdateStatus('sar_sent', 'aed_received', 'AED Received')}
                                    disabled={sarSentTxs.length === 0}
                                >
                                    Confirm AED Received
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Toolbar ────────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-6 gap-3" style={{ flexWrap: 'wrap' }}>
                <div className="flex gap-3" style={{ flex: 1, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                        <Search size={16} style={{
                            position: 'absolute', left: '12px', top: '50%',
                            transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none'
                        }} />
                        <input id="tx-search" className="form-input" placeholder="Search client, TX ID, agent…"
                            style={{ paddingLeft: '38px' }} value={filter}
                            onChange={e => setFilter(e.target.value)} />
                    </div>
                    <select id="tx-status-filter" className="form-select" style={{ maxWidth: '210px' }}
                        value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="">All Statuses</option>
                        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                </div>
                {(isSuperAdmin || isCollector) && (
                    <button id="new-tx-btn" className="btn btn-accent" onClick={openNew}>
                        <Plus size={16} /> New Transaction
                    </button>
                )}
            </div>

            {/* ── Table ──────────────────────────────────────────────────────────── */}
            <div className="card">
                {loading ? (
                    <div className="loading-screen" style={{ minHeight: '40vh' }}>
                        <div className="spinner" /><p>Loading…</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <ArrowLeftRight size={40} />
                        <p>No transactions found.</p>
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>TX ID</th>
                                    <th>Client</th>
                                    <th>Agent</th>
                                    <th>Amount (SAR)</th>
                                    <th>Given to Agent (SAR)</th>
                                    <th>AED Received</th>
                                    <th>Rate AED→INR</th>
                                    <th>INR Amount</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(tx => (
                                    <tr key={tx.$id}>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <span className="tx-id">{tx.tx_id || tx.$id.slice(0, 8)}</span>
                                                <button className="copy-btn" onClick={() => copyTxId(tx.tx_id || tx.$id)}>
                                                    {copiedId === (tx.tx_id || tx.$id)
                                                        ? <CheckCircle size={13} style={{ color: 'var(--brand-accent)' }} />
                                                        : <Copy size={13} />}
                                                </button>
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{tx.client_name}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{tx.agent_name || '—'}</td>
                                        <td><span className="currency sar">{Number(tx.amount_sar || 0).toLocaleString()} SAR</span></td>
                                        <td><span className="currency sar">{Number(tx.amount_given_sar || 0).toLocaleString()} SAR</span></td>
                                        <td><span className="currency aed">{Number(tx.amount_aed || 0).toLocaleString()} AED</span></td>
                                        <td style={{ color: 'var(--text-muted)' }}>{tx.rate_aed_inr || '—'}</td>
                                        <td><span className="currency inr">₹{Number(tx.amount_inr || 0).toLocaleString('en-IN')}</span></td>
                                        <td>{statusBadge(tx.status)}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                            {tx.$createdAt ? format(new Date(tx.$createdAt), 'dd MMM yyyy') : '—'}
                                        </td>
                                        <td>
                                            <div className="flex gap-2" style={{ flexWrap: 'nowrap' }}>
                                                {/* Employee: enter AED→INR rate and complete */}
                                                {isEmployee && tx.status === 'aed_received' && (
                                                    <button className="btn btn-accent btn-sm" onClick={() => openInrModal(tx)}>
                                                        <PackageCheck size={13} /> Convert INR
                                                    </button>
                                                )}
                                                {/* Super admin: edit & delete */}
                                                {isSuperAdmin && (
                                                    <>
                                                        <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(tx)}>
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(tx.$id)}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── New / Edit Transaction Modal ───────────────────────────────────── */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">{editTx ? 'Edit Transaction' : 'New Transaction'}</h3>
                            <button className="close-btn" onClick={() => setModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                {/* Client & Agent */}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Client Name *</label>
                                        <input id="form-client" className="form-input" placeholder="Enter client name"
                                            value={form.client_name}
                                            onChange={e => handleFormChange('client_name', e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Agent</label>
                                        <select id="form-agent" className="form-select"
                                            value={form.agent_id} onChange={e => handleFormChange('agent_id', e.target.value)}>
                                            <option value="">— Select Agent —</option>
                                            {agents.map(a => <option key={a.$id} value={a.$id}>{a.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* SAR section */}
                                <hr className="divider" />
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                                    SAR Collection
                                </p>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Amount Received from Client (SAR) *</label>
                                        <input id="form-sar" className="form-input" type="number" step="0.01" min="0"
                                            placeholder="0.00" value={form.amount_sar}
                                            onChange={e => handleFormChange('amount_sar', e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Amount Given to Agent (SAR) *</label>
                                        <input id="form-given-sar" className="form-input" type="number" step="0.01" min="0"
                                            placeholder="0.00" value={form.amount_given_sar}
                                            onChange={e => handleFormChange('amount_given_sar', e.target.value)} required />
                                    </div>
                                </div>

                                {/* AED→INR section — hidden from collector */}
                                {(isSuperAdmin || isEmployee) && (
                                    <>
                                        <hr className="divider" />
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                                            AED → INR Conversion (Employee)
                                        </p>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="form-label">AED Received</label>
                                                <input id="form-aed" className="form-input" type="number" step="0.01"
                                                    placeholder="0.00" value={form.amount_aed}
                                                    onChange={e => handleFormChange('amount_aed', e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Rate AED → INR</label>
                                                <input id="form-rate2" className="form-input" type="number" step="0.0001"
                                                    placeholder="e.g. 22.85" value={form.rate_aed_inr}
                                                    onChange={e => handleFormChange('rate_aed_inr', e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Amount (INR)</label>
                                                <input id="form-inr" className="form-input" type="number" step="0.01"
                                                    placeholder="0.00" value={form.amount_inr}
                                                    onChange={e => handleFormChange('amount_inr', e.target.value)} />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Status — super admin only */}
                                {isSuperAdmin && (
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select id="form-status" className="form-select"
                                            value={form.status} onChange={e => handleFormChange('status', e.target.value)}>
                                            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                        </select>
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label">Notes</label>
                                    <textarea id="form-notes" className="form-textarea" placeholder="Optional notes…"
                                        value={form.notes} onChange={e => handleFormChange('notes', e.target.value)} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
                                <button id="save-tx-btn" type="submit" className="btn btn-accent" disabled={saving}>
                                    {saving ? 'Saving…' : editTx ? 'Update' : 'Create Transaction'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Employee: Enter AED→INR & Complete ────────────────────────────── */}
            {inrModal && inrTx && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setInrModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">Convert AED → INR</h3>
                            <button className="close-btn" onClick={() => setInrModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleInrSave}>
                            <div className="modal-body">
                                <div style={{
                                    background: 'rgba(0,200,150,0.06)', border: '1px solid rgba(0,200,150,0.2)',
                                    borderRadius: '10px', padding: '14px 16px', marginBottom: '20px'
                                }}>
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>TX: {inrTx.tx_id}</div>
                                    <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                                        Client: <strong>{inrTx.client_name}</strong> &nbsp;|&nbsp;
                                        AED Available: <strong style={{ color: 'var(--brand-gold)' }}>{Number(inrTx.amount_aed || 0).toLocaleString()} AED</strong>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Rate AED → INR *</label>
                                        <input id="inr-rate" className="form-input" type="number" step="0.0001" min="0"
                                            placeholder="e.g. 22.85" value={inrForm.rate_aed_inr}
                                            onChange={e => handleInrChange('rate_aed_inr', e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Amount (INR) — auto</label>
                                        <input id="inr-amount" className="form-input" type="number" step="0.01"
                                            placeholder="Auto-calculated" value={inrForm.amount_inr}
                                            onChange={e => handleInrChange('amount_inr', e.target.value)} />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setInrModal(false)}>Cancel</button>
                                <button id="save-inr-btn" type="submit" className="btn btn-accent" disabled={saving}>
                                    {saving ? 'Saving…' : 'Complete Transaction'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
