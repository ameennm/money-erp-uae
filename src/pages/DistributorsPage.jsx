import { useState, useEffect } from 'react';
import { dbService, Query } from '../lib/appwrite';
import { ledgerService } from '../lib/ledgerService';
import LedgerModal from '../components/LedgerModal';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Plus, X, Trash2, UserCog, Pencil } from 'lucide-react';


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
    const [depositNote, setDepositNote] = useState('');
    const [transferModal, setTransferModal] = useState(false);
    const [transferFrom, setTransferFrom] = useState(null);
    const [transferTo, setTransferTo] = useState('');
    const [transferAmount, setTransferAmount] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
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
    const getDistTxs = (distId) => txs.filter(t => t.distributor_id === distId && t.status === 'completed');
    const openNew = () => { setEditItem(null); setForm(EMPTY); setModal(true); };
    const openEdit = (d) => { setEditItem(d); setForm({ name: d.name || '', phone: d.phone || '', notes: d.notes || '', type: 'distributor', currency: 'INR', inr_balance: d.inr_balance || 0 }); setModal(true); };
    const openDeposit = (d) => { setEditItem(d); setDepositAmount(''); setDepositNote(''); setDepositModal(true); };
    const openTransfer = (d) => { setTransferFrom(d); setTransferTo(''); setTransferAmount(''); setTransferModal(true); };

    const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

    // Available INR (not given to distributors)
    const inrIncome = round2(expenseRecs.filter(e => e.type === 'income' && e.currency === 'INR').reduce((a, e) => a + (Number(e.amount) || 0), 0));
    const inrGeneralExp = round2(expenseRecs.filter(e => e.type !== 'income' && e.currency === 'INR' && e.category !== 'Distributor Deposit' && e.category !== 'Distributor Transfer').reduce((a, e) => a + (Number(e.amount) || 0), 0));
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

            // 1. Record as INR expense (deducts from undistributed pool)
            const expense = await dbService.createExpense({
                title: `Deposit to ${editItem.name}`,
                type: 'expense',
                category: 'Distributor Deposit',
                amount: round2(amt),
                currency: 'INR',
                date: new Date().toISOString().split('T')[0],
                notes: depositNote || `Deposited ₹${amt.toLocaleString('en-IN')} to ${editItem.name}`,
                distributor_id: editItem.$id,
                distributor_name: editItem.name
            });

            // 2. Record ledger entry and update distributor balance
            await ledgerService.recordEntry({
                agent: editItem,
                amount: amt,
                currency: 'INR',
                type: 'credit',
                reference_type: 'expense',
                reference_id: expense.$id,
                description: depositNote || `Deposit of ₹${amt.toLocaleString('en-IN')}`
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
            // When creating, always start with 0 balance — deposits will add balance
            if (!editItem) {
                payload.inr_balance = 0;
            } else {
                payload.inr_balance = round2(payload.inr_balance || 0);
            }
            if (editItem) {
                await dbService.updateAgent(editItem.$id, payload);
                toast.success('Distributor Updated');
                // Optimistic: update in state
                setDistributors(prev => prev.map(d => d.$id === editItem.$id ? { ...d, ...payload } : d));
            } else {
                const created = await dbService.createAgent(payload);
                toast.success('Distributor Created');
                // Optimistic: prepend new distributor
                setDistributors(prev => [{ ...created, ...payload }, ...prev]);
            }
            setModal(false);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleTransfer = async (e) => {
        e.preventDefault();
        const amt = round2(parseFloat(transferAmount) || 0);
        if (!amt || amt <= 0) return toast.error('Enter a valid amount');
        if (!transferTo) return toast.error('Select a target distributor');
        const fromBal = round2(transferFrom.inr_balance || 0);
        if (amt > fromBal + 0.01) {
            return toast.error(`${transferFrom.name} only has ₹${fromBal.toLocaleString('en-IN')} available`);
        }
        const toDist = distributors.find(d => d.$id === transferTo);
        if (!toDist) return toast.error('Target distributor not found');
        setSaving(true);
        try {
            // Record as two expense entries for audit trail only
            const [expOut, expIn] = await Promise.all([
                dbService.createExpense({
                    title: `Transfer Out — ${transferFrom.name} → ${toDist.name}`,
                    type: 'expense',
                    category: 'Distributor Transfer',
                    amount: amt,
                    currency: 'INR',
                    date: new Date().toISOString().split('T')[0],
                    notes: `Transferred ₹${amt.toLocaleString('en-IN')} from ${transferFrom.name} to ${toDist.name}`,
                }),
                dbService.createExpense({
                    title: `Transfer In — ${transferFrom.name} → ${toDist.name}`,
                    type: 'income', // Income type for the receiver if we want to follow basic logic, or just a custom category
                    category: 'Distributor Transfer',
                    amount: amt,
                    currency: 'INR',
                    date: new Date().toISOString().split('T')[0],
                    notes: `Received ₹${amt.toLocaleString('en-IN')} from ${transferFrom.name}`,
                }),
            ]);

            // Record Ledger entries for both
            await Promise.all([
                ledgerService.recordEntry({
                    agent: transferFrom,
                    amount: -amt,
                    currency: 'INR',
                    type: 'debit',
                    reference_type: 'expense',
                    reference_id: expOut.$id,
                    description: `Transfer to ${toDist.name}`
                }),
                ledgerService.recordEntry({
                    agent: toDist,
                    amount: amt,
                    currency: 'INR',
                    type: 'credit',
                    reference_type: 'expense',
                    reference_id: expIn.$id,
                    description: `Transfer from ${transferFrom.name}`
                })
            ]);

            toast.success(`✅ ₹${amt.toLocaleString('en-IN')} transferred from ${transferFrom.name} to ${toDist.name}`);
            setTransferModal(false);
            fetchAll();
        } catch (err) {
            toast.error('Transfer failed: ' + err.message);
        } finally {
            setSaving(false);
        }
    };


    const handleDelete = async (id) => {
        if (!window.confirm('Remove this distributor record?')) return;
        try {
            await dbService.deleteAgent(id);
            toast.success('Distributor record removed');
            // Optimistic: remove from state
            setDistributors(prev => prev.filter(d => d.$id !== id));
        } catch (e) {
            toast.error(e.message);
        }
    };


    return (
        <Layout title="Distributors">
            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <div className="flex items-center gap-4 flex-1">
                    <div>
                        <h3 style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                            {distributors.length} distributor{distributors.length !== 1 ? 's' : ''}
                        </h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Distributors handle the final payout of INR to clients.</p>
                    </div>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
                        <input
                            type="text"
                            placeholder="Search distributors..."
                            className="form-input"
                            style={{ paddingLeft: '36px' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </span>
                    </div>
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
                                    <th style={{ width: 40 }}>#</th>
                                    <th>Distributor Name</th>
                                    <th className="hide-md" style={{ width: 140 }}>Phone</th>
                                    <th className="hide-sm" style={{ width: 80 }}>Txs</th>
                                    <th style={{ textAlign: 'right', width: 160 }}>Total Distributed</th>
                                    <th style={{ textAlign: 'right', width: 160 }}>Available Balance</th>
                                    <th className="hide-lg">Notes</th>
                                    <th style={{ textAlign: 'right', width: 180 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {distributors
                                    .filter(d => 
                                        d.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                        d.phone?.toLowerCase().includes(searchTerm.toLowerCase())
                                    )
                                    .map((dist, i) => {
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
                                                     }} className="hide-sm">
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
                                             <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }} className="hide-md">{dist.phone || '—'}</td>
                                             <td className="hide-sm">{distTxs.length} txs</td>
                                             <td style={{ fontWeight: 600, color: '#a78bfa', textAlign: 'right' }}>₹{totalINR.toLocaleString('en-IN')}</td>
                                             <td style={{ fontWeight: 700, textAlign: 'right', color: dist.inr_balance >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)' }}>
                                                 {dist.inr_balance < 0 ? '-' : ''}₹{Math.abs(Number(dist.inr_balance || 0)).toLocaleString('en-IN')}
                                             </td>
                                             <td style={{ color: 'var(--text-muted)', fontSize: '13px' }} className="hide-lg">{dist.notes || '—'}</td>
                                             <td style={{ textAlign: 'right' }}>
                                                 <div className="flex gap-2 justify-end">
                                                    <button className="btn btn-accent btn-sm" onClick={() => openDeposit(dist)}>
                                                        Deposit
                                                    </button>
                                                    <button
                                                        className="btn btn-outline btn-sm"
                                                        style={{ color: '#a78bfa', borderColor: '#a78bfa' }}
                                                        onClick={() => openTransfer(dist)}
                                                        title="Transfer balance to another distributor"
                                                    >
                                                        Transfer
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
                            <tfoot>
                                <tr>
                                    <td colSpan={2}></td>
                                    <td className="hide-md"></td>
                                    <td className="hide-sm"></td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#a78bfa' }}>GRAND TOTAL</td>
                                    <td style={{ fontWeight: 800 }}>
                                        {distributors.reduce((sum, d) => sum + getDistTxs(d.$id).length, 0)} txs
                                    </td>
                                    <td style={{ fontWeight: 800, color: '#a78bfa' }}>
                                        ₹{distributors.reduce((sum, d) => sum + getDistTxs(d.$id).reduce((s, t) => s + (Number(t.actual_inr_distributed) || 0), 0), 0).toLocaleString('en-IN')}
                                    </td>
                                    <td style={{ fontWeight: 800, color: distributors.reduce((sum, d) => sum + (Number(d.inr_balance) || 0), 0) >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)' }}>
                                        {distributors.reduce((sum, d) => sum + (Number(d.inr_balance) || 0), 0) < 0 ? '-' : ''}₹{Math.abs(distributors.reduce((sum, d) => sum + (Number(d.inr_balance) || 0), 0)).toLocaleString('en-IN')}
                                    </td>
                                    <td colSpan={2}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* History Modal */}
            <LedgerModal 
                agent={viewingDist} 
                onClose={() => setViewingDist(null)} 
            />

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
                                {editItem && (
                                    <div className="form-group">
                                        <label className="form-label">INR Balance (manual correction only)</label>
                                        <input className="form-input" type="number" step="0.01"
                                            value={form.inr_balance || ''} onChange={e => setForm({ ...form, inr_balance: parseFloat(e.target.value) || 0 })} />
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>⚠️ Use the Deposit button to add funds. Only edit this to correct mistakes.</div>
                                    </div>
                                )}
                                {!editItem && (
                                    <div style={{ padding: '10px 14px', background: 'rgba(74,158,255,0.06)', borderRadius: 8, border: '1px solid rgba(74,158,255,0.2)', fontSize: 13, color: 'var(--text-secondary)' }}>
                                        💡 Balance starts at <strong>₹0</strong>. Use the <strong>Deposit</strong> button after creating to add funds.
                                    </div>
                                )}
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
                                <div className="form-group" style={{ marginTop: 16 }}>
                                    <label className="form-label">Notes</label>
                                    <textarea className="form-textarea" placeholder="Additional details..."
                                        value={depositNote} onChange={e => setDepositNote(e.target.value)} />
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

            {/* Transfer Modal */}
            {transferModal && transferFrom && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setTransferModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <div>
                                <h3 className="modal-title">Transfer Balance</h3>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Move INR balance from one distributor to another</div>
                            </div>
                            <button className="close-btn" onClick={() => setTransferModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleTransfer}>
                            <div className="modal-body">
                                {/* From distributor info */}
                                <div className="card" style={{ background: 'var(--bg-main)', padding: 16, marginBottom: 16, border: '1px solid rgba(167,139,250,0.25)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>From: <strong style={{ color: 'var(--text-primary)' }}>{transferFrom.name}</strong></span>
                                        <span style={{ fontSize: 20, fontWeight: 800, color: '#a78bfa' }}>
                                            ₹{round2(transferFrom.inr_balance || 0).toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Transfer To *</label>
                                    <select className="form-select" required value={transferTo}
                                        onChange={e => setTransferTo(e.target.value)}>
                                        <option value="">Select Distributor</option>
                                        {distributors
                                            .filter(d => d.$id !== transferFrom.$id)
                                            .map(d => (
                                                <option key={d.$id} value={d.$id}>
                                                    {d.name} (Bal: ₹{round2(d.inr_balance || 0).toLocaleString('en-IN')})
                                                </option>
                                            ))
                                        }
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Amount to Transfer (INR)</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        max={round2(transferFrom.inr_balance || 0)}
                                        required
                                        autoFocus
                                        placeholder={`Max ₹${round2(transferFrom.inr_balance || 0).toLocaleString('en-IN')}`}
                                        value={transferAmount}
                                        onChange={e => setTransferAmount(e.target.value)}
                                        style={{ fontSize: 20, fontWeight: 700, height: 52 }}
                                    />
                                    {transferAmount && parseFloat(transferAmount) > 0 && parseFloat(transferAmount) <= round2(transferFrom.inr_balance || 0) && (
                                        <div style={{ fontSize: 12, color: 'var(--brand-accent)', marginTop: 6 }}>
                                            ✓ {transferFrom.name} remaining: <strong>₹{round2(round2(transferFrom.inr_balance || 0) - parseFloat(transferAmount)).toLocaleString('en-IN')}</strong>
                                        </div>
                                    )}
                                    {transferAmount && parseFloat(transferAmount) > round2(transferFrom.inr_balance || 0) && (
                                        <div style={{ fontSize: 12, color: 'var(--status-failed)', marginTop: 6 }}>
                                            ⚠️ Exceeds available balance (₹{round2(transferFrom.inr_balance || 0).toLocaleString('en-IN')})
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setTransferModal(false)}>Cancel</button>
                                <button
                                    type="submit"
                                    className="btn btn-accent"
                                    disabled={saving || !transferAmount || !transferTo || parseFloat(transferAmount) <= 0 || parseFloat(transferAmount) > round2(transferFrom.inr_balance || 0) + 0.01}
                                    style={{ minWidth: 160 }}
                                >
                                    {saving ? 'Transferring…' : '↔ Confirm Transfer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </Layout>
    );
}
