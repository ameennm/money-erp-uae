import { useState, useEffect } from 'react';
import { authService, dbService, Query } from '../lib/appwrite';
import { ledgerService } from '../lib/ledgerService';
import LedgerModal from '../components/LedgerModal';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Plus, X, Pencil, Trash2, Users, MapPin, Banknote } from 'lucide-react';


const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

const EMPTY = { name: '', phone: '', location: '', notes: '', currency: 'SAR', type: 'collection', sar_balance: 0, aed_balance: 0 };

export default function AgentsPage() {
    const [agents, setAgents] = useState([]);
    const [txs, setTxs] = useState([]);
    const [expenseRecs, setExpenseRecs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [viewingAgent, setViewingAgent] = useState(null);
    const [editItem, setEditItem] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [paymentModal, setPaymentModal] = useState(false);
    const [paymentAgent, setPaymentAgent] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [user, setUser] = useState(null);

    const fetch = async () => {
        setLoading(true);
        try {
            const [ar, tr, ex] = await Promise.all([
                dbService.listAgents(), // Fetch all agents for universal search
                dbService.listTransactions(),
                dbService.listExpenses(),
            ]);
            setAgents(ar.documents);
            setTxs(tr.documents);
            setExpenseRecs(ex.documents);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetch();
        authService.getCurrentUser().then(setUser);
    }, []);

    const openNew = () => { setEditItem(null); setForm(EMPTY); setModal(true); };
    const openEdit = (a) => {
        setEditItem(a);
        setForm({
            name: a.name || '',
            phone: a.phone || '',
            location: a.location || '',
            notes: a.notes || '',
            currency: a.currency || 'SAR',
            type: a.type || 'collection',
            sar_balance: a.sar_balance || 0,
            aed_balance: a.aed_balance || 0
        });
        setModal(true);
    };

    const openHistory = (a) => { setViewingAgent(a); };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editItem) {
                await dbService.updateAgent(editItem.$id, form);
                toast.success('Agent updated');
                // Optimistic: update in state
                setAgents(prev => prev.map(a => a.$id === editItem.$id ? { ...a, ...form } : a));
            } else {
                const created = await dbService.createAgent(form);
                toast.success('Agent added');
                // Optimistic: prepend new agent
                setAgents(prev => [{ ...created, ...form }, ...prev]);
            }
            setModal(false);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this agent?')) return;
        try {
            await dbService.deleteAgent(id);
            toast.success('Deleted');
            // Optimistic: remove from state
            setAgents(prev => prev.filter(a => a.$id !== id));
        } catch (e) {
            toast.error(e.message);
        }
    };

    const openPayment = (a) => {
        setPaymentAgent(a);
        setPaymentAmount('');
        setPaymentModal(true);
    };

    const handlePayment = async (e) => {
        e.preventDefault();
        const amt = round2(parseFloat(paymentAmount) || 0);
        if (!amt || amt <= 0) return toast.error('Enter a valid payment amount');
        const cur = paymentAgent.currency || 'SAR';
        setSaving(true);
        try {
            // 1. Record payment as income expense for dashboard
            const expensePayload = {
                title: `Agent Payment — ${paymentAgent.name}`,
                type: 'income',
                category: 'Agent Payment',
                amount: amt,
                currency: cur,
                date: new Date().toISOString().split('T')[0],
                notes: `Received ${amt.toLocaleString()} ${cur} from agent ${paymentAgent.name}`,
            };
            const createdExpense = await dbService.createExpense(expensePayload);

            // 2. Record Ledger entry (automatically updates agent balance)
            await ledgerService.recordEntry({
                agent: paymentAgent,
                amount: -amt, // Negative because agent is paying us back (reducing their debt)
                currency: cur,
                type: 'debit',
                reference_type: 'expense',
                reference_id: createdExpense.$id,
                description: `Payment received from ${paymentAgent.name}`
            });

            toast.success(`✅ Recorded ${amt.toLocaleString()} ${cur} received from ${paymentAgent.name}`);
            setPaymentModal(false);
            fetch();
        } catch (err) {
            toast.error('Failed: ' + err.message);
        } finally {
            setSaving(false);
        }
    };


    // ── Overall summary across all collection agents ──
    const totalSarOwed = round2(agents.reduce((s, a) => s + (a.sar_balance || 0), 0));
    const totalAedOwed = round2(agents.reduce((s, a) => s + (a.aed_balance || 0), 0));
    const totalCollectedSar = round2(txs.filter(t => (t.collected_currency || 'SAR') === 'SAR').reduce((s, t) => s + (Number(t.collected_amount) || 0), 0));
    const totalCollectedAed = round2(txs.filter(t => t.collected_currency === 'AED').reduce((s, t) => s + (Number(t.collected_amount) || 0), 0));
    // Paid to us = total collected minus still owed
    const totalPaidSar = round2(Math.max(0, totalCollectedSar - totalSarOwed));
    const totalPaidAed = round2(Math.max(0, totalCollectedAed - totalAedOwed));

    return (
        <Layout title="Agents">
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <div className="flex items-center gap-4 flex-1">
                    <div>
                        <h3 style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                            {agents.length} agent{agents.length !== 1 ? 's' : ''} registered
                        </h3>
                    </div>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
                        <input
                            type="text"
                            placeholder="Search agents by name or phone..."
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
                <button id="new-agent-btn" className="btn btn-accent" onClick={openNew}>
                    <Plus size={16} /> Add Agent
                </button>
            </div>

            {/* Overall Summary Stats */}
            {!loading && agents.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
                    {/* Total Distributed */}
                    <div className="card" style={{ padding: '14px 18px', background: 'rgba(74,158,255,0.05)', border: '1px solid rgba(74,158,255,0.15)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--brand-primary)' }}>{totalCollectedSar.toLocaleString()} <span style={{ fontSize: 11 }}>SAR</span></div>
                        {totalCollectedAed > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-gold)', marginTop: 2 }}>{totalCollectedAed.toLocaleString()} <span style={{ fontSize: 11 }}>AED</span></div>}
                    </div>
                    {/* Total Paid to Us */}
                    <div className="card" style={{ padding: '14px 18px', background: 'rgba(0,200,150,0.05)', border: '1px solid rgba(0,200,150,0.15)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Paid</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--brand-accent)' }}>{totalPaidSar.toLocaleString()} <span style={{ fontSize: 11 }}>SAR</span></div>
                        {totalCollectedAed > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-accent)', marginTop: 2 }}>{totalPaidAed.toLocaleString()} <span style={{ fontSize: 11 }}>AED</span></div>}
                    </div>
                    {/* Total Owed to Us */}
                    <div className="card" style={{ padding: '14px 18px', background: 'rgba(245,166,35,0.05)', border: '1px solid rgba(245,166,35,0.15)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Balance</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: totalSarOwed > 0 ? '#4a9eff' : 'var(--text-muted)' }}>{totalSarOwed.toLocaleString()} <span style={{ fontSize: 11 }}>SAR</span></div>
                        {totalAedOwed > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-gold)', marginTop: 2 }}>{totalAedOwed.toLocaleString()} <span style={{ fontSize: 11 }}>AED</span></div>}
                    </div>
                </div>
            )}

            {loading ? (
                <div className="loading-screen" style={{ minHeight: '40vh' }}>
                    <div className="spinner" /><p>Loading…</p>
                </div>
            ) : agents.length === 0 ? (
                <div className="empty-state card">
                    <Users size={40} />
                    <p>No agents yet. Add your first agent.</p>
                </div>
            ) : (
                <div className="card">
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>#</th>
                                    <th>Agent Name</th>
                                    <th className="hide-sm">Type</th>
                                    <th className="hide-md">Phone</th>
                                    <th className="hide-lg">Location</th>
                                    <th className="hide-sm">Currency</th>
                                    <th style={{ textAlign: 'right' }}>Total</th>
                                    <th style={{ textAlign: 'right' }}>Paid</th>
                                    <th style={{ textAlign: 'right' }}>Balance</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {agents
                                    .filter(a => {
                                        if (searchTerm) {
                                            return a.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                                   a.phone?.toLowerCase().includes(searchTerm.toLowerCase());
                                        }
                                        return a.type === 'collection';
                                    })
                                    .map((a, i) => {
                                    const cur = a.currency || 'SAR';
                                    const owedField = cur === 'AED' ? 'aed_balance' : 'sar_balance';
                                    const owed = round2(a[owedField] || 0);
                                    const agentTxList = txs.filter(t => t.collection_agent_id === a.$id);
                                    const totalDistributed = round2(agentTxList.reduce((s, t) => s + (Number(t.collected_amount) || 0), 0));
                                    const paidToUs = round2(Math.max(0, totalDistributed - owed));
                                    return (
                                        <tr key={a.$id}>
                                            <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>
                                                    <button onClick={() => openHistory(a)} className="agent-link">
                                                        {a.name}
                                                    </button>
                                                </div>
                                                {a.notes && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }} className="hide-md">{a.notes}</div>}
                                            </td>
                                            <td className="hide-sm">
                                                <span className={`badge ${
                                                    a.type === 'collection' ? 'badge-completed' : 
                                                    a.type === 'distributor' ? 'badge-pending' : 
                                                    'badge-inprogress'
                                                }`} style={{ fontSize: '10px' }}>
                                                    {a.type === 'collection' ? 'Collector' : 
                                                     a.type === 'distributor' ? 'Distributor' : 
                                                     a.type === 'conversion_sar' ? 'SAR Conv' : 
                                                     a.type === 'conversion_aed' ? 'AED Conv' : a.type}
                                                </span>
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)' }} className="hide-md">{a.phone || '—'}</td>
                                            <td className="hide-lg">
                                                <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                                                    <MapPin size={13} /> {a.location || '—'}
                                                </div>
                                            </td>
                                            <td className="hide-sm">
                                                <span className={`badge ${a.currency === 'AED' ? 'badge-admin' : 'badge-collector'}`}>
                                                    {a.currency || 'SAR'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--brand-primary)' }}>
                                                {totalDistributed.toLocaleString()} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{cur}</span>
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: paidToUs > 0 ? 'var(--brand-accent)' : 'var(--text-muted)' }}>
                                                {paidToUs.toLocaleString()} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{cur}</span>
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: owed > 0 ? '#4a9eff' : 'var(--text-muted)' }}>
                                                {owed.toLocaleString()} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{cur}</span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="flex gap-2 justify-end">
                                                    {/* Receive Payment — only show if agent owes us something */}
                                                    {owed > 0 && (
                                                        <button
                                                            className="btn btn-sm"
                                                            style={{ background: '#25D366', color: '#fff', border: 'none', fontWeight: 700 }}
                                                            onClick={() => openPayment(a)}
                                                            title="Record payment received from agent"
                                                        >
                                                            <Banknote size={13} /> Receive
                                                        </button>
                                                    )}
                                                    <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(a)}>
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(a.$id)}>
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
                                    <td colSpan={3} className="hide-sm"></td>
                                    <td className="hide-md"></td>
                                    <td className="hide-lg"></td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>GRAND TOTAL</td>
                                    <td style={{ textAlign: 'right', fontWeight: 800 }}>
                                        <div style={{ color: 'var(--brand-primary)' }}>{totalCollectedSar.toLocaleString()} <span style={{ fontSize: 10 }}>SAR</span></div>
                                        {totalCollectedAed > 0 && <div style={{ color: 'var(--brand-gold)' }}>{totalCollectedAed.toLocaleString()} <span style={{ fontSize: 10 }}>AED</span></div>}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 800 }}>
                                        <div style={{ color: totalPaidSar > 0 ? 'var(--brand-accent)' : 'var(--text-muted)' }}>{totalPaidSar.toLocaleString()} <span style={{ fontSize: 10 }}>SAR</span></div>
                                        {totalPaidAed > 0 && <div style={{ color: 'var(--brand-gold)' }}>{totalPaidAed.toLocaleString()} <span style={{ fontSize: 10 }}>AED</span></div>}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 800 }}>
                                        <div style={{ color: totalSarOwed > 0 ? '#4a9eff' : 'var(--text-muted)' }}>{totalSarOwed.toLocaleString()} <span style={{ fontSize: 10 }}>SAR</span></div>
                                        {totalAedOwed > 0 && <div style={{ color: 'var(--brand-gold)' }}>{totalAedOwed.toLocaleString()} <span style={{ fontSize: 10 }}>AED</span></div>}
                                    </td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* History Modal */}
            <LedgerModal agent={viewingAgent} onClose={() => setViewingAgent(null)} />

            {/* Add/Edit Modal */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">{editItem ? 'Edit Agent' : 'Add Agent'}</h3>
                            <button className="close-btn" onClick={() => setModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Full Name *</label>
                                    <input id="agent-name" className="form-input" placeholder="Agent name"
                                        value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Phone</label>
                                        <input id="agent-phone" className="form-input" placeholder="+966 5X XXX XXXX"
                                            value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Location / Region</label>
                                        <input id="agent-location" className="form-input" placeholder="Riyadh, Jeddah…"
                                            value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Currency</label>
                                        <select className="form-select" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                                            <option value="SAR">SAR</option>
                                            <option value="AED">AED</option>
                                        </select>
                                    </div>
                                    {(user?.role === 'admin' || user?.role === 'collector') && (
                                        <div className="form-group">
                                            <label className="form-label">
                                                Manual Balance Adjustment ({form.currency})
                                            </label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                step="any"
                                                value={form.currency === 'SAR' ? form.sar_balance : form.aed_balance}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    if (form.currency === 'SAR') setForm({ ...form, sar_balance: val });
                                                    else setForm({ ...form, aed_balance: val });
                                                }}
                                                style={{ border: '1px solid var(--brand-accent)', background: 'rgba(0,255,150,0.05)' }}
                                            />
                                            <div style={{ fontSize: 10, color: 'var(--brand-accent)', marginTop: 4 }}>
                                                ⚠️ Admin only: Directly overwrites the agent's debt.
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notes</label>
                                    <textarea id="agent-notes" className="form-textarea" placeholder="Additional info…"
                                        value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
                                <button id="save-agent-btn" type="submit" className="btn btn-accent" disabled={saving}>
                                    {saving ? 'Saving…' : editItem ? 'Update' : 'Add Agent'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Receive Payment Modal */}
            {paymentModal && paymentAgent && (() => {
                const cur = paymentAgent.currency || 'SAR';
                const owedField = cur === 'AED' ? 'aed_balance' : 'sar_balance';
                const owed = round2(paymentAgent[owedField] || 0);
                const amt = parseFloat(paymentAmount) || 0;
                return (
                    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPaymentModal(false)}>
                        <div className="modal">
                            <div className="modal-header">
                                <div>
                                    <h3 className="modal-title">Receive Payment — {paymentAgent.name}</h3>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                                        Record {cur} cash received from this agent
                                    </div>
                                </div>
                                <button className="close-btn" onClick={() => setPaymentModal(false)}><X size={20} /></button>
                            </div>
                            <form onSubmit={handlePayment}>
                                <div className="modal-body">
                                    {/* Owed Summary */}
                                    <div className="card" style={{ background: 'var(--bg-main)', padding: 16, marginBottom: 16, border: `1px solid ${cur === 'AED' ? 'rgba(245,166,35,0.25)' : 'rgba(74,158,255,0.25)'}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Agent Owes Us:</span>
                                            <span style={{ fontSize: 22, fontWeight: 800, color: cur === 'AED' ? 'var(--brand-gold)' : '#4a9eff' }}>
                                                {owed.toLocaleString()} {cur}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Amount Received ({cur})</label>
                                        <input
                                            className="form-input"
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            max={owed}
                                            required
                                            autoFocus
                                            placeholder={`Max ${owed.toLocaleString()} ${cur}`}
                                            value={paymentAmount}
                                            onChange={e => setPaymentAmount(e.target.value)}
                                            style={{ fontSize: 20, fontWeight: 700, height: 52 }}
                                        />
                                        {amt > 0 && amt <= owed && (
                                            <div style={{ fontSize: 12, color: 'var(--brand-accent)', marginTop: 6 }}>
                                                ✓ Remaining after this payment: <strong>{round2(owed - amt).toLocaleString()} {cur}</strong>
                                            </div>
                                        )}
                                        {amt > owed && (
                                            <div style={{ fontSize: 12, color: 'var(--status-failed)', marginTop: 6 }}>
                                                ⚠️ Cannot exceed owed amount ({owed.toLocaleString()} {cur})
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ padding: '10px 14px', background: 'rgba(0,200,150,0.06)', borderRadius: 8, border: '1px solid rgba(0,200,150,0.2)', fontSize: 13, color: 'var(--text-secondary)' }}>
                                        💡 This will be recorded as <strong>{cur} income</strong>, increasing our {cur} balance on the dashboard.
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-outline" onClick={() => setPaymentModal(false)}>Cancel</button>
                                    <button
                                        type="submit"
                                        className="btn btn-accent"
                                        disabled={saving || !paymentAmount || amt <= 0 || amt > owed + 0.01}
                                        style={{ minWidth: 160 }}
                                    >
                                        {saving ? 'Saving…' : `✅ Confirm Receipt`}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}
        </Layout>
    );
}
