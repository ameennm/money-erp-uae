import { useState, useEffect } from 'react';
import { authService, dbService, Query } from '../lib/appwrite';
import { ledgerService } from '../lib/ledgerService';
import LedgerModal from '../components/LedgerModal';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import {
    Plus, X, Pencil, Trash2, RefreshCw, List, Banknote
} from 'lucide-react';
import { SearchInput } from '../components/filters';

const EMPTY = { name: '', phone: '', notes: '', type: 'conversion_sar', currency: 'AED', sar_balance: 0, aed_balance: 0 };
const CONV_TYPES = [
    { value: 'conversion_sar', label: 'SAR → AED', color: '#4a9eff', bg: 'rgba(74, 158, 255, 0.05)' },
    { value: 'conversion_aed', label: 'AED → INR', color: 'var(--brand-gold)', bg: 'rgba(245, 166, 35, 0.05)' }
];

export default function ConversionAgentsPage() {
    const [agents, setAgents] = useState([]);
    const [convRecs, setConvRecs] = useState([]);   
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [viewingAgent, setViewingAgent] = useState(null);
    const [editItem, setEditItem] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('conversion_sar');

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
            const [ar, cr] = await Promise.all([
                dbService.listAgents([Query.or([Query.equal('type', 'conversion_sar'), Query.equal('type', 'conversion_aed'), Query.equal('type', 'conversion')])]),
                dbService.listAedConversions(),
            ]);
            setAgents(ar.documents);
            setConvRecs(cr.documents);
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
                fetchAll();
            } else {
                await dbService.createAgent(form);
                toast.success('Conversion agent added');
                fetchAll();
            }
            setModal(false);
        } catch (e) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    const handleDelete = async (agent) => {
        const agentRecs = convRecs.filter(r => r.conversion_agent_id === agent.$id);
        const msg = agentRecs.length > 0
            ? `Delete "${agent.name}"? This will also delete ${agentRecs.length} conversion record(s).`
            : `Delete conversion agent "${agent.name}"?`;
        if (!window.confirm(msg)) return;
        try {
            await Promise.all(agentRecs.map(r => dbService.deleteAedConversion(r.$id)));
            await dbService.deleteAgent(agent.$id);
            toast.success(`Deleted agent`);
            fetchAll();
        } catch (e) { toast.error(e.message); }
    };

    const handleActionSubmit = async (type) => {
        setSaving(true);
        try {
            const amtIn = Number(actionAmount);
            if (!amtIn) throw new Error('Enter valid amount');

            const balCur = activeAgent.type === 'conversion_sar' ? 'SAR' : 'AED';
            
            const expensePayload = {
                title: type === 'debit' ? `Given to Conv. Agent — ${activeAgent.name}` : `Returned from Conv. Agent — ${activeAgent.name}`,
                type: type === 'debit' ? 'expense' : 'income',
                category: 'Conversion Fund Ops',
                amount: amtIn,
                currency: balCur,
                date: new Date().toISOString().split('T')[0],
                notes: depositNote || `${type === 'debit' ? 'Given' : 'Received'} ${amtIn} ${balCur} ${type === 'debit' ? 'to' : 'from'} ${activeAgent.name}.`,
                distributor_id: activeAgent.$id,
                distributor_name: activeAgent.name
            };
            const createdExpense = await dbService.createExpense(expensePayload);

            await ledgerService.recordEntry({
                agent: activeAgent,
                amount: amtIn,
                currency: balCur,
                type: type, 
                reference_type: 'expense',
                reference_id: createdExpense.$id,
                description: depositNote || `${type === 'debit' ? 'Money given' : 'Money returned'} (${balCur})`
            });

            toast.success(`✅ Success: ${amtIn} ${balCur} recorded`);
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

            await ledgerService.recordEntry({
                agent: activeAgent,
                amount: amtSource,
                currency: balCur,
                type: 'credit', 
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
    };

    // ── Business Perspective Summary ──
    const currentAgents = agents.filter(a => a.type === activeTab);
    const balCur = activeTab === 'conversion_sar' ? 'SAR' : 'AED';
    
    const debits = currentAgents.reduce((s, a) => {
        const bal = activeTab === 'conversion_sar' ? (a.sar_balance || 0) : (a.aed_balance || 0);
        return s + Math.max(0, bal);
    }, 0);
    const credits = currentAgents.reduce((s, a) => {
        const bal = activeTab === 'conversion_sar' ? (a.sar_balance || 0) : (a.aed_balance || 0);
        return s + Math.abs(Math.min(0, bal));
    }, 0);
    const netBal = debits - credits;

    return (
        <Layout title="Conversion Agents">
            <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, opacity: 0.8 }}>
                    These agents handle currency flow for the business. 
                    <strong> Debit</strong> = Owed to Business | <strong>Credit</strong> = Business owes them.
                </div>
            </div>

            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <div className="flex items-center gap-4 flex-1">
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {agents.length} agent{agents.length !== 1 ? 's' : ''}
                    </div>
                    <SearchInput
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Search conversion agents..."
                        style={{ maxWidth: '300px' }}
                    />
                </div>
                <button className="btn btn-accent" onClick={openNew}>
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
                <>
                    {/* Business Ledger Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 24 }}>
                        <div className="card" style={{ padding: '16px 20px', background: 'rgba(74,158,255,0.08)', border: '1px solid rgba(74,158,255,0.2)' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Business Debit ({balCur})</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#4a9eff' }}>{debits.toLocaleString()}</div>
                        </div>
                        <div className="card" style={{ padding: '16px 20px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Business Credit ({balCur})</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#ef4444' }}>{credits.toLocaleString()}</div>
                        </div>
                        <div className="card" style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Net Exposure ({balCur})</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: netBal >= 0 ? 'var(--brand-primary)' : '#ef4444' }}>{netBal.toLocaleString()}</div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header" style={{ paddingBottom: 16, borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', background: 'rgba(255,255,255,0.02)' }}>
                            <div className="flex gap-2 p-1" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '14px' }}>
                                <button
                                    style={{
                                        fontSize: 15, padding: '10px 24px', borderRadius: '10px', border: 'none',
                                        background: activeTab === 'conversion_sar' ? 'var(--brand-accent)' : 'transparent',
                                        color: activeTab === 'conversion_sar' ? '#fff' : 'var(--text-muted)',
                                        fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s shadow 0.2s',
                                        boxShadow: activeTab === 'conversion_sar' ? '0 4px 12px rgba(0,0,0,0.3)' : 'none'
                                    }}
                                    onClick={() => setActiveTab('conversion_sar')}
                                >
                                    SAR → AED Agents
                                </button>
                                <button
                                    style={{
                                        fontSize: 15, padding: '10px 24px', borderRadius: '10px', border: 'none',
                                        background: activeTab === 'conversion_aed' ? 'var(--brand-accent)' : 'transparent',
                                        color: activeTab === 'conversion_aed' ? '#fff' : 'var(--text-muted)',
                                        fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s shadow 0.2s',
                                        boxShadow: activeTab === 'conversion_aed' ? '0 4px 12px rgba(0,0,0,0.3)' : 'none'
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
                                        <th className="hide-md" style={{ width: 130 }}>Phone</th>
                                        <th style={{ textAlign: 'right' }}>Business Debit</th>
                                        <th style={{ textAlign: 'right' }}>Business Credit</th>
                                        <th style={{ textAlign: 'right', fontWeight: 800 }}>Net Balance</th>
                                        <th style={{ textAlign: 'center', width: 200 }} className="hide-sm">Operations</th>
                                        <th style={{ textAlign: 'right', width: 100 }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {agents
                                        .filter(a => a.type === activeTab)
                                        .filter(a => a.name?.toLowerCase().includes(searchTerm.toLowerCase()))
                                        .map((a, i) => {
                                        const bal = activeTab === 'conversion_sar' ? (a.sar_balance || 0) : (a.aed_balance || 0);
                                        const rowCur = activeTab === 'conversion_sar' ? 'SAR' : 'AED';
                                        const debit = bal > 0 ? bal : 0;
                                        const credit = bal < 0 ? Math.abs(bal) : 0;

                                        return (
                                            <tr key={a.$id}>
                                                <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>
                                                        <button onClick={() => setViewingAgent(a)} className="agent-link">
                                                            {a.name}
                                                        </button>
                                                    </div>
                                                    {a.notes && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{a.notes}</div>}
                                                </td>
                                                <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }} className="hide-md">{a.phone || '—'}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: debit > 0 ? '#4a9eff' : 'var(--text-muted)' }}>
                                                    {debit > 0 ? debit.toLocaleString() : '—'} <span style={{ fontSize: 10, opacity: 0.6 }}>{rowCur}</span>
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: credit > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                                                    {credit > 0 ? credit.toLocaleString() : '—'} <span style={{ fontSize: 10, opacity: 0.6 }}>{rowCur}</span>
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 900, color: bal >= 0 ? 'var(--brand-primary)' : '#ef4444' }}>
                                                    {bal.toLocaleString()} <span style={{ fontSize: 10, opacity: 0.7 }}>{rowCur}</span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                        <button className="btn btn-accent btn-sm" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => openDeposit(a)}>Ops</button>
                                                        <button className="btn btn-outline btn-sm" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => { setActiveAgent(a); setActionAmount(''); setActionRate(''); setReceiveModal(true); }}>Settle</button>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
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
                                        <td colSpan={3} className="hide-md" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)', paddingRight: 20 }}>GRAND TOTALS:</td>
                                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#4a9eff' }}>{debits.toLocaleString()} <span style={{ fontSize: 10 }}>{balCur}</span></td>
                                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{credits.toLocaleString()} <span style={{ fontSize: 10 }}>{balCur}</span></td>
                                        <td style={{ textAlign: 'right', fontWeight: 900, color: netBal >= 0 ? 'var(--brand-primary)' : '#ef4444' }}>{netBal.toLocaleString()} <span style={{ fontSize: 10 }}>{balCur}</span></td>
                                        <td colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* History Modal */}
            {viewingAgent && (
                <LedgerModal agent={viewingAgent} onClose={() => setViewingAgent(null)} />
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
                                    <input className="form-input" placeholder="Agent name"
                                        value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>
                                <div className="form-row" style={{ display: 'flex', gap: 12 }}>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label">Phone</label>
                                        <input className="form-input" placeholder="+966 5X XXX XXXX"
                                            value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                                    </div>
                                    {(user?.role === 'admin' || user?.role === 'collector') && (
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label className="form-label">Balance ({form.type === 'conversion_sar' ? 'SAR' : 'AED'})</label>
                                            <input className="form-input" type="number" step="any"
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
                                    <textarea className="form-textarea" placeholder="Additional info…"
                                        value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-accent" disabled={saving}>
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
                const bal = activeAgent.type === 'conversion_sar' ? (activeAgent.sar_balance || 0) : (activeAgent.aed_balance || 0);
                return (
                    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDepositModal(false)}>
                        <div className="modal" style={{ maxWidth: 500, width: '95%' }}>
                            <div className="modal-header">
                                <div>
                                    <h3 className="modal-title">Conv. Agent Money Ops</h3>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Manage {balCur} for {activeAgent.name}</div>
                                </div>
                                <button className="close-btn" onClick={() => setDepositModal(false)}><X size={20} /></button>
                            </div>
                            <div className="modal-body">
                                <div className="card mb-4" style={{ background: 'var(--bg-main)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div className="flex justify-between items-center">
                                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Status:</span>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 18, fontWeight: 800, color: bal >= 0 ? 'var(--brand-primary)' : 'var(--brand-gold)' }}>
                                                {bal.toLocaleString()} {balCur}
                                            </div>
                                            <div style={{ fontSize: 9, opacity: 0.8, textTransform: 'uppercase' }}>
                                                {bal >= 0 ? 'They owe us' : 'We owe them'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Amount ({balCur})</label>
                                    <input className="form-input text-xl font-bold h-14" type="number" step="any" required
                                        value={actionAmount} onChange={e => setActionAmount(e.target.value)} />
                                </div>
                                <div className="form-group mt-4">
                                    <label className="form-label">Notes</label>
                                    <textarea className="form-textarea" rows="2" placeholder="Details..."
                                        value={depositNote} onChange={e => setDepositNote(e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-3 mt-6">
                                    <button type="button" className="btn btn-primary py-3 font-bold" disabled={saving} onClick={() => handleActionSubmit('debit')}>
                                        Give {balCur}
                                    </button>
                                    <button type="button" className="btn btn-warning py-3 font-bold text-black" disabled={saving} onClick={() => handleActionSubmit('credit')}>
                                        Receive {balCur}
                                    </button>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline w-full" onClick={() => setDepositModal(false)}>Close</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Settle/Receive Modal */}
            {receiveModal && activeAgent && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setReceiveModal(false)}>
                    <div className="modal" style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Settle with {activeAgent.name}</h3>
                            <button className="close-btn" onClick={() => setReceiveModal(false)}><X size={20} /></button>
                        </div>
                        <form className="p-6 flex flex-col gap-4" onSubmit={handleReceiveSubmit}>
                            <p className="text-sm text-gray-400">
                                Settle <b>{activeAgent.type === 'conversion_sar' ? 'SAR' : 'AED'}</b> balance and record the resulting income.
                            </p>
                            <div className="form-group">
                                <label className="form-label">Source Amount ({activeAgent.type === 'conversion_sar' ? 'SAR' : 'AED'})</label>
                                <input className="form-input" type="number" step="any" required
                                    value={actionAmount} onChange={e => setActionAmount(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Exchange Rate</label>
                                <input className="form-input" type="number" step="any" required
                                    value={actionRate} onChange={e => setActionRate(e.target.value)} />
                            </div>
                            <div className="modal-footer border-none px-0 pb-0">
                                <button type="button" className="btn btn-outline" onClick={() => setReceiveModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-accent" disabled={saving}>Confirm Receipt</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
