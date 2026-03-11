import { useState, useEffect } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
    Plus, X, Trash2, Wallet2, TrendingUp, TrendingDown, Scale
} from 'lucide-react';
import {
    format, startOfDay, startOfWeek, startOfMonth, isAfter
} from 'date-fns';

const DATE_RANGES = ['Today', 'This Week', 'This Month', 'All Time', 'Custom'];
const applyRange = (arr, range, from, to) => {
    if (range === 'All Time') return arr;
    const now = new Date();
    let start;
    if (range === 'Today') start = startOfDay(now);
    if (range === 'This Week') start = startOfWeek(now, { weekStartsOn: 1 });
    if (range === 'This Month') start = startOfMonth(now);
    if (range === 'Custom') {
        return arr.filter(r => {
            const d = new Date(r.$createdAt);
            const f = from ? new Date(from) : null;
            const t = to ? new Date(to + 'T23:59:59') : null;
            return (!f || d >= f) && (!t || d <= t);
        });
    }
    return arr.filter(r => isAfter(new Date(r.$createdAt), start));
};

const EMPTY_CREDIT = { from_person: '', reason: '', amount_sar: '' };

export default function CreditsPage() {
    const { role } = useAuth();
    const [credits, setCredits] = useState([]);
    const [txs, setTxs] = useState([]);     // for "total sent" calc
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(EMPTY_CREDIT);
    const [saving, setSaving] = useState(false);
    const [dateRange, setDateRange] = useState('Today');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    const fetch = async () => {
        setLoading(true);
        try {
            const [cr, tx] = await Promise.all([
                dbService.listCredits(),
                dbService.listTransactions(),
            ]);
            setCredits(cr.documents);
            setTxs(tx.documents);
        } catch (e) { toast.error(e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetch(); }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                from_person: form.from_person,
                reason: form.reason,
                amount_sar: parseFloat(form.amount_sar) || 0,
                date: format(new Date(), 'yyyy-MM-dd'),
                admin_approved: role === 'admin',
            };
            const created = await dbService.createCredit(payload);
            toast.success('Credit recorded');
            setModal(false);
            setForm(EMPTY_CREDIT);
            // Optimistic: prepend new record to state
            setCredits(prev => [{ ...created, ...payload }, ...prev]);
        } catch (e) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this credit entry?')) return;
        try { await dbService.deleteCredit(id); toast.success('Deleted');
            // Optimistic: remove from state
            setCredits(prev => prev.filter(c => c.$id !== id));
        }
        catch (e) { toast.error(e.message); }
    };

    // ── Range-filtered data ────────────────────────────────────────────────────
    const filteredCredits = applyRange(credits, dateRange, customFrom, customTo);
    const filteredTxs = applyRange(txs, dateRange, customFrom, customTo);

    const totalReceived = filteredCredits.filter(c => c.admin_approved).reduce((a, c) => a + (Number(c.amount_sar) || 0), 0);
    // "total sent" = sum of amount_sar in transactions that have been sent (sar_sent / aed_received / completed)
    const totalSent = filteredTxs
        .filter(t => ['sar_sent', 'aed_received', 'completed'].includes(t.status))
        .reduce((a, t) => a + (Number(t.amount_sar) || 0), 0);
    const balance = totalReceived - totalSent;

    return (
        <Layout title="Credits">
            {/* ── Date Range ─────────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
                {DATE_RANGES.map(r => (
                    <button key={r} onClick={() => setDateRange(r)} className="btn btn-sm"
                        style={{
                            background: dateRange === r ? 'var(--brand-accent)' : 'var(--bg-card)',
                            color: dateRange === r ? '#fff' : 'var(--text-secondary)',
                            border: `1px solid ${dateRange === r ? 'var(--brand-accent)' : 'var(--border-color)'}`,
                        }}>{r}</button>
                ))}
                {dateRange === 'Custom' && (
                    <>
                        <input type="date" className="form-input" style={{ maxWidth: 148, padding: '6px 10px', fontSize: 13 }}
                            value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                        <span style={{ color: 'var(--text-muted)' }}>to</span>
                        <input type="date" className="form-input" style={{ maxWidth: 148, padding: '6px 10px', fontSize: 13 }}
                            value={customTo} onChange={e => setCustomTo(e.target.value)} />
                    </>
                )}
            </div>

            {/* ── Summary Cards ──────────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px,1fr))', gap: 16, marginBottom: 20 }}>
                {/* Total Received (Approved only) */}
                <div className="card" style={{ padding: 20, border: '1px solid rgba(74,158,255,0.25)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(74,158,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a9eff', flexShrink: 0 }}><TrendingUp size={20} /></div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Total Received (Approved)</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#4a9eff', lineHeight: 1 }}>{totalReceived.toLocaleString()}</div>
                        </div>
                    </div>
                </div>

                {/* Amount Sent */}
                <div className="card" style={{ padding: 20, border: '1px solid rgba(245,166,35,0.25)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(245,166,35,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-gold)', flexShrink: 0 }}><TrendingDown size={20} /></div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Sent Ext. Agent</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{totalSent.toLocaleString()}</div>
                        </div>
                    </div>
                </div>

                {/* Balance */}
                <div className="card" style={{ padding: 20, border: `1px solid ${balance >= 0 ? 'rgba(0,200,150,0.3)' : 'rgba(255,84,112,0.3)'}`, background: balance >= 0 ? 'rgba(0,200,150,0.05)' : 'rgba(255,84,112,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: balance >= 0 ? 'rgba(0,200,150,0.15)' : 'rgba(255,84,112,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: balance >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)', flexShrink: 0 }}><Scale size={20} /></div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>SAR In Hand</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: balance >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)', lineHeight: 1 }}>
                                {balance >= 0 ? '+' : ''}{balance.toLocaleString()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Toolbar ────────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{filteredCredits.length} credit entries</div>
                <button id="new-credit-btn" className="btn btn-accent" onClick={() => setModal(true)}>
                    <Plus size={16} /> Log Credit
                </button>
            </div>

            {/* ── Table ──────────────────────────────────────────────────────────── */}
            {loading ? (
                <div className="loading-screen" style={{ minHeight: '30vh' }}><div className="spinner" /></div>
            ) : filteredCredits.length === 0 ? (
                <div className="empty-state card"><Wallet2 size={40} /><p>No credit entries found.</p></div>
            ) : (
                <div className="card">
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr><th>From</th><th>Reason</th><th>Amount (SAR)</th><th>Date</th><th>Approved</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {filteredCredits.map(c => (
                                    <tr key={c.$id}>
                                        <td style={{ fontWeight: 600 }}>{c.from_person}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{c.reason || '—'}</td>
                                        <td><span className="currency sar">{Number(c.amount_sar || 0).toLocaleString()} SAR</span></td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                            {c.$createdAt ? format(new Date(c.$createdAt), 'dd MMM yyyy hh:mm a') : '—'}
                                        </td>
                                        <td>
                                            {c.admin_approved ? (
                                                <span className="badge" style={{ background: 'rgba(0, 200, 150, 0.15)', color: 'var(--brand-accent)' }}>Yes</span>
                                            ) : (
                                                <span className="badge" style={{ background: 'rgba(255, 166, 0, 0.15)', color: 'var(--brand-gold)' }}>Pending</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="flex gap-2">
                                                {role === 'admin' && !c.admin_approved && (
                                                    <button className="btn btn-outline btn-sm" style={{ padding: '4px 8px', fontSize: '11px' }}
                                                        onClick={async () => {
                                                            await dbService.updateCredit(c.$id, { admin_approved: true });
                                                            toast.success('Credit Approved');
                                                            // Optimistic: update in state
                                                            setCredits(prev => prev.map(cr => cr.$id === c.$id ? { ...cr, admin_approved: true } : cr));
                                                        }}
                                                    >
                                                        Approve
                                                    </button>
                                                )}
                                                <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(c.$id)}><Trash2 size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Modal ──────────────────────────────────────────────────────────── */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">Log Credit (SAR Received)</h3>
                            <button className="close-btn" onClick={() => setModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Who is giving? *</label>
                                    <input id="credit-from" className="form-input" placeholder="Name of person / company"
                                        value={form.from_person} onChange={e => setForm({ ...form, from_person: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Reason / Purpose</label>
                                    <input id="credit-reason" className="form-input" placeholder="e.g. Daily collection, advance, etc."
                                        value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Amount (SAR) *</label>
                                    <input id="credit-amount" className="form-input" type="number" step="0.01" min="0"
                                        placeholder="0.00" value={form.amount_sar}
                                        onChange={e => setForm({ ...form, amount_sar: e.target.value })} required />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
                                <button id="save-credit-btn" type="submit" className="btn btn-accent" disabled={saving}>
                                    {saving ? 'Saving…' : 'Log Credit'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
