import { useState, useEffect } from 'react';
import { dbService, Query } from '../lib/appwrite';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Plus, X, Pencil, Trash2, Users, Phone, MapPin, List } from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, isAfter } from 'date-fns';

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

const EMPTY = { name: '', phone: '', location: '', notes: '', currency: 'SAR', type: 'collection' };

export default function AgentsPage() {
    const [agents, setAgents] = useState([]);
    const [txs, setTxs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [viewingAgent, setViewingAgent] = useState(null);
    const [dateRange, setDateRange] = useState('All Time');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [editItem, setEditItem] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);

    const fetch = async () => {
        setLoading(true);
        try {
            const [ar, tr] = await Promise.all([
                dbService.listAgents([Query.equal('type', 'collection')]),
                dbService.listTransactions(),
            ]);
            setAgents(ar.documents);
            setTxs(tr.documents);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetch(); }, []);

    const openNew = () => { setEditItem(null); setForm(EMPTY); setModal(true); };
    const openEdit = (a) => {
        setEditItem(a);
        setForm({ name: a.name || '', phone: a.phone || '', location: a.location || '', notes: a.notes || '', currency: a.currency || 'SAR', type: a.type || 'collection' });
        setModal(true);
    };

    const openHistory = (a) => {
        setViewingAgent(a);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editItem) {
                await dbService.updateAgent(editItem.$id, form);
                toast.success('Agent updated');
            } else {
                await dbService.createAgent(form);
                toast.success('Agent added');
            }
            setModal(false);
            fetch();
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
            fetch();
        } catch (e) {
            toast.error(e.message);
        }
    };

    const getAgentTxs = (agentId) => {
        let agentRecords = txs.filter(t => t.collection_agent_id === agentId);
        agentRecords.sort((a, b) => new Date(a.$createdAt) - new Date(b.$createdAt));

        let runningTotal = 0;
        const mapped = agentRecords.map(t => {
            runningTotal += Number(t.collected_amount) || 0;
            return {
                ...t,
                running_balance: runningTotal
            };
        });

        return mapped;
    };

    return (
        <Layout title="Agents">
            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <div>
                    <h3 style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                        {agents.length} agent{agents.length !== 1 ? 's' : ''} registered
                    </h3>
                </div>
                <button id="new-agent-btn" className="btn btn-accent" onClick={openNew}>
                    <Plus size={16} /> Add Agent
                </button>
            </div>

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
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Location</th>
                                    <th>Currency</th>
                                    <th>Notes</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {agents.map((a, i) => (
                                    <tr key={a.$id}>
                                        <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                        <td style={{ fontWeight: 600 }}>
                                            <div className="flex items-center gap-2">
                                                <div style={{
                                                    width: 32, height: 32, borderRadius: '50%',
                                                    background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0
                                                }}>
                                                    {a.name?.[0]?.toUpperCase()}
                                                </div>
                                                <button
                                                    onClick={() => openHistory(a)}
                                                    style={{
                                                        background: 'none', border: 'none', padding: 0,
                                                        fontWeight: 'inherit', cursor: 'pointer',
                                                        textDecoration: 'underline', color: 'var(--brand-accent)'
                                                    }}
                                                >
                                                    {a.name}
                                                </button>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                                                <Phone size={13} /> {a.phone || '—'}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                                                <MapPin size={13} /> {a.location || '—'}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${a.currency === 'AED' ? 'badge-admin' : 'badge-collector'}`}>
                                                {a.currency || 'SAR'}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{a.notes || '—'}</td>
                                        <td>
                                            <div className="flex gap-2">
                                                <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(a)}>
                                                    <Pencil size={14} />
                                                </button>
                                                <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(a.$id)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {viewingAgent && (() => {
                const allTxs = getAgentTxs(viewingAgent.$id);
                const filteredTxs = applyDateRange(allTxs, dateRange, customFrom, customTo);

                return (
                    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setViewingAgent(null)}>
                        <div className="modal" style={{ maxWidth: '900px', width: '90%', maxHeight: '90vh' }}>
                            <div className="modal-header">
                                <div>
                                    <h3 className="modal-title">Transaction Ledger: {viewingAgent.name}</h3>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Showing collections assigned to this agent
                                    </div>
                                </div>
                                <button className="close-btn" onClick={() => setViewingAgent(null)}><X size={20} /></button>
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
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Period Collections</div>
                                        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--brand-primary)' }}>
                                            {filteredTxs.reduce((sum, t) => sum + (Number(t.collected_amount) || 0), 0).toLocaleString()} <span style={{ fontSize: 12 }}> {viewingAgent.currency || 'SAR'}</span>
                                        </div>
                                    </div>
                                    <div className="card" style={{ padding: '16px', background: 'rgba(0,200,150,0.05)' }}>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Transaction Count</div>
                                        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--brand-accent)' }}>
                                            {filteredTxs.length}
                                        </div>
                                    </div>
                                </div>

                                <div className="table-wrapper" style={{ flex: 1 }}>
                                    <table className="data-table" style={{ fontSize: 13 }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: 40 }}>#</th>
                                                <th>Date</th>
                                                <th>Ref/Client</th>
                                                <th style={{ textAlign: 'right' }}>Collected</th>
                                                <th style={{ textAlign: 'right' }}>Running Bal</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTxs.length === 0 ? (
                                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>No records found for active filters.</td></tr>
                                            ) : (
                                                filteredTxs.map((t, idx) => (
                                                    <tr key={t.$id}>
                                                        <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                                                        <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{t.$createdAt ? format(new Date(t.$createdAt), 'dd MMM yy HH:mm') : '—'}</td>
                                                        <td style={{ fontWeight: 500 }}>
                                                            <span style={{ color: 'var(--brand-accent)', fontSize: 11, marginRight: 6 }}>#{t.tx_id}</span>
                                                            <br />{t.client_name}
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--brand-primary)' }}>
                                                            {Number(t.collected_amount).toLocaleString()} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.collected_currency}</span>
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 800 }}>
                                                            {Number(t.running_balance).toLocaleString()} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.collected_currency}</span>
                                                        </td>
                                                        <td>
                                                            <span className="badge badge-collector" style={{ fontSize: 10 }}>
                                                                {t.status.replace('_', ' ')}
                                                            </span>
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
        </Layout>
    );
}
