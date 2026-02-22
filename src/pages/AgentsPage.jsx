import { useState, useEffect } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Plus, X, Pencil, Trash2, Users, Phone, MapPin } from 'lucide-react';

const EMPTY = { name: '', phone: '', location: '', notes: '' };

export default function AgentsPage() {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);

    const fetch = async () => {
        setLoading(true);
        try {
            const r = await dbService.listAgents();
            setAgents(r.documents);
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
        setForm({ name: a.name || '', phone: a.phone || '', location: a.location || '', notes: a.notes || '' });
        setModal(true);
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

    return (
        <Layout title="Agents">
            <div className="flex items-center justify-between mb-6">
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
                                                {a.name}
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
