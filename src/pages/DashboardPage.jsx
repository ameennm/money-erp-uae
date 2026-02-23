import { useEffect, useState, useMemo } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import {
    ArrowLeftRight, Users, UserCog,
    TrendingUp, SendHorizonal,
    Banknote, CheckCircle, Wallet, X
} from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, isAfter } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sumF = (arr, f) => arr.reduce((a, d) => a + (Number(d[f]) || 0), 0);

const DATE_RANGES = ['Today', 'This Week', 'This Month', 'All Time'];

const filterByRange = (arr, range) => {
    if (range === 'All Time') return arr;
    const now = new Date();
    const start =
        range === 'Today' ? startOfDay(now) :
            range === 'This Week' ? startOfWeek(now, { weekStartsOn: 1 }) :
                startOfMonth(now);
    return arr.filter(r => isAfter(new Date(r.$createdAt), start));
};

const STATUSES = {
    pending_collection: { label: 'Pending Collection', badge: 'badge-pending' },
    pending_conversion: { label: 'Pending Conversion', badge: 'badge-inprogress' },
    pending_distribution: { label: 'Pending Distribution', badge: 'badge-collector' },
    completed: { label: 'Completed', badge: 'badge-completed' },
};

const statusBadge = (s) => {
    const cfg = STATUSES[s] || STATUSES.pending_collection;
    return <span className={`badge ${cfg.badge}`}>{cfg.label}</span>;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
    const { role } = useAuth();
    const isAdmin = role === 'admin';
    const isCollector = role === 'collector' || isAdmin;

    const [txs, setTxs] = useState([]);
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);

    const [convertModal, setConvertModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [convertForm, setConvertForm] = useState({
        sar_to_convert: '',
        sar_to_aed_rate: '',
        conversion_agent_id: '',
        conversion_agent_name: ''
    });

    // Date range
    const [dateRange, setDateRange] = useState('All Time');

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [t, ag] = await Promise.all([
                dbService.listTransactions(),
                dbService.listAgents(),
            ]);
            setTxs(t.documents);
            setAgents(ag.documents);
        } catch (e) { console.error(e); toast.error('Error loading dashboard'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchAll(); }, []);

    const handleBulkConvert = async (e) => {
        e.preventDefault();
        if (!convertForm.conversion_agent_id) return toast.error('Select a conversion agent');

        let targetAmount = parseFloat(convertForm.sar_to_convert);
        if (isNaN(targetAmount) || targetAmount <= 0) return toast.error('Enter a valid amount to convert');

        setSaving(true);
        try {
            const rate = parseFloat(convertForm.sar_to_aed_rate);
            const toConvert = txs.filter(t => t.status === 'pending_conversion').sort((a, b) => new Date(a.$createdAt) - new Date(b.$createdAt));

            const totalPendingSAR = sumF(toConvert, 'collected_amount');
            if (targetAmount > totalPendingSAR) {
                targetAmount = totalPendingSAR;
            }

            let remainingToConvert = targetAmount;

            for (let tx of toConvert) {
                if (remainingToConvert <= 0) break;

                const txAmount = Number(tx.collected_amount) || 0;

                if (txAmount <= remainingToConvert) {
                    // Full conversion
                    const actualAed = txAmount * rate;
                    await dbService.updateTransaction(tx.$id, {
                        sar_to_aed_rate: rate,
                        actual_aed: parseFloat(actualAed.toFixed(2)),
                        status: 'pending_distribution',
                        conversion_agent_id: convertForm.conversion_agent_id,
                        conversion_agent_name: convertForm.conversion_agent_name
                    });
                    remainingToConvert -= txAmount;
                } else {
                    // Partial conversion (split transaction)
                    const convertedTxAed = remainingToConvert * rate;
                    const convertedTxInrRequested = (tx.inr_requested || 0) * (remainingToConvert / txAmount);

                    // 1. Create split completely converted transaction
                    const payload = {
                        client_name: tx.client_name,
                        inr_requested: parseFloat(convertedTxInrRequested.toFixed(2)),
                        collected_currency: tx.collected_currency,
                        collected_amount: parseFloat(remainingToConvert.toFixed(2)),
                        collection_rate: parseFloat(tx.collection_rate || 0),
                        sar_to_aed_rate: rate,
                        actual_aed: parseFloat(convertedTxAed.toFixed(2)),
                        status: 'pending_distribution',
                        creator_id: tx.creator_id,
                        creator_name: tx.creator_name,
                        collection_agent_id: tx.collection_agent_id,
                        collection_agent_name: tx.collection_agent_name,
                        conversion_agent_id: convertForm.conversion_agent_id,
                        conversion_agent_name: convertForm.conversion_agent_name,
                        distributor_id: tx.distributor_id,
                        distributor_name: tx.distributor_name,
                        tx_id: tx.tx_id + '-C', // Splitting suffix
                        notes: tx.notes ? `${tx.notes} (Split from orig tx)` : '(Split from orig tx)'
                    };

                    // Clean payload optional floats
                    ['collection_rate', 'sar_to_aed_rate', 'actual_aed', 'distributor_id', 'distributor_name'].forEach(f => {
                        if (payload[f] === 0 || !payload[f]) delete payload[f];
                    });

                    await dbService.createTransaction(payload);

                    // 2. Reduce the original transaction
                    const newPendingAmount = txAmount - remainingToConvert;
                    const newPendingInr = (tx.inr_requested || 0) - convertedTxInrRequested;

                    await dbService.updateTransaction(tx.$id, {
                        collected_amount: parseFloat(newPendingAmount.toFixed(2)),
                        inr_requested: parseFloat(newPendingInr.toFixed(2))
                    });

                    remainingToConvert = 0;
                }
            }

            // Record the summary of this bulk conversion for the Conversion Agents page
            const totalAedGenerated = parseFloat((targetAmount * rate).toFixed(2));
            await dbService.createAedConversion({
                sar_amount: targetAmount,
                aed_amount: totalAedGenerated,
                rate: rate,
                conversion_agent_id: convertForm.conversion_agent_id,
                conversion_agent_name: convertForm.conversion_agent_name,
                notes: 'Bulk Dashboard Conversion'
            });

            toast.success(`Successfully converted ${targetAmount} SAR`);
            setConvertModal(false);
            setConvertForm({ sar_to_convert: '', sar_to_aed_rate: '', conversion_agent_id: '', conversion_agent_name: '' });
            fetchAll();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    // ── Filtered data ──────────────────────────────────────────────────────────
    const fTxs = useMemo(() => filterByRange(txs, dateRange), [txs, dateRange]);

    // ── Aggregates ────────────────────────────────────────────────────────────
    const pendingCollection = fTxs.filter(t => t.status === 'pending_collection');
    const pendingConversion = fTxs.filter(t => t.status === 'pending_conversion');
    const pendingDistribution = fTxs.filter(t => t.status === 'pending_distribution');
    const completed = fTxs.filter(t => t.status === 'completed');

    // Balance SAR
    const totalSARCollected = sumF(fTxs.filter(t => t.collected_currency === 'SAR' && t.status !== 'pending_collection'), 'collected_amount');
    const totalSARConverted = sumF(fTxs.filter(t => t.collected_currency === 'SAR' && ['pending_distribution', 'completed'].includes(t.status)), 'collected_amount');
    const balanceSAR = totalSARCollected - totalSARConverted;

    // Balance AED
    const totalAEDGenerated = sumF(fTxs.filter(t => ['pending_distribution', 'completed'].includes(t.status)), 'actual_aed') +
        sumF(fTxs.filter(t => t.collected_currency === 'AED' && t.status !== 'pending_collection' && !t.actual_aed), 'collected_amount');
    const totalAEDDistributed = sumF(completed, 'actual_aed') +
        sumF(completed.filter(t => t.collected_currency === 'AED' && !t.actual_aed), 'collected_amount');
    const balanceAED = totalAEDGenerated - totalAEDDistributed;

    // Balance INR (Sum of distributor balances)
    const balanceINR = sumF(agents.filter(a => a.type === 'distributor'), 'inr_balance');

    // Total Profit (AED)
    const totalProfitAED = sumF(completed, 'profit_aed');

    const recentTxs = fTxs.slice(0, 8);

    if (loading) {
        return (
            <Layout title="Dashboard">
                <div className="loading-screen" style={{ minHeight: '60vh' }}>
                    <div className="spinner" /><p>Loading dashboard…</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="Dashboard">

            {/* ── Date Range Filter ────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24, alignItems: 'center' }}>
                {DATE_RANGES.map(r => (
                    <button key={r} onClick={() => setDateRange(r)} className="btn btn-sm"
                        style={{
                            background: dateRange === r ? 'var(--brand-accent)' : 'var(--bg-card)',
                            color: dateRange === r ? '#fff' : 'var(--text-secondary)',
                            border: `1px solid ${dateRange === r ? 'var(--brand-accent)' : 'var(--border-color)'}`,
                        }}>{r}</button>
                ))}
            </div>

            {/* ── Financial Summary ────────────────────────── */}
            {(isAdmin) && (
                <>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-muted)', marginBottom: 12 }}>
                        Financial Summary — {dateRange}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px,1fr))', gap: 16, marginBottom: 28 }}>
                        {/* Total SAR */}
                        <div className="card" style={{ padding: 20, border: '1px solid rgba(74,158,255,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(74,158,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a9eff', flexShrink: 0 }}>
                                    <TrendingUp size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Available SAR Balance</div>
                                    <div style={{ fontSize: 26, fontWeight: 800, color: '#4a9eff', lineHeight: 1 }}>{balanceSAR.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>pending conversion</div>
                                </div>
                            </div>
                        </div>
                        {/* Balance AED */}
                        <div className="card" style={{ padding: 20, border: '1px solid rgba(245,166,35,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(245,166,35,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-gold)', flexShrink: 0 }}>
                                    <Banknote size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Available AED Balance</div>
                                    <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--brand-gold)', lineHeight: 1 }}>{balanceAED.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>pending distribution</div>
                                </div>
                            </div>
                        </div>
                        {/* Balance INR */}
                        <div className="card" style={{ padding: 20, border: '1px solid rgba(167,139,250,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa', flexShrink: 0 }}>
                                    <SendHorizonal size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Available INR Balance</div>
                                    <div style={{ fontSize: 26, fontWeight: 800, color: '#a78bfa', lineHeight: 1 }}>₹{balanceINR.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>with distributors</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ── Overview Stats ───────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-4">
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-muted)' }}>Operational Overview</div>
                {isAdmin && pendingConversion.length > 0 && (
                    <button className="btn btn-accent btn-sm" onClick={() => setConvertModal(true)}>
                        <ArrowLeftRight size={14} style={{ marginRight: 6 }} /> Bulk Convert {pendingConversion.length} SAR Transactions
                    </button>
                )}
            </div>
            <div className="stats-grid">
                <div className="stat-card" style={{ '--accent-bar': 'var(--status-pending)' }}>
                    <div className="stat-value">{pendingCollection.length}</div>
                    <div className="stat-label">Pending Collection</div>
                </div>
                <div className="stat-card" style={{ '--accent-bar': 'var(--status-inprogress)' }}>
                    <div className="stat-value">{pendingConversion.length}</div>
                    <div className="stat-label">Pending Conversion</div>
                </div>
                <div className="stat-card" style={{ '--accent-bar': '#a78bfa' }}>
                    <div className="stat-value">{pendingDistribution.length}</div>
                    <div className="stat-label">Pending Distribution</div>
                </div>
                <div className="stat-card" style={{ '--accent-bar': 'var(--status-completed)' }}>
                    <div className="stat-value">{completed.length}</div>
                    <div className="stat-label">Completed Transactions</div>
                </div>

                {isAdmin && (
                    <>
                        <div className="stat-card" style={{ '--accent-bar': '#4a9eff' }}>
                            <div className="stat-icon" style={{ '--icon-bg': 'rgba(74,158,255,0.15)', '--icon-color': '#4a9eff' }}><Users size={20} /></div>
                            <div className="stat-value">{agents.length}</div>
                            <div className="stat-label">Active Agents</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon"><UserCog size={20} /></div>
                            <div className="stat-value">{agents.filter(a => a.type === 'distributor').length}</div>
                            <div className="stat-label">Distributors</div>
                        </div>
                    </>
                )}
            </div>

            {/* ── Recent Transactions ──────────────────────────────────────────── */}
            <div className="card section-gap" style={{ marginTop: 28 }}>
                <div className="card-header">
                    <div>
                        <div className="card-title">Recent Transactions</div>
                        <div className="card-subtitle">{dateRange} — {recentTxs.length} shown</div>
                    </div>
                </div>
                {recentTxs.length === 0 ? (
                    <div className="empty-state"><Banknote size={40} /><p>No transactions in this period.</p></div>
                ) : (
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>TX ID</th><th>Client</th><th>Collection Agent</th>
                                    <th>Collected</th><th>Status</th><th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentTxs.map(tx => (
                                    <tr key={tx.$id}>
                                        <td><span className="tx-id">{tx.tx_id || tx.$id.slice(0, 8)}</span></td>
                                        <td style={{ fontWeight: 600 }}>{tx.client_name}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{tx.collection_agent_name || '—'}</td>
                                        <td>
                                            <span className={`currency ${tx.collected_currency?.toLowerCase()}`}>
                                                {Number(tx.collected_amount || 0).toLocaleString()} {tx.collected_currency}
                                            </span>
                                        </td>
                                        <td>{statusBadge(tx.status)}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{tx.$createdAt ? format(new Date(tx.$createdAt), 'dd MMM yy') : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Bulk Convert Modal */}
            {convertModal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConvertModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">Bulk SAR Conversion</h3>
                            <button className="close-btn" onClick={() => setConvertModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleBulkConvert}>
                            <div className="modal-body">
                                <div className="card mb-4" style={{ background: 'var(--bg-main)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Total Available to Convert:</span>
                                        <span style={{ fontWeight: 800, color: 'var(--brand-accent)' }}>
                                            {sumF(pendingConversion, 'collected_amount').toLocaleString()} SAR
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                        (From {pendingConversion.length} transaction{pendingConversion.length !== 1 ? 's' : ''})
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Total Amount to Convert (SAR) *</label>
                                    <input className="form-input" type="number" step="0.01" placeholder="e.g. 50000" required
                                        value={convertForm.sar_to_convert} onChange={e => setConvertForm({ ...convertForm, sar_to_convert: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Conversion Rate (SAR to AED) *</label>
                                    <input className="form-input" type="number" step="0.0001" placeholder="e.g. 0.975" required
                                        value={convertForm.sar_to_aed_rate} onChange={e => setConvertForm({ ...convertForm, sar_to_aed_rate: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Conversion Agent *</label>
                                    <select className="form-select" required
                                        value={convertForm.conversion_agent_id}
                                        onChange={e => {
                                            const ag = agents.find(a => a.$id === e.target.value);
                                            setConvertForm({ ...convertForm, conversion_agent_id: ag?.$id || '', conversion_agent_name: ag?.name || '' });
                                        }}>
                                        <option value="">Select Agent...</option>
                                        {agents.filter(a => a.type === 'conversion').map(a => (
                                            <option key={a.$id} value={a.$id}>{a.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setConvertModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-accent" disabled={saving || pendingConversion.length === 0}>
                                    {saving ? 'Converting...' : 'Convert Transactions'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
