import { useState, useEffect } from 'react';
import { authService, dbService, Query, ID } from '../lib/appwrite';
import { ledgerService } from '../lib/ledgerService';
import LedgerModal from '../components/LedgerModal';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import {
    Plus, X, Pencil, Trash2, RefreshCw,
    TrendingUp, Banknote, Wallet, List
} from 'lucide-react';


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
    const [depositNote, setDepositNote] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
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
    const openDeposit = (a) => {
        setActiveAgent(a);
        setActionAmount('');
        setActionRate('');
        setDepositNote('');
        setDepositModal(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editItem) {
                await dbService.updateAgent(editItem.$id, form);
                toast.success('Updated');
                // Optimistic: update in state
                setAgents(prev => prev.map(a => a.$id === editItem.$id ? { ...a, ...form } : a));
            } else {
                const created = await dbService.createAgent(form);
                toast.success('Conversion agent added');
                // Optimistic: prepend new agent
                setAgents(prev => [{ ...created, ...form }, ...prev]);
            }
            setModal(false);
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
            // Optimistic: remove from state
            setAgents(prev => prev.filter(a => a.$id !== agent.$id));
            setConvRecs(prev => prev.filter(r => r.conversion_agent_id !== agent.$id));
        } catch (e) { toast.error(e.message); }
    };

    const handleDepositSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const amtIn = Number(actionAmount);
            if (!amtIn) throw new Error('Enter valid amount');

            const balCur = activeAgent.type === 'conversion_sar' ? 'SAR' : 'AED';
            
            // 1. Create expense for dashboard
            const expensePayload = {
                title: `Deposit to Conv. Agent — ${activeAgent.name}`,
                type: 'expense',
                category: 'Conversion Deposit',
                amount: amtIn,
                currency: balCur,
                date: new Date().toISOString().split('T')[0],
                notes: depositNote || `Deposited ${amtIn} ${balCur}.`,
                distributor_id: activeAgent.$id,
                distributor_name: activeAgent.name
            };
            const createdExpense = await dbService.createExpense(expensePayload);

            // 2. Record Ledger entry (updates agent balance)
            await ledgerService.recordEntry({
                agent: activeAgent,
                amount: amtIn,
                currency: balCur,
                type: 'debit', // Agent received money from us
                reference_type: 'expense',
                reference_id: createdExpense.$id,
                description: `Deposit to conversion agent: ${activeAgent.name}`
            });

            toast.success(`Deposited ${amtIn} ${balCur}`);
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
            let targetAmt = 0;
            const balCur = activeAgent.type === 'conversion_sar' ? 'SAR' : 'AED';

            if (activeAgent.type === 'conversion_sar') {
                incomeCur = 'AED';
                targetAmt = amtSource / rate;
            } else {
                incomeCur = 'INR';
                targetAmt = amtSource * rate;
            }

            // 1. Create income expense for dashboard
            const expensePayload = {
                title: `Receipt from Conv. Agent — ${activeAgent.name}`,
                type: 'income',
                category: 'Conversion Receipt',
                amount: targetAmt,
                currency: incomeCur,
                date: new Date().toISOString().split('T')[0],
                notes: `Received ${(targetAmt || 0).toLocaleString()} ${incomeCur} (Sourced from ${(amtSource || 0).toLocaleString()} ${balCur} @ ${rate}) from conversion agent`,
                distributor_id: activeAgent.$id,
                distributor_name: activeAgent.name
            };
            const createdExpense = await dbService.createExpense(expensePayload);

            // 2. Record Ledger entry (updates agent balance)
            await ledgerService.recordEntry({
                agent: activeAgent,
                amount: amtSource,
                currency: balCur,
                type: 'credit', // Agent gave us money back
                reference_type: 'expense',
                reference_id: createdExpense.$id,
                description: `Receipt from conversion agent: ${activeAgent.name}`
            });

            toast.success(`Received ${(targetAmt || 0).toLocaleString()} ${incomeCur}`);
            setReceiveModal(false);
            fetchAll();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSaving(false);
        }
}
    return (
        <Layout title="Conversion Agents">
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    These agents convert <strong>SAR → AED</strong> or <strong>AED → INR</strong> for us. Select one when recording a conversion on the Dashboard.
                </div>
            </div>

            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <div className="flex items-center gap-4 flex-1">
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {agents.length} agent{agents.length !== 1 ? 's' : ''}
                    </div>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
                        <input
                            type="text"
                            placeholder="Search conversion agents..."
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
                                    <th>Agent Name</th>
                                    <th className="hide-md" style={{ width: 140 }}>Phone</th>
                                    <th style={{ textAlign: 'right', width: 150 }}>Balance</th>
                                    <th style={{ textAlign: 'center', width: 180 }} className="hide-sm">Operations</th>
                                    <th style={{ textAlign: 'right', width: 120 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {agents
                                    .filter(a => a.type === activeTab)
                                    .filter(a => 
                                        a.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                        a.phone?.toLowerCase().includes(searchTerm.toLowerCase())
                                    )
                                    .map((a, i) => {
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
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                {(bal || 0).toLocaleString()} <span style={{ fontSize: 11 }}>{balCur}</span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                    <button className="btn btn-danger btn-sm" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => openDeposit(a)}>Deposit</button>
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
                                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand-accent)' }}>
                                        {(agents.filter(a => a.type === activeTab).reduce((sum, a) => sum + (activeTab === 'conversion_sar' ? (a.sar_balance || 0) : (a.aed_balance || 0)), 0) || 0).toLocaleString()} <span style={{ fontSize: 11 }}>{activeTab === 'conversion_sar' ? 'SAR' : 'AED'}</span>
                                    </td>
                                    <td colSpan={2}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {viewingAgent && (
                <LedgerModal
                    agent={viewingAgent}
                    onClose={() => setViewingAgent(null)}
                />
            )}

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
                const balCur = activeAgent.type === 'conversion_sar' ? 'SAR' : 'AED';
                return (
                    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDepositModal(false)}>
                        <div className="modal-content" style={{ maxWidth: 400, background: 'var(--bg-card)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 className="modal-title" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Deposit to {activeAgent.name}</h3>
                                <button className="close-btn" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setDepositModal(false)}><X size={20} /></button>
                            </div>
                            <form style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }} onSubmit={handleDepositSubmit}>
                                <div style={{ padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Current Debt (Balance):</span>
                                    <span style={{ fontSize: 15, fontWeight: 700, color: activeAgent.type === 'conversion_sar' ? '#4a9eff' : 'var(--brand-gold)' }}>
                                        {activeAgent.type === 'conversion_sar' ? `${(Number(activeAgent.sar_balance) || 0).toLocaleString()} SAR` : `${(Number(activeAgent.aed_balance) || 0).toLocaleString()} AED`}
                                    </span>
                                </div>
                                <div className="form-group">
                                    <label className="form-label" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Deposit Amount ({balCur})</label>
                                    <input className="form-input" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)', color: '#fff' }} type="number" step="any" required
                                        value={actionAmount} onChange={e => setActionAmount(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Notes</label>
                                    <textarea className="form-textarea" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)', color: '#fff' }} rows="3" placeholder="Additional details..."
                                        value={depositNote} onChange={e => setDepositNote(e.target.value)} />
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
                                and at what rate. The resulting {activeAgent.type === 'conversion_sar' ? 'AED' : 'INR'} will be credited to our dashboard balance.
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
                                    Result: {activeAgent.type === 'conversion_sar' ? (Number(actionAmount) / Number(actionRate)).toLocaleString(undefined, { maximumFractionDigits: 2 }) : (Number(actionAmount) * Number(actionRate) || 0).toLocaleString()} {activeAgent.type === 'conversion_sar' ? 'AED' : 'INR'} will be recorded as income.
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
            )}
        </Layout >
    );
}
