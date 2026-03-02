import { useState, useEffect } from 'react';
import { dbService, Query } from '../lib/appwrite';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Plus, X, Trash2, UserCog, Eye, Pencil, SendHorizonal, Calendar, Download } from 'lucide-react';
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

const EMPTY = { name: '', phone: '', notes: '', type: 'distributor', currency: 'INR' };

export default function DistributorsPage() {
    const [distributors, setDistributors] = useState([]);
    const [txs, setTxs] = useState([]);
    const [expenseRecs, setExpenseRecs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [viewingDist, setViewingDist] = useState(null);
    const [dateRange, setDateRange] = useState('All Time');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [editItem, setEditItem] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [depositModal, setDepositModal] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');
    const [saving, setSaving] = useState(false);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [dr, tr, ex] = await Promise.all([
                dbService.listAgents([Query.equal('type', 'distributor')]),
                dbService.listTransactions(),
                dbService.listExpenses(),
            ]);
            setDistributors(dr.documents);
            setTxs(tr.documents);
            setExpenseRecs(ex.documents);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, []);
    const getDistTxs = (distId) => txs.filter(t => t.distributor_id === distId && t.status === 'completed'); const openNew = () => { setEditItem(null); setForm(EMPTY); setModal(true); };
    const openEdit = (d) => { setEditItem(d); setForm({ name: d.name || '', phone: d.phone || '', notes: d.notes || '', type: 'distributor', currency: 'INR', inr_balance: d.inr_balance || 0 }); setModal(true); };
    const openDeposit = (d) => { setEditItem(d); setDepositAmount(''); setDepositModal(true); };

    const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

    // Available INR (not given to distributors)
    const inrIncome = round2(expenseRecs.filter(e => e.type === 'income' && e.currency === 'INR').reduce((a, e) => a + (Number(e.amount) || 0), 0));
    const inrGeneralExp = round2(expenseRecs.filter(e => e.type !== 'income' && e.currency === 'INR' && e.category !== 'Distributor Deposit').reduce((a, e) => a + (Number(e.amount) || 0), 0));
    const inrDeposited = round2(expenseRecs.filter(e => e.type !== 'income' && e.currency === 'INR' && e.category === 'Distributor Deposit').reduce((a, e) => a + (Number(e.amount) || 0), 0));
    const availableINR = Math.max(0, round2(inrIncome - inrGeneralExp - inrDeposited));

    const handleDeposit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const amt = Number(depositAmount);
            if (!amt || amt <= 0) {
                setSaving(false);
                return toast.error('Enter a valid deposit amount');
            }
            if (amt > availableINR) {
                setSaving(false);
                return toast.error(
                    `Insufficient INR! Only ₹${availableINR.toLocaleString('en-IN')} available. Cannot deposit ₹${amt.toLocaleString('en-IN')}.`,
                    { duration: 5000 }
                );
            }
            const newBal = round2((Number(editItem.inr_balance) || 0) + amt);
            await dbService.updateAgent(editItem.$id, { inr_balance: newBal });

            // Track as INR expense (deducts from undistributed pool)
            await dbService.createExpense({
                title: `Deposit to ${editItem.name}`,
                type: 'expense',
                category: 'Distributor Deposit',
                amount: round2(amt),
                currency: 'INR',
                date: new Date().toISOString().split('T')[0],
                notes: `Deposited ₹${amt.toLocaleString('en-IN')} to ${editItem.name}`
            });

            toast.success(`₹${amt.toLocaleString('en-IN')} deposited to ${editItem.name}`);
            setDepositModal(false);
            fetchAll();
        } catch (e) { toast.error('Deposit failed: ' + e.message); }
        finally { setSaving(false); }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = { ...form };
            payload.inr_balance = round2(payload.inr_balance || 0);
            if (editItem) {
                await dbService.updateAgent(editItem.$id, payload);
                toast.success('Distributor Updated');
            } else {
                await dbService.createAgent(payload);
                toast.success('Distributor Created');
            }
            setModal(false);
            fetchAll();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Remove this distributor record?')) return;
        try {
            await dbService.deleteAgent(id);
            toast.success('Distributor record removed');
            fetchAll();
        } catch (e) {
            toast.error(e.message);
        }
    };

    return (
        <Layout title="Distributors">
            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <div>
                    <h3 style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                        {distributors.length} distributor{distributors.length !== 1 ? 's' : ''}
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Distributors handle the final payout of INR to clients.</p>
                </div>
                <button id="new-dist-btn" className="btn btn-accent" onClick={openNew}>
                    <Plus size={16} /> Add Distributor
                </button>
            </div>

            {loading ? (
                <div className="loading-screen" style={{ minHeight: '40vh' }}>
                    <div className="spinner" /><p>Loading…</p>
                </div>
            ) : distributors.length === 0 ? (
                <div className="empty-state card">
                    <UserCog size={40} />
                    <p>No distributors yet.</p>
                </div>
            ) : (
                <div className="card">
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Total Distributions</th>
                                    <th>Total INR Distributed</th>
                                    <th>Available Balance (INR)</th>
                                    <th>Notes</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {distributors.map((dist, i) => {
                                    const distTxs = getDistTxs(dist.$id);
                                    const totalINR = distTxs.reduce((sum, t) => sum + (Number(t.actual_inr_distributed) || 0), 0);
                                    return (
                                        <tr key={dist.$id}>
                                            <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                            <td style={{ fontWeight: 600 }}>
                                                <div className="flex items-center gap-2">
                                                    <div style={{
                                                        width: 32, height: 32, borderRadius: '50%',
                                                        background: 'linear-gradient(135deg, #a78bfa, var(--brand-accent))',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0
                                                    }}>
                                                        {dist.name?.[0]?.toUpperCase()}
                                                    </div>
                                                    <button
                                                        onClick={() => setViewingDist(dist)}
                                                        style={{
                                                            background: 'none', border: 'none', padding: 0,
                                                            fontWeight: 'inherit', cursor: 'pointer',
                                                            textDecoration: 'underline', color: 'var(--brand-accent)'
                                                        }}
                                                    >
                                                        {dist.name}
                                                    </button>
                                                </div>
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{dist.phone || '—'}</td>
                                            <td>{distTxs.length} txs</td>
                                            <td style={{ fontWeight: 600, color: '#a78bfa' }}>₹{totalINR.toLocaleString('en-IN')}</td>
                                            <td style={{ fontWeight: 700, color: dist.inr_balance >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)' }}>
                                                ₹{Number(dist.inr_balance || 0).toLocaleString('en-IN')}
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{dist.notes || '—'}</td>
                                            <td>
                                                <div className="flex gap-2">
                                                    <button className="btn btn-accent btn-sm" onClick={() => openDeposit(dist)}>
                                                        Deposit
                                                    </button>
                                                    <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(dist)}>
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(dist.$id)}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {viewingDist && (() => {
                let distEvents = getDistTxs(viewingDist.$id).map(t => ({
                    type: 'distribution',
                    $createdAt: t.$createdAt,
                    $id: t.$id,
                    amount: -Number(t.actual_inr_distributed),
                    ref: '#' + t.tx_id,
                    details: t.client_name,
                    status: t.status
                }));

                let depEvents = expenseRecs.filter(e => e.category === 'Distributor Deposit' && (e.title?.includes(viewingDist.name) || e.notes?.includes(viewingDist.name))).map(e => ({
                    type: 'deposit',
                    $createdAt: e.$createdAt || e.date,
                    $id: e.$id,
                    amount: Number(e.amount),
                    ref: 'DEP',
                    details: 'Admin Deposit',
                    status: 'completed'
                }));

                // Commission expenses linked to this distributor
                let commEvents = expenseRecs.filter(e =>
                    e.category === 'Commission' && e.distributor_id === viewingDist.$id
                ).map(e => ({
                    type: 'commission',
                    $createdAt: e.$createdAt || e.date,
                    $id: e.$id + '_comm',
                    amount: -Number(e.amount),  // debit from distributor balance
                    ref: 'COM',
                    details: `Commission (${e.currency} ${Number(e.amount).toLocaleString()})`,
                    status: 'completed'
                }));

                let combined = [...distEvents, ...depEvents, ...commEvents].sort((a, b) => new Date(a.$createdAt) - new Date(b.$createdAt));

                let runningINR = 0;
                combined = combined.map(ev => {
                    runningINR += ev.amount;
                    return { ...ev, running_balance: runningINR };
                });

                const filteredEvents = applyDateRange(combined, dateRange, customFrom, customTo);

                const periodDistributions = filteredEvents.filter(e => e.type === 'distribution');

                const exportLedgerExcel = () => {
                    const rows = filteredEvents.map((ev, idx) => ({
                        '#': idx + 1,
                        'Date': ev.$createdAt ? format(new Date(ev.$createdAt), 'dd MMM yyyy HH:mm') : '',
                        'Reference': ev.ref,
                        'Details': ev.details,
                        'Type': ev.type,
                        'Credit (INR)': ev.amount > 0 ? ev.amount : '',
                        'Debit (INR)': ev.amount < 0 ? Math.abs(ev.amount) : '',
                        'Running Balance': ev.running_balance,
                    }));
                    const ws = XLSX.utils.json_to_sheet(rows);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, viewingDist.name);
                    XLSX.writeFile(wb, `distributor_${viewingDist.name}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
                };

                return (
                    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setViewingDist(null)}>
                        <div className="modal" style={{ maxWidth: '950px', width: '90%', maxHeight: '90vh' }}>
                            <div className="modal-header">
                                <div>
                                    <h3 className="modal-title">Distributor Ledger: {viewingDist.name}</h3>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Deposits, distributions and commission history
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button className="btn btn-outline btn-sm" onClick={exportLedgerExcel} title="Export to Excel">
                                        <Download size={14} /> Excel
                                    </button>
                                    <button className="close-btn" onClick={() => setViewingDist(null)}><X size={20} /></button>
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

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div className="card" style={{ padding: '16px', background: 'rgba(74,158,255,0.05)' }}>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Period Distributions (Count)</div>
                                        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--brand-primary)' }}>
                                            {periodDistributions.length}
                                        </div>
                                    </div>
                                    <div className="card" style={{ padding: '16px', background: 'rgba(167,139,250,0.05)' }}>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Period INR Distributed</div>
                                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#a78bfa' }}>
                                            ₹{Math.abs(periodDistributions.reduce((sum, t) => sum + t.amount, 0)).toLocaleString('en-IN')}
                                        </div>
                                    </div>
                                </div>

                                <div className="table-wrapper" style={{ flex: 1 }}>
                                    <table className="data-table" style={{ fontSize: 13 }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: 40 }}>#</th>
                                                <th>Date</th>
                                                <th>Reference/Client</th>
                                                <th style={{ textAlign: 'center' }}>Event</th>
                                                <th style={{ textAlign: 'right' }}>Credit (Deposit)</th>
                                                <th style={{ textAlign: 'right' }}>Debit (Payout)</th>
                                                <th style={{ textAlign: 'right' }}>Running Bal</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredEvents.length === 0 ? (
                                                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>No records found for active filters.</td></tr>
                                            ) : (
                                                filteredEvents.map((ev, idx) => (
                                                    <tr key={ev.$id || idx}>
                                                        <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                                                        <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                                                            <div className="flex items-center gap-1"><Calendar size={12} /> {ev.$createdAt ? format(new Date(ev.$createdAt), 'dd MMM yy HH:mm') : '—'}</div>
                                                        </td>
                                                        <td style={{ fontWeight: 500 }}>
                                                            <span style={{ color: 'var(--brand-accent)', fontSize: 11, marginRight: 6 }}>{ev.ref}</span>
                                                            <br />{ev.details}
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <span className={`badge badge-${ev.status === 'completed' ? 'completed' : 'pending'}`} style={{ fontSize: 10 }}>
                                                                {ev.type}
                                                            </span>
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: ev.amount > 0 ? 800 : 500, color: ev.amount > 0 ? 'var(--brand-accent)' : 'inherit' }}>
                                                            {ev.amount > 0 ? `+₹${ev.amount.toLocaleString('en-IN')}` : '—'}
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: ev.amount < 0 ? 800 : 500, color: ev.amount < 0 ? 'var(--status-failed)' : 'inherit' }}>
                                                            {ev.amount < 0 ? `-₹${Math.abs(ev.amount).toLocaleString('en-IN')}` : '—'}
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 800 }}>
                                                            ₹{Number(ev.running_balance).toLocaleString('en-IN')}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
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
                            <h3 className="modal-title">{editItem ? 'Edit Distributor' : 'Add New Distributor'}</h3>
                            <button className="close-btn" onClick={() => setModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Full Name *</label>
                                    <input className="form-input" placeholder="e.g. Rahul Sharma"
                                        value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Phone Number</label>
                                    <input className="form-input" placeholder="e.g. +91 9876543210"
                                        value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Starting INR Balance</label>
                                    <input className="form-input" type="number" step="0.01"
                                        value={form.inr_balance || ''} onChange={e => setForm({ ...form, inr_balance: parseFloat(e.target.value) || 0 })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notes</label>
                                    <textarea className="form-textarea" placeholder="Location, bank details, etc."
                                        value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-accent" disabled={saving}>
                                    {saving ? 'Saving…' : 'Save Distributor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Deposit Modal */}
            {depositModal && editItem && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDepositModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">Deposit INR to {editItem.name}</h3>
                            <button className="close-btn" onClick={() => setDepositModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleDeposit}>
                            <div className="modal-body">
                                <div className="card mb-4" style={{ background: 'var(--bg-main)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Available INR (Not Given):</span>
                                        <span style={{ fontWeight: 800, color: availableINR > 0 ? '#a78bfa' : 'var(--status-failed)' }}>
                                            ₹{availableINR.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Current Balance ({editItem.name}):</span>
                                        <span style={{ fontWeight: 700, color: 'var(--brand-accent)' }}>
                                            ₹{Number(editItem.inr_balance || 0).toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Deposit Amount (INR)</label>
                                    <input className="form-input" type="number" required placeholder="e.g. 50000"
                                        max={availableINR}
                                        value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
                                    {depositAmount && Number(depositAmount) > availableINR && (
                                        <div style={{ color: 'var(--status-failed)', fontSize: 12, marginTop: 6 }}>
                                            ⚠ Amount exceeds available INR (₹{availableINR.toLocaleString('en-IN')})
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setDepositModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-accent" disabled={saving || availableINR <= 0}>Confirm Deposit</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
