import { useState, useEffect } from 'react';
import { dbService, Query } from '../lib/appwrite';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Plus, X, Trash2, UserCog, Eye, Pencil, SendHorizonal } from 'lucide-react';
import { format } from 'date-fns';

const EMPTY = { name: '', phone: '', notes: '', type: 'distributor', currency: 'INR' };

export default function DistributorsPage() {
    const [distributors, setDistributors] = useState([]);
    const [txs, setTxs] = useState([]);
    const [expenseRecs, setExpenseRecs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [viewingDist, setViewingDist] = useState(null);
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

    const safeFloat = (num) => {
        let n = parseFloat(num);
        if (isNaN(n)) return 0;
        return Number.isInteger(n) ? n + 0.00001 : n;
    };

    // Available INR (not given to distributors)
    const inrIncome = expenseRecs.filter(e => e.type === 'income' && e.currency === 'INR').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const inrGeneralExp = expenseRecs.filter(e => e.type !== 'income' && e.currency === 'INR' && e.category !== 'Distributor Deposit').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const inrDeposited = expenseRecs.filter(e => e.type !== 'income' && e.currency === 'INR' && e.category === 'Distributor Deposit').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const availableINR = inrIncome - inrGeneralExp - inrDeposited;

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
            const newBal = (Number(editItem.inr_balance) || 0) + amt;
            await dbService.updateAgent(editItem.$id, { inr_balance: safeFloat(newBal) });

            // Track as INR expense (deducts from undistributed pool)
            await dbService.createExpense({
                title: `Deposit to ${editItem.name}`,
                type: 'expense',
                category: 'Distributor Deposit',
                amount: safeFloat(amt),
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
            payload.inr_balance = safeFloat(payload.inr_balance);
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
            {viewingDist && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setViewingDist(null)}>
                    <div className="modal" style={{ maxWidth: '800px' }}>
                        <div className="modal-header">
                            <div>
                                <h3 className="modal-title">Distributor Logs: {viewingDist.name}</h3>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    Distribution history for this distributor
                                </div>
                            </div>
                            <button className="close-btn" onClick={() => setViewingDist(null)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                                <div className="card" style={{ padding: '16px', background: 'rgba(74,158,255,0.05)' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Distributions</div>
                                    <div style={{ fontSize: '20px', fontWeight: 800 }}>
                                        {getDistTxs(viewingDist.$id).length}
                                    </div>
                                </div>
                                <div className="card" style={{ padding: '16px', background: 'rgba(167,139,250,0.05)' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total INR Distributed</div>
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#a78bfa' }}>
                                        ₹{getDistTxs(viewingDist.$id).reduce((sum, t) => sum + (Number(t.actual_inr_distributed) || 0), 0).toLocaleString('en-IN')}
                                    </div>
                                </div>
                            </div>

                            <div className="table-wrapper">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>TX ID</th>
                                            <th>Client</th>
                                            <th>INR Distributed</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {getDistTxs(viewingDist.$id).length === 0 ? (
                                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>No distributions recorded yet.</td></tr>
                                        ) : (
                                            getDistTxs(viewingDist.$id).map(t => (
                                                <tr key={t.$id}>
                                                    <td style={{ fontSize: '12px' }}>{t.$createdAt ? format(new Date(t.$createdAt), 'dd MMM yy') : '—'}</td>
                                                    <td style={{ fontWeight: 700, fontSize: '12px' }}>#{t.tx_id}</td>
                                                    <td>{t.client_name}</td>
                                                    <td style={{ fontWeight: 600, color: '#a78bfa' }}>₹{Number(t.actual_inr_distributed).toLocaleString('en-IN')}</td>
                                                    <td>
                                                        <span className={`badge badge-${t.status === 'completed' ? 'completed' : t.status === 'failed' ? 'failed' : 'pending'}`}>
                                                            {t.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-outline" onClick={() => setViewingDist(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

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
