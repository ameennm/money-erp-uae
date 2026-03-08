import { useState, useEffect } from 'react';
import { dbService, Query } from '../lib/appwrite';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import {
    Plus, X, Pencil, Trash2, RefreshCw, Phone,
    TrendingUp, Banknote, Wallet, Calendar, List, Download
} from 'lucide-react';
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

const EMPTY = { name: '', phone: '', notes: '', type: 'conversion_sar', currency: 'AED' };

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
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [viewingAgent, setViewingAgent] = useState(null);
    const [dateRange, setDateRange] = useState('All Time');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [editItem, setEditItem] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);

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
    useEffect(() => { fetchAll(); }, []);

    // ── Per-agent stats ───────────────────────────────────────────────────────
    const agentStats = (agentId) => {
        const recs = convRecs.filter(r => r.conversion_agent_id === agentId);
        return {
            count: recs.length,
            sarSent: recs.reduce((a, r) => a + (Number(r.sar_amount) || 0), 0),
            aedGot: recs.reduce((a, r) => a + (Number(r.aed_amount) || 0), 0),
            profit: recs.reduce((a, r) => a + (Number(r.profit_inr) || 0), 0),
        };
    };

    const openNew = () => { setEditItem(null); setForm(EMPTY); setModal(true); };
    const openEdit = (a) => { setEditItem(a); setForm({ name: a.name || '', phone: a.phone || '', notes: a.notes || '', type: a.type || 'conversion_sar', currency: 'AED' }); setModal(true); };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editItem) { await dbService.updateAgent(editItem.$id, form); toast.success('Updated'); }
            else { await dbService.createAgent(form); toast.success('Conversion agent added'); }
            setModal(false);
            fetchAll();
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
            fetchAll();
        } catch (e) { toast.error(e.message); }
    };

    return (
        <Layout title="Conversion Agents">
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    These agents convert <strong>SAR → AED</strong> for us. Select one when recording a conversion on the Dashboard.
                </div>
            </div>

            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {agents.length} agent{agents.length !== 1 ? 's' : ''} · {convRecs.length} total conversions recorded
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }}>
                    {agents.map((a) => {
                        const s = agentStats(a.$id);
                        return (
                            <div key={a.$id} className="card" style={{ padding: 20, border: '1px solid rgba(0,200,150,0.12)', transition: 'transform 0.2s', cursor: 'pointer' }}
                                onClick={(e) => {
                                    if (e.target.closest('button')) return; // skip if clicking edit/delete
                                    setViewingAgent(a);
                                }}>
                                {/* Agent header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                        {a.name?.[0]?.toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: 16 }}>{a.name}</div>
                                        <div style={{ marginTop: 4 }}>{convTypeBadge(a.type)}</div>
                                        {a.phone && (
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                                <Phone size={11} /> {a.phone}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button
                                            className="btn btn-outline btn-sm btn-icon"
                                            title="View History"
                                            onClick={() => setViewingAgent(a)}
                                        >
                                            <List size={13} />
                                        </button>
                                        <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(a)}><Pencil size={13} /></button>
                                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(a)}><Trash2 size={13} /></button>
                                    </div>
                                </div>

                                {/* Stats row */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{a.type === 'conversion_aed' ? 'AED Sent' : 'SAR Sent'}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                            <TrendingUp size={13} style={{ color: a.type === 'conversion_aed' ? 'var(--brand-gold)' : '#4a9eff' }} />
                                            <span style={{ fontWeight: 700, color: a.type === 'conversion_aed' ? 'var(--brand-gold)' : '#4a9eff', fontSize: 15 }}>{s.sarSent.toLocaleString()}</span>
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{s.count} conversion{s.count !== 1 ? 's' : ''}</div>
                                    </div>
                                    <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{a.type === 'conversion_aed' ? 'INR Got' : 'AED Got'}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                            <Banknote size={13} style={{ color: a.type === 'conversion_aed' ? 'var(--text-primary)' : 'var(--brand-gold)' }} />
                                            <span style={{ fontWeight: 700, color: a.type === 'conversion_aed' ? 'var(--text-primary)' : 'var(--brand-gold)', fontSize: 15 }}>{s.aedGot.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{a.type === 'conversion_aed' ? 'INR' : 'AED'}</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Profit</div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                            <Wallet size={13} style={{ color: s.profit >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)' }} />
                                            <span style={{ fontWeight: 700, color: s.profit >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)', fontSize: 15 }}>
                                                ₹{Math.abs(s.profit).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>INR net</div>
                                    </div>
                                </div>

                                {a.notes && (
                                    <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '6px 10px' }}>
                                        {a.notes}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* History Modal */}
            {viewingAgent && (() => {
                let recs = convRecs.filter(r => r.conversion_agent_id === viewingAgent.$id);
                // sort chronologically to compute running totals
                recs.sort((a, b) => new Date(a.$createdAt || a.date) - new Date(b.$createdAt || b.date));

                let runningAED = 0;
                let runningProfit = 0;
                let allTxs = recs.map(r => {
                    runningAED += Number(r.aed_amount) || 0;
                    runningProfit += Number(r.profit_inr) || 0;
                    return {
                        ...r,
                        running_aed: runningAED,
                        running_profit: runningProfit
                    };
                });

                const filteredTxs = applyDateRange(allTxs, dateRange, customFrom, customTo);

                const exportLedgerExcel = () => {
                    const rows = filteredTxs.map((r, idx) => ({
                        '#': idx + 1,
                        'Date': r.date || '',
                        'SAR Sent': Number(r.sar_amount),
                        'Rate': r.sar_rate,
                        'AED Received': Number(r.aed_amount),
                        'AED Running Balance': Number(r.running_aed),
                        'Profit INR': Number(r.profit_inr || 0),
                        'Notes': r.notes || '',
                    }));
                    const ws = XLSX.utils.json_to_sheet(rows);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, viewingAgent.name);
                    XLSX.writeFile(wb, `conversion_${viewingAgent.name}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
                };

                return (
                    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setViewingAgent(null)}>
                        <div className="modal" style={{ maxWidth: '950px', width: '90%', maxHeight: '90vh' }}>
                            <div className="modal-header">
                                <div>
                                    <h3 className="modal-title">Conversion Ledger: {viewingAgent.name}</h3>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        {viewingAgent.type === 'conversion_aed' ? 'AED → INR' : 'SAR → AED'} conversions handled by this agent
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button className="btn btn-outline btn-sm" onClick={exportLedgerExcel} title="Export to Excel">
                                        <Download size={14} /> Excel
                                    </button>
                                    <button className="close-btn" onClick={() => setViewingAgent(null)}><X size={20} /></button>
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

                                <div className="table-wrapper" style={{ flex: 1 }}>
                                    <table className="data-table" style={{ fontSize: 13 }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: 40 }}>#</th>
                                                <th>Date</th>
                                                <th style={{ textAlign: 'right' }}>{viewingAgent.type === 'conversion_aed' ? 'Sent (AED)' : 'Sent (SAR)'}</th>
                                                <th style={{ textAlign: 'center' }}>Rate</th>
                                                <th style={{ textAlign: 'right' }}>{viewingAgent.type === 'conversion_aed' ? 'Received (INR)' : 'Received (AED)'}</th>
                                                <th style={{ textAlign: 'right' }}>{viewingAgent.type === 'conversion_aed' ? 'INR Balance' : 'AED Balance'}</th>
                                                <th style={{ textAlign: 'right' }}>Profit (INR)</th>
                                                <th>Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTxs.length === 0 ? (
                                                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>No conversion records found.</td></tr>
                                            ) : (
                                                filteredTxs.map((r, idx) => {
                                                    const isAedToInr = viewingAgent.type === 'conversion_aed';
                                                    return (
                                                        <tr key={r.$id}>
                                                            <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                                                            <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                                                                <div className="flex items-center gap-1"><Calendar size={12} /> {r.date}</div>
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 700, color: isAedToInr ? 'var(--brand-gold)' : undefined }}>
                                                                {isAedToInr ? Number(r.aed_amount).toLocaleString() : Number(r.sar_amount).toLocaleString()}
                                                            </td>
                                                            <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                                {isAedToInr ? r.aed_to_inr_rate || '—' : r.sar_rate}
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 700, color: isAedToInr ? 'var(--text-primary)' : 'var(--brand-gold)' }}>
                                                                +{isAedToInr ? Number(r.inr_amount || 0).toLocaleString('en-IN') : Number(r.aed_amount).toLocaleString()}
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 800 }}>
                                                                {isAedToInr ? Number(r.running_inr || 0).toLocaleString('en-IN') : Number(r.running_aed).toLocaleString()}
                                                            </td>
                                                            <td style={{ textAlign: 'right', color: r.profit_inr >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)', fontWeight: 600 }}>
                                                                {r.profit_inr >= 0 ? '+' : ''}₹{Number(r.profit_inr).toLocaleString('en-IN')}
                                                            </td>
                                                            <td style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes || '—'}</td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colSpan={2} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>GRAND TOTAL</td>
                                                <td style={{ textAlign: 'right', fontWeight: 800, color: viewingAgent.type === 'conversion_aed' ? 'var(--brand-gold)' : undefined }}>
                                                    {filteredTxs.reduce((a, r) => a + (Number(viewingAgent.type === 'conversion_aed' ? r.aed_amount : r.sar_amount) || 0), 0).toLocaleString()}
                                                </td>
                                                <td></td>
                                                <td style={{ textAlign: 'right', fontWeight: 800, color: viewingAgent.type === 'conversion_aed' ? 'var(--text-primary)' : 'var(--brand-gold)' }}>
                                                    {filteredTxs.reduce((a, r) => a + (Number(viewingAgent.type === 'conversion_aed' ? r.inr_amount || 0 : r.aed_amount) || 0), 0).toLocaleString()}
                                                </td>
                                                <td></td>
                                                <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand-accent)' }}>
                                                    ₹{filteredTxs.reduce((a, r) => a + (Number(r.profit_inr) || 0), 0).toLocaleString('en-IN')}
                                                </td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
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
                                <div className="form-group">
                                    <label className="form-label">Phone</label>
                                    <input id="ca-phone" className="form-input" placeholder="+966 5X XXX XXXX"
                                        value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
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
                </div >
            )
            }
        </Layout >
    );
}
