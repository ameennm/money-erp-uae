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
import { format, startOfDay, startOfWeek, startOfMonth, isAfter } from 'date-fns';

// ─── Sequential TX ID ────────────────────────────────────────────────────────
// IDs: 20261, 20262, 20263 … (increments from highest existing)
const START_TX_NUM = 20261;
const genTxId = (existingTxs) => {
    let max = START_TX_NUM - 1;
    for (const tx of existingTxs) {
        const n = parseInt(tx.tx_id, 10);
        if (!isNaN(n) && n > max) max = n;
    }
    return String(max + 1);
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUSES = [
    { value: 'pending', label: 'Pending', badge: 'badge-pending' },
    { value: 'sar_sent', label: 'Sent to Conversion Agent', badge: 'badge-inprogress' },
    { value: 'aed_received', label: 'AED Received', badge: 'badge-collector' },
    { value: 'completed', label: 'Completed (INR)', badge: 'badge-completed' },
    { value: 'failed', label: 'Failed', badge: 'badge-failed' },
];
const statusBadge = (s) => {
    const cfg = STATUSES.find(x => x.value === s) || STATUSES[0];
    return <span className={`badge ${cfg.badge}`}>{cfg.label}</span>;
};

// ─── Date range helpers ───────────────────────────────────────────────────────
const DATE_RANGES = ['Today', 'This Week', 'This Month', 'All Time', 'Custom'];

const applyDateRange = (txs, range, customFrom, customTo) => {
    if (range === 'All Time') return txs;
    const now = new Date();
    let from;
    if (range === 'Today') from = startOfDay(now);
    if (range === 'This Week') from = startOfWeek(now, { weekStartsOn: 1 });
    if (range === 'This Month') from = startOfMonth(now);
    if (range === 'Custom') {
        return txs.filter(tx => {
            const d = new Date(tx.$createdAt);
            const f = customFrom ? new Date(customFrom) : null;
            const t = customTo ? new Date(customTo + 'T23:59:59') : null;
            return (!f || d >= f) && (!t || d <= t);
        });
    }
    return txs.filter(tx => isAfter(new Date(tx.$createdAt), from));
};

const sum = (arr, f) => arr.reduce((a, t) => a + (Number(t[f]) || 0), 0);

// ─── Empty form ───────────────────────────────────────────────────────────────
const EMPTY = {
    client_name: '', agent_id: '', agent_name: '',
    conversion_agent_id: '', conversion_agent_name: '',
    amount_sar: '', amount_given_sar: '', client_inr: '',
    amount_aed: '', rate_aed_inr: '', amount_inr: '',
    notes: '', status: 'pending',
};

export default function TransactionsPage() {
    const { role, user } = useAuth();
    const isSuperAdmin = role === 'superadmin';
    const isCollector = role === 'collector';
    const isDistributor = role === 'distributor';
    const isEmployee = role === 'employee';

    const [txs, setTxs] = useState([]);
    const [agents, setAgents] = useState([]);
    const [convAgents, setConvAgents] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [filter, setFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [dateRange, setDateRange] = useState('All Time');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [editTx, setEditTx] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [inrModal, setInrModal] = useState(false);
    const [inrTx, setInrTx] = useState(null);
    const [inrForm, setInrForm] = useState({ rate_aed_inr: '', amount_inr: '' });

    // ── Fetch ──────────────────────────────────────────────────────────────────
    const fetchAll = async () => {
        setLoading(true);
        try {
            const [txRes, agRes, caRes, empRes] = await Promise.all([
                dbService.listTransactions(),
                dbService.listAgents(),
                dbService.listConversionAgents(),
                dbService.listEmployees(),
            ]);
            setTxs(txRes.documents);
            // Map current logged-in user to their Employee Database Document
            const me = empRes.documents.find(e => e.email === user.email);
            if (me) user.empId = me.$id;

            setEmployees(empRes.documents.filter(e => !e.role || e.role === 'employee'));
        } catch (e) { toast.error('Failed to load: ' + e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchAll(); }, []);

    // ── Auto-calc client_inr ───────────────────────────────────────────────────
    const calcClientInr = (sar, givenSar) => {
        const s = parseFloat(sar);
        const g = parseFloat(givenSar);
        if (s > 0 && g > 0) return ((s / g) * 1000).toFixed(2);
        return '';
    };

    // ── Auto-calc amount_inr (employee) ──────────────────────────────────────
    const handleInrChange = (key, val) => {
        setInrForm(prev => {
            const next = { ...prev, [key]: val };
            const aed = parseFloat(next.amount_aed) || 0;
            const rate = parseFloat(next.rate_aed_inr) || 0;
            if (aed > 0 && rate > 0) {
                next.amount_inr = (aed * rate).toFixed(2);
            }
            return next;
        });
    };

    // ── Form change handler ────────────────────────────────────────────────────
    const handleFormChange = (key, val) => {
        setForm(prev => {
            const next = { ...prev, [key]: val };
            // populate agent name from agent_id
            if (key === 'agent_id') {
                const ag = agents.find(a => a.$id === val);
                next.agent_name = ag?.name || '';
            }
            // populate conversion agent name
            if (key === 'conversion_agent_id') {
                const ca = convAgents.find(a => a.$id === val);
                next.conversion_agent_name = ca?.name || '';
            }
            // auto-calc client_inr when SAR or given SAR changes
            if (key === 'amount_sar' || key === 'amount_given_sar') {
                const sar = key === 'amount_sar' ? val : next.amount_sar;
                const giv = key === 'amount_given_sar' ? val : next.amount_given_sar;
                next.client_inr = calcClientInr(sar, giv);
            }
            return next;
        });
    };

    // ── Open modals ────────────────────────────────────────────────────────────
    const openNew = () => { setEditTx(null); setForm(EMPTY); setModal(true); };
    const openEdit = (tx) => {
        if (!isSuperAdmin && !isCollector) return;
        setEditTx(tx);
        setForm({
            client_name: tx.client_name || '',
            agent_id: tx.agent_id || '',
            agent_name: tx.agent_name || '',
            conversion_agent_id: tx.conversion_agent_id || '',
            conversion_agent_name: tx.conversion_agent_name || '',
            amount_sar: tx.amount_sar || '',
            amount_given_sar: tx.amount_given_sar || '',
            client_inr: tx.client_inr || '',
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
        setInrForm({ amount_aed: tx.amount_aed || '', rate_aed_inr: tx.rate_aed_inr || '', amount_inr: tx.amount_inr || '' });
        setInrModal(true);
    };

    // ── Save ───────────────────────────────────────────────────────────────────
    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                client_name: form.client_name,
                agent_id: form.agent_id || '',
                agent_name: form.agent_name || '',
                conversion_agent_id: form.conversion_agent_id || '',
                conversion_agent_name: form.conversion_agent_name || '',
                amount_sar: parseFloat(form.amount_sar) || 0,
                amount_given_sar: parseFloat(form.amount_given_sar) || 0,
                client_inr: parseFloat(form.client_inr) || 0,
                notes: form.notes || '',
                status: form.status || 'pending',
            };
            // Only add AED/INR fields if they have real values
            const aed = parseFloat(form.amount_aed);
            const rate = parseFloat(form.rate_aed_inr);
            const inr = parseFloat(form.amount_inr);
            if (!isNaN(aed) && aed > 0) payload.amount_aed = aed;
            if (!isNaN(rate) && rate > 0) payload.rate_aed_inr = rate;
            if (!isNaN(inr) && inr > 0) payload.amount_inr = inr;

            if (editTx) {
                await dbService.updateTransaction(editTx.$id, payload);
                toast.success('Transaction updated');
            } else {
                payload.tx_id = genTxId(txs);
                // Track who created the transaction
                if (user) {
                    payload.creator_id = user.$id;
                    payload.creator_name = user.name;
                }

                // Auto-assign equally
                if (employees.length > 0) {
                    const activeTxs = txs.filter(t => t.status !== 'completed' && t.assigned_to);
                    let minCount = Infinity;
                    let selectedEmp = employees[0];

                    for (const emp of employees) {
                        const count = activeTxs.filter(t => t.assigned_to === emp.$id).length;
                        if (count < minCount) {
                            minCount = count;
                            selectedEmp = emp;
                        }
                    }
                    payload.assigned_to = selectedEmp.$id;
                    payload.assigned_name = selectedEmp.name;
                    payload.distributor_approved = true; // explicitly approved since it was auto-assigned smoothly
                }

                await dbService.createTransaction(payload);
                toast.success(payload.assigned_name ? `Created & Assigned to ${payload.assigned_name}` : 'Transaction created');
            }
            setModal(false);
            fetchAll();
        } catch (e) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    // ── Employee complete ──────────────────────────────────────────────────────
    const handleInrSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await dbService.updateTransaction(inrTx.$id, {
                amount_aed: parseFloat(inrForm.amount_aed) || 0,
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

    // ── Batch status update ────────────────────────────────────────────────────
    const batchUpdate = async (fromStatus, toStatus, label) => {
        const targets = txs.filter(t => t.status === fromStatus);
        if (targets.length === 0) { toast.error(`No "${fromStatus}" transactions.`); return; }
        if (!window.confirm(`Mark all ${targets.length} transactions as "${label}"?`)) return;
        try {
            await Promise.all(targets.map(t => dbService.updateTransaction(t.$id, { status: toStatus })));
            toast.success(`${targets.length} transactions → ${label}`);
            fetchAll();
        } catch (e) { toast.error(e.message); }
    };

    // ── Delete ─────────────────────────────────────────────────────────────────
    const handleDelete = async (id) => {
        if (!window.confirm('Delete this transaction?')) return;
        try { await dbService.deleteTransaction(id); toast.success('Deleted'); fetchAll(); }
        catch (e) { toast.error(e.message); }
    };

    const copyTxId = (id) => {
        navigator.clipboard.writeText(id);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    // ── Filter & date range ────────────────────────────────────────────────────
    const dated = applyDateRange(txs, dateRange, customFrom, customTo);
    const roleFiltered = isEmployee ? dated.filter(t => t.assigned_to === user?.empId) : dated;
    const filtered = roleFiltered.filter(tx => {
        const q = filter.toLowerCase();
        const matchText =
            tx.client_name?.toLowerCase().includes(q) ||
            tx.tx_id?.toLowerCase().includes(q) ||
            tx.agent_name?.toLowerCase().includes(q) ||
            tx.assigned_name?.toLowerCase().includes(q) ||
            tx.conversion_agent_name?.toLowerCase().includes(q);
        const matchStatus = !statusFilter || tx.status === statusFilter;
        return matchText && matchStatus;
    });

    // ── Day-close numbers (always use ALL txs for batch totals) ─────────────
    const pendingTxs = txs.filter(t => t.status === 'pending');
    const sarSentTxs = txs.filter(t => t.status === 'sar_sent');
    const pendingSAR = sum(pendingTxs, 'amount_sar');
    const sarSentSAR = sum(sarSentTxs, 'amount_sar');

    // ── Per-agent summary for visible filtered txs ────────────────────────────
    const agentSummary = agents.map(ag => {
        const agTxs = filtered.filter(t => t.agent_id === ag.$id);
        return {
            ...ag,
            txCount: agTxs.length,
            totalSAR: sum(agTxs, 'amount_sar'),
        };
    }).filter(a => a.txCount > 0);

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <Layout title="Transactions">

            {/* ── Date Range Filter ─────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
                {DATE_RANGES.map(r => (
                    <button
                        key={r}
                        onClick={() => setDateRange(r)}
                        className="btn btn-sm"
                        style={{
                            background: dateRange === r ? 'var(--brand-accent)' : 'var(--bg-card)',
                            color: dateRange === r ? '#fff' : 'var(--text-secondary)',
                            border: `1px solid ${dateRange === r ? 'var(--brand-accent)' : 'var(--border-color)'}`,
                        }}
                    >
                        {r}
                    </button>
                ))}
                {dateRange === 'Custom' && (
                    <>
                        <input type="date" className="form-input" style={{ maxWidth: '150px', padding: '6px 10px', fontSize: '13px' }}
                            value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                        <span style={{ color: 'var(--text-muted)' }}>to</span>
                        <input type="date" className="form-input" style={{ maxWidth: '150px', padding: '6px 10px', fontSize: '13px' }}
                            value={customTo} onChange={e => setCustomTo(e.target.value)} />
                    </>
                )}
            </div>

            {/* ── Collector Day-Close Panel ─────────────────────────────────────── */}
            {(isCollector || isSuperAdmin) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: '16px', marginBottom: '28px' }}>
                    {/* Step 1 */}
                    <div className="card" style={{ border: '1px solid rgba(245,166,35,0.25)', padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(245,166,35,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--status-pending)', flexShrink: 0 }}>
                                <SendHorizonal size={20} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 2 }}>Step 1 — Pending SAR to Send</div>
                                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                                    {pendingSAR.toLocaleString()} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>SAR</span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 12px' }}>{pendingTxs.length} pending transactions</div>
                                <button id="btn-sar-sent" className="btn btn-sm"
                                    style={{ background: 'rgba(245,166,35,0.15)', color: 'var(--status-pending)', border: '1px solid rgba(245,166,35,0.3)' }}
                                    onClick={() => batchUpdate('pending', 'sar_sent', 'Sent to Conversion Agent')}
                                    disabled={pendingTxs.length === 0}>
                                    Send to Conversion Agent
                                </button>
                            </div>
                        </div>
                    </div>
                    {/* Step 2 */}
                    <div className="card" style={{ border: '1px solid rgba(74,158,255,0.25)', padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(74,158,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--status-inprogress)', flexShrink: 0 }}>
                                <Banknote size={20} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 2 }}>Step 2 — Confirm AED Received</div>
                                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                                    {sarSentSAR.toLocaleString()} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>SAR</span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 12px' }}>{sarSentTxs.length} sent, awaiting AED confirmation</div>
                                <button id="btn-aed-received" className="btn btn-sm"
                                    style={{ background: 'rgba(74,158,255,0.15)', color: 'var(--status-inprogress)', border: '1px solid rgba(74,158,255,0.3)' }}
                                    onClick={() => batchUpdate('sar_sent', 'aed_received', 'AED Received')}
                                    disabled={sarSentTxs.length === 0}>
                                    Confirm AED Received
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Per-Agent Summary ─────────────────────────────────────────────── */}
            {(isCollector || isSuperAdmin) && agentSummary.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-muted)', marginBottom: 10 }}>
                        Agent Summary ({dateRange})
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {agentSummary.map(ag => (
                            <div key={ag.$id} className="card" style={{ padding: '14px 18px', minWidth: '180px', flex: '1 1 180px', maxWidth: '240px' }}>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{ag.name}</div>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{ag.txCount} transaction{ag.txCount !== 1 ? 's' : ''}</div>
                                <div style={{ fontSize: '18px', fontWeight: 800, color: '#4a9eff', marginTop: 6 }}>{ag.totalSAR.toLocaleString()} SAR</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Toolbar ───────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-6 gap-3" style={{ flexWrap: 'wrap' }}>
                <div className="flex gap-3" style={{ flex: 1, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input id="tx-search" className="form-input" placeholder="Search client, TX ID, agent…"
                            style={{ paddingLeft: 38 }} value={filter} onChange={e => setFilter(e.target.value)} />
                    </div>
                    <select id="tx-status-filter" className="form-select" style={{ maxWidth: 210 }}
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

            {/* ── Table ─────────────────────────────────────────────────────────── */}
            <div className="card">
                {loading ? (
                    <div className="loading-screen" style={{ minHeight: '40vh' }}><div className="spinner" /><p>Loading…</p></div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state"><ArrowLeftRight size={40} /><p>No transactions found.</p></div>
                ) : (
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>TX ID</th>
                                    <th>Client</th>
                                    <th>Collection Agent</th>
                                    <th>Processing Employee</th>
                                    <th>SAR Received</th>
                                    <th>Client gets (INR)</th>
                                    <th>AED Received</th>
                                    <th>Rate AED→INR</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(tx => (
                                    <tr key={tx.$id}>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <span className="tx-id" style={{ minWidth: '50px' }}>{tx.tx_id || tx.$id.slice(0, 8)}</span>
                                                <button className="copy-btn" onClick={() => copyTxId(tx.tx_id || tx.$id)}>
                                                    {copiedId === (tx.tx_id || tx.$id) ? <CheckCircle size={13} style={{ color: 'var(--brand-accent)' }} /> : <Copy size={13} />}
                                                </button>
                                            </div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 4 }}>
                                                {tx.$createdAt ? format(new Date(tx.$createdAt), 'dd MMM yy') : ''}
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{tx.client_name}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{tx.agent_name || '—'}</td>

                                        {/* Assigned to */}
                                        <td>
                                            {(isDistributor || isSuperAdmin) && tx.status !== 'completed' ? (
                                                <select
                                                    className="form-select" style={{ padding: '4px 24px 4px 8px', fontSize: '11px', minHeight: 'auto' }}
                                                    value={tx.assigned_to || ''}
                                                    onChange={async (e) => {
                                                        const emp = employees.find(em => em.$id === e.target.value);
                                                        if (!emp) return;
                                                        try {
                                                            await dbService.updateTransaction(tx.$id, { assigned_to: emp.$id, assigned_name: emp.name, distributor_approved: true });
                                                            toast.success(`Assigned to ${emp.name}`);
                                                            fetchAll();
                                                        } catch (err) {
                                                            toast.error('Assign failed: ' + err.message);
                                                        }
                                                    }}
                                                >
                                                    <option value="">Unassigned</option>
                                                    {employees.map(emp => <option key={emp.$id} value={emp.$id}>{emp.name}</option>)}
                                                </select>
                                            ) : (
                                                <span style={{ color: 'var(--text-secondary)' }}>{tx.assigned_name || 'Unassigned'}</span>
                                            )}
                                        </td>

                                        <td><span className="currency sar">{Number(tx.amount_sar || 0).toLocaleString()} SAR</span></td>
                                        <td>
                                            <span className="currency inr" style={{ fontWeight: 700 }}>
                                                ₹{Number(tx.client_inr || 0).toLocaleString('en-IN')}
                                            </span>
                                        </td>
                                        <td><span className="currency aed">{Number(tx.amount_aed || 0).toLocaleString()} AED</span></td>
                                        <td style={{ color: 'var(--text-muted)' }}>{tx.rate_aed_inr || '—'}</td>
                                        <td>{statusBadge(tx.status)}</td>

                                        <td>
                                            <div className="flex gap-2">
                                                {/* Employee Action */}
                                                {(isEmployee || isSuperAdmin) && tx.status !== 'completed' && (
                                                    <button
                                                        className="btn btn-accent btn-sm"
                                                        onClick={() => openInrModal(tx)}
                                                    >
                                                        <PackageCheck size={13} /> Complete
                                                    </button>
                                                )}

                                                {/* Admin Actions */}
                                                {(isSuperAdmin || isCollector) && (
                                                    <>
                                                        <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(tx)}><Pencil size={14} /></button>
                                                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(tx.$id)}><Trash2 size={14} /></button>
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

            {/* ── New / Edit Modal ───────────────────────────────────────────────── */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">{editTx ? 'Edit Transaction' : 'New Transaction'}</h3>
                            <button className="close-btn" onClick={() => setModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                {/* Client & Collection Agent */}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Client Name *</label>
                                        <input id="form-client" className="form-input" placeholder="Client name"
                                            value={form.client_name} onChange={e => handleFormChange('client_name', e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Collection Agent</label>
                                        <select id="form-agent" className="form-select"
                                            value={form.agent_id} onChange={e => handleFormChange('agent_id', e.target.value)}>
                                            <option value="">— Select Agent —</option>
                                            {agents.map(a => <option key={a.$id} value={a.$id}>{a.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* SAR Section */}
                                <hr className="divider" />
                                <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>SAR Collection</p>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Amount Received from Client (SAR) *</label>
                                        <input id="form-sar" className="form-input" type="number" step="0.01" min="0"
                                            placeholder="e.g. 1000" value={form.amount_sar}
                                            onChange={e => handleFormChange('amount_sar', e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Amount Given to Agent (SAR) *</label>
                                        <input id="form-given-sar" className="form-input" type="number" step="0.01" min="0"
                                            placeholder="e.g. 39.9" value={form.amount_given_sar}
                                            onChange={e => handleFormChange('amount_given_sar', e.target.value)} required />
                                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                            Rate: for every {form.amount_given_sar || '?'} SAR → ₹1000
                                        </p>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" style={{ color: 'var(--brand-accent)' }}>Client will get (INR) — auto</label>
                                        <input id="form-client-inr" className="form-input" type="number" step="0.01"
                                            placeholder="Auto-calculated"
                                            value={form.client_inr}
                                            readOnly
                                            style={{ borderColor: form.client_inr ? 'rgba(0,200,150,0.4)' : undefined, background: 'rgba(0,200,150,0.05)', fontWeight: 700 }}
                                        />
                                        {form.client_inr && (
                                            <p style={{ fontSize: 11, color: 'var(--brand-accent)', marginTop: 4 }}>
                                                = ({form.amount_sar} ÷ {form.amount_given_sar}) × 1000
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* AED→INR — hidden from collector */}
                                {(isSuperAdmin || isEmployee) && (
                                    <>
                                        <hr className="divider" />
                                        <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>
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

            {/* ── Employee INR Modal ─────────────────────────────────────────────── */}
            {inrModal && inrTx && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setInrModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">Convert AED → INR</h3>
                            <button className="close-btn" onClick={() => setInrModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleInrSave}>
                            <div className="modal-body">
                                <div style={{ background: 'rgba(0,200,150,0.06)', border: '1px solid rgba(0,200,150,0.2)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>TX: {inrTx.tx_id}</div>
                                    <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                                        Client: <strong>{inrTx.client_name}</strong>
                                    </div>
                                    {inrTx.client_inr > 0 && (
                                        <div style={{ fontSize: 15, fontWeight: '700', color: 'var(--brand-accent)', marginTop: 8, padding: '8px 12px', background: 'rgba(0,200,150,0.1)', borderRadius: 6 }}>
                                            Total INR to pay client: ₹{Number(inrTx.client_inr).toLocaleString('en-IN')}
                                        </div>
                                    )}
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">AED Received</label>
                                        <input id="inr-aed" className="form-input" type="number" step="0.01" min="0"
                                            placeholder="e.g. 500" value={inrForm.amount_aed}
                                            onChange={e => handleInrChange('amount_aed', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Rate AED → INR *</label>
                                        <input id="inr-rate" className="form-input" type="number" step="0.0001" min="0"
                                            placeholder="e.g. 22.85" value={inrForm.rate_aed_inr}
                                            onChange={e => handleInrChange('rate_aed_inr', e.target.value)} required />
                                    </div>
                                </div>
                                <div className="form-row" style={{ marginTop: '12px' }}>
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
