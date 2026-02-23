import { useEffect, useState, useMemo } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import {
    ArrowLeftRight, Users, UserCog,
    TrendingUp, TrendingDown, Clock,
    CheckCircle, AlertCircle, SendHorizonal,
    Banknote, RefreshCw, X, Wallet, Scale
} from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, isAfter } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sumF = (arr, f) => arr.reduce((a, d) => a + (Number(d[f]) || 0), 0);

const DATE_RANGES = ['Today', 'This Week', 'This Month', 'All Time', 'Custom'];

const filterByRange = (arr, range, from, to) => {
    if (range === 'All Time') return arr;
    const now = new Date();
    if (range === 'Custom') {
        return arr.filter(r => {
            const d = new Date(r.$createdAt);
            const f = from ? new Date(from) : null;
            const t = to ? new Date(to + 'T23:59:59') : null;
            return (!f || d >= f) && (!t || d <= t);
        });
    }
    const start =
        range === 'Today' ? startOfDay(now) :
            range === 'This Week' ? startOfWeek(now, { weekStartsOn: 1 }) :
                startOfMonth(now);
    return arr.filter(r => isAfter(new Date(r.$createdAt), start));
};

const STATUSES = {
    pending: { label: 'Pending', badge: 'badge-pending' },
    sar_sent: { label: 'Sent to Conversion Agent', badge: 'badge-inprogress' },
    aed_received: { label: 'AED Received', badge: 'badge-collector' },
    completed: { label: 'Completed (INR)', badge: 'badge-completed' },
    failed: { label: 'Failed', badge: 'badge-failed' },
};
const statusBadge = (s) => {
    const cfg = STATUSES[s] || STATUSES.pending;
    return <span className={`badge ${cfg.badge}`}>{cfg.label}</span>;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
    const { role } = useAuth();
    const isSuperAdmin = role === 'superadmin';
    const isCollector = role === 'collector';

    const [txs, setTxs] = useState([]);
    const [agents, setAgents] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [aedConvs, setAedConvs] = useState([]);
    const [convAgents, setConvAgents] = useState([]);
    const [credits, setCredits] = useState([]);
    const [loading, setLoading] = useState(true);

    // Date range
    const [dateRange, setDateRange] = useState('Today');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    // Convert to AED modal
    const [convModal, setConvModal] = useState(false);
    const [convForm, setConvForm] = useState({ sar_amount: '', sar_rate: '', aed_inr_rate: '', conversion_agent_id: '', notes: '' });
    const [convSaving, setConvSaving] = useState(false);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [t, ag, em, ex, ac, ca, cr] = await Promise.all([
                dbService.listTransactions(),
                dbService.listAgents(),
                isSuperAdmin ? dbService.listEmployees() : Promise.resolve({ documents: [] }),
                isSuperAdmin ? dbService.listExpenses() : Promise.resolve({ documents: [] }),
                dbService.listAedConversions(),
                dbService.listConversionAgents(),
                dbService.listCredits(),
            ]);
            setTxs(t.documents);
            setAgents(ag.documents);
            setEmployees(em.documents);
            setExpenses(ex.documents);
            setAedConvs(ac.documents);
            setConvAgents(ca.documents);
            setCredits(cr.documents);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchAll(); }, []);

    // ── Filtered data ──────────────────────────────────────────────────────────
    const fTxs = useMemo(() => filterByRange(txs, dateRange, customFrom, customTo), [txs, dateRange, customFrom, customTo]);
    const fAedConvs = useMemo(() => filterByRange(aedConvs, dateRange, customFrom, customTo), [aedConvs, dateRange, customFrom, customTo]);
    const filteredCredits = useMemo(() => filterByRange(credits, dateRange, customFrom, customTo), [credits, dateRange, customFrom, customTo]);

    // ── Aggregates ────────────────────────────────────────────────────────────
    const pending = fTxs.filter(t => t.status === 'pending');
    const sarSent = fTxs.filter(t => t.status === 'sar_sent');
    const aedReceived = fTxs.filter(t => t.status === 'aed_received');
    const completed = fTxs.filter(t => t.status === 'completed');

    // ── Period-based totals (for summary cards) ─────────────────────
    const totalSARReceived = sumF(fTxs, 'amount_sar') + sumF(filteredCredits.filter(c => c.admin_approved), 'amount_sar');
    const totalSARTransferred = sumF(fAedConvs, 'sar_amount');
    const totalAED = sumF(fAedConvs, 'aed_amount');
    const totalINR = sumF(fTxs.filter(t => t.status === 'completed'), 'amount_inr');
    const totalExp = sumF(expenses, 'amount');
    // Live profit: Sum of all historical conversion profits MINUS current outstanding debt
    const historicalProfit = sumF(aedConvs, 'profit_inr');
    const currentDebt = sumF(
        txs.filter(t => ['pending', 'sar_sent', 'aed_received'].includes(t.status)),
        'client_inr'
    );
    const totalProfit = historicalProfit - currentDebt;

    // ── All-time balance (actual cash in hand) ─────────────────────
    const allTimeSARReceived = sumF(txs, 'amount_sar') + sumF(credits.filter(c => c.admin_approved), 'amount_sar');
    const allTimeSARTransferred = sumF(aedConvs, 'sar_amount');
    const balanceSAR = allTimeSARReceived - allTimeSARTransferred;

    // INR we owe to clients = sum of client_inr for ALL active (non-completed) transactions
    const inrPromised = sumF(
        txs.filter(t => ['pending', 'sar_sent', 'aed_received'].includes(t.status)),
        'client_inr'
    );

    // ── Conversion form auto-calc ──────────────────────────────────────────────
    const convSAR = parseFloat(convForm.sar_amount) || 0;
    const convRate = parseFloat(convForm.sar_rate) || 0;
    const convAEDInr = parseFloat(convForm.aed_inr_rate) || 0;

    // Proportional cost calculation for the batch being converted
    const avgRate = balanceSAR > 0 ? (inrPromised / balanceSAR) : 0;
    const batchCost = convSAR * avgRate;

    const calcAED = convRate > 0 ? (convSAR / convRate) : 0;
    const calcINRGet = calcAED * convAEDInr;
    const calcProfit = calcINRGet - batchCost;

    // ── Batch update (for day-close) ──────────────────────────────────────────
    const batchUpdate = async (arr, toStatus, label) => {
        if (arr.length === 0) { toast.error('No transactions to update.'); return; }
        if (!window.confirm(`Mark all ${arr.length} transactions as "${label}"?`)) return;
        try {
            await Promise.all(arr.map(t => dbService.updateTransaction(t.$id, { status: toStatus })));
            toast.success(`${arr.length} transactions → ${label}`);
            fetchAll();
        } catch (e) { toast.error(e.message); }
    };

    // ── Save AED conversion record ────────────────────────────────────────────
    const handleConvSave = async (e) => {
        e.preventDefault();
        if (convSAR <= 0) { toast.error('Enter SAR amount'); return; }
        if (convRate <= 0) { toast.error('Enter conversion rate'); return; }
        if (!convForm.conversion_agent_id) { toast.error('Select a Conversion Agent'); return; }
        const selectedAgent = convAgents.find(a => a.$id === convForm.conversion_agent_id);
        setConvSaving(true);
        try {
            await dbService.createAedConversion({
                sar_amount: convSAR,
                rate_sar_aed: convRate,
                aed_amount: parseFloat(calcAED.toFixed(4)),
                rate_aed_inr: convAEDInr,
                inr_received: parseFloat(calcINRGet.toFixed(2)),
                inr_expected: parseFloat(batchCost.toFixed(2)),
                profit_inr: parseFloat(calcProfit.toFixed(2)),
                conversion_agent_id: convForm.conversion_agent_id,
                conversion_agent_name: selectedAgent?.name || '',
                date: format(new Date(), 'yyyy-MM-dd'),
                notes: convForm.notes,
            });

            // Mark involved transactions
            // Flow: pending -> sar_sent (Step 2) -> completed (on conversion save)
            const sarSentAll = txs.filter(t => t.status === 'sar_sent');

            if (sarSentAll.length > 0) {
                // If this conversion covers most/all of the balance, mark all as completed
                // Otherwise mark as aed_received to indicate they are "in-progress"
                const isFullConversion = convSAR >= (balanceSAR * 0.98);
                const nextStatus = isFullConversion ? 'completed' : 'aed_received';

                await Promise.all(sarSentAll.map(t => dbService.updateTransaction(t.$id, { status: nextStatus })));
                toast.success(`Conversion recorded · ${sarSentAll.length} transactions → ${isFullConversion ? 'Completed' : 'AED Received'}`);
            } else {
                toast.success('Conversion recorded');
            }
            setConvModal(false);
            setConvForm({ sar_amount: '', sar_rate: '', aed_inr_rate: '', conversion_agent_id: '', notes: '' });
            fetchAll();
        } catch (e) { toast.error(e.message); }
        finally { setConvSaving(false); }
    };

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
                {dateRange === 'Custom' && (
                    <>
                        <input type="date" className="form-input" style={{ maxWidth: 148, padding: '6px 10px', fontSize: 13 }}
                            value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                        <span style={{ color: 'var(--text-muted)' }}>to</span>
                        <input type="date" className="form-input" style={{ maxWidth: 148, padding: '6px 10px', fontSize: 13 }}
                            value={customTo} onChange={e => setCustomTo(e.target.value)} />
                    </>
                )}
            </div>

            {/* ── Financial Summary (Collector + Admin) ────────────────────────── */}
            {(isCollector || isSuperAdmin) && (
                <>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-muted)', marginBottom: 12 }}>
                        Financial Summary — {dateRange}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px,1fr))', gap: 16, marginBottom: 28 }}>
                        {/* Total Received */}
                        <div className="card" style={{ padding: 20, border: '1px solid rgba(74,158,255,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(74,158,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a9eff', flexShrink: 0 }}>
                                    <TrendingUp size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Total SAR Received</div>
                                    <div style={{ fontSize: 26, fontWeight: 800, color: '#4a9eff', lineHeight: 1 }}>{totalSARReceived.toLocaleString()}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>from {fTxs.length} transactions</div>
                                </div>
                            </div>
                        </div>
                        {/* Transferred */}
                        <div className="card" style={{ padding: 20, border: '1px solid rgba(245,166,35,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(245,166,35,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-gold)', flexShrink: 0 }}>
                                    <SendHorizonal size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Transferred to Conv. Agent</div>
                                    <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--brand-gold)', lineHeight: 1 }}>{totalSARTransferred.toLocaleString()}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fAedConvs.length} conversion{fAedConvs.length !== 1 ? 's' : ''}</div>
                                </div>
                            </div>
                        </div>
                        {/* Balance */}
                        <div className="card" style={{ padding: 20, border: `1px solid ${balanceSAR >= 0 ? 'rgba(0,200,150,0.25)' : 'rgba(255,84,112,0.25)'}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: balanceSAR >= 0 ? 'rgba(0,200,150,0.15)' : 'rgba(255,84,112,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: balanceSAR >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)', flexShrink: 0 }}>
                                    <Scale size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Balance (SAR)</div>
                                    <div style={{ fontSize: 26, fontWeight: 800, color: balanceSAR >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)', lineHeight: 1 }}>
                                        {balanceSAR >= 0 ? '+' : ''}{balanceSAR.toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>pending in hand</div>
                                </div>
                            </div>
                        </div>
                        {/* AED Received */}
                        <div className="card" style={{ padding: 20, border: '1px solid rgba(167,139,250,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa', flexShrink: 0 }}>
                                    <Banknote size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Total AED Received</div>
                                    <div style={{ fontSize: 26, fontWeight: 800, color: '#a78bfa', lineHeight: 1 }}>{totalAED.toLocaleString()}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>from conversions</div>
                                </div>
                            </div>
                        </div>
                        {/* Profit */}
                        <div className="card" style={{ padding: 20, border: `1px solid ${totalProfit >= 0 ? 'rgba(0,200,150,0.25)' : 'rgba(255,84,112,0.25)'}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: totalProfit >= 0 ? 'rgba(0,200,150,0.15)' : 'rgba(255,84,112,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: totalProfit >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)', flexShrink: 0 }}>
                                    <Wallet size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Net Profit (INR)</div>
                                    <div style={{ fontSize: 26, fontWeight: 800, color: totalProfit >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)', lineHeight: 1 }}>
                                        ₹{totalProfit.toLocaleString('en-IN')}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>INR earned - promised</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ── Day-Close Actions ────────────────────────────────────────────── */}
            {(isCollector || isSuperAdmin) && (
                <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-muted)', marginBottom: 12 }}>
                        Day Close Actions
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
                        {/* Convert to AED */}
                        <div className="card" style={{ border: '1px solid rgba(0,200,150,0.3)', padding: 20, background: 'rgba(0,200,150,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(0,200,150,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-accent)', flexShrink: 0 }}>
                                    <RefreshCw size={20} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Convert SAR → AED</div>
                                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                                        {balanceSAR.toLocaleString()} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>SAR</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 12px' }}>
                                        balance in hand · {txs.filter(t => ['pending', 'sar_sent'].includes(t.status)).length} active transactions
                                    </div>
                                    <button id="dash-btn-convert-aed" className="btn btn-sm btn-accent"
                                        onClick={() => setConvModal(true)}>
                                        Convert to AED →
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Overview Stats ───────────────────────────────────────────────── */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-muted)', marginBottom: 12 }}>Overview</div>
            <div className="stats-grid">
                <div className="stat-card" style={{ '--accent-bar': 'var(--status-pending)' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(245,166,35,0.15)', '--icon-color': 'var(--status-pending)' }}><Clock size={20} /></div>
                    <div className="stat-value">{pending.length}</div>
                    <div className="stat-label">Pending</div>
                </div>
                <div className="stat-card" style={{ '--accent-bar': 'var(--status-inprogress)' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(74,158,255,0.15)', '--icon-color': 'var(--status-inprogress)' }}><SendHorizonal size={20} /></div>
                    <div className="stat-value">{sarSent.length}</div>
                    <div className="stat-label">Sent to Conv. Agent</div>
                </div>
                <div className="stat-card" style={{ '--accent-bar': '#a78bfa' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(167,139,250,0.15)', '--icon-color': '#a78bfa' }}><Banknote size={20} /></div>
                    <div className="stat-value">{aedReceived.length}</div>
                    <div className="stat-label">AED Received</div>
                </div>
                <div className="stat-card" style={{ '--accent-bar': 'var(--status-completed)' }}>
                    <div className="stat-icon"><CheckCircle size={20} /></div>
                    <div className="stat-value">{completed.length}</div>
                    <div className="stat-label">Completed</div>
                </div>
                <div className="stat-card" style={{ '--accent-bar': '#4a9eff' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(74,158,255,0.15)', '--icon-color': '#4a9eff' }}><TrendingUp size={20} /></div>
                    <div className="stat-value">{totalSARReceived.toLocaleString()}</div>
                    <div className="stat-label">Total SAR</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon"><TrendingUp size={20} /></div>
                    <div className="stat-value">₹{totalINR.toLocaleString('en-IN')}</div>
                    <div className="stat-label">Total INR Disbursed</div>
                </div>
                {isSuperAdmin && (
                    <>
                        <div className="stat-card" style={{ '--accent-bar': 'var(--status-failed)' }}>
                            <div className="stat-icon" style={{ '--icon-bg': 'rgba(255,84,112,0.15)', '--icon-color': 'var(--status-failed)' }}><TrendingDown size={20} /></div>
                            <div className="stat-value">₹{totalExp.toLocaleString('en-IN')}</div>
                            <div className="stat-label">Total Expenses</div>
                        </div>
                        <div className="stat-card" style={{ '--accent-bar': '#4a9eff' }}>
                            <div className="stat-icon" style={{ '--icon-bg': 'rgba(74,158,255,0.15)', '--icon-color': '#4a9eff' }}><Users size={20} /></div>
                            <div className="stat-value">{agents.length}</div>
                            <div className="stat-label">Active Agents</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon"><UserCog size={20} /></div>
                            <div className="stat-value">{employees.length}</div>
                            <div className="stat-label">Employees</div>
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
                    <div className="empty-state"><AlertCircle size={40} /><p>No transactions in this period.</p></div>
                ) : (
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>TX ID</th><th>Client</th><th>Agent</th>
                                    <th>SAR Received</th><th>SAR Given</th>
                                    <th>Client Gets (INR)</th><th>Status</th><th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentTxs.map(tx => (
                                    <tr key={tx.$id}>
                                        <td><span className="tx-id">{tx.tx_id || tx.$id.slice(0, 8)}</span></td>
                                        <td style={{ fontWeight: 600 }}>{tx.client_name}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{tx.agent_name || '—'}</td>
                                        <td><span className="currency sar">{Number(tx.amount_sar || 0).toLocaleString()} SAR</span></td>
                                        <td><span style={{ color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{Number(tx.amount_given_sar || 0).toLocaleString()} SAR</span></td>
                                        <td><span className="currency inr" style={{ fontWeight: 700 }}>₹{Number(tx.client_inr || 0).toLocaleString('en-IN')}</span></td>
                                        <td>{statusBadge(tx.status)}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{tx.$createdAt ? format(new Date(tx.$createdAt), 'dd MMM yy') : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Convert SAR → AED Modal ──────────────────────────────────────── */}
            {convModal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConvModal(false)}>
                    <div className="modal" style={{ maxWidth: 560 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Convert SAR → AED</h3>
                            <button className="close-btn" onClick={() => setConvModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleConvSave}>
                            <div className="modal-body">
                                {/* Context info */}
                                <div style={{ background: 'rgba(74,158,255,0.06)', border: '1px solid rgba(74,158,255,0.2)', borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: 13 }}>
                                    <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>SAR available in balance (all time)</div>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#4a9eff' }}>{balanceSAR.toLocaleString()} SAR</div>
                                    <div style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 12 }}>
                                        Transactions awaiting conversion: <strong style={{ color: 'var(--text-primary)' }}>{txs.filter(t => t.status === 'sar_sent').length}</strong>
                                        &nbsp;| INR promised to clients: <strong style={{ color: 'var(--brand-accent)' }}>₹{inrPromised.toLocaleString('en-IN')}</strong>
                                    </div>
                                </div>

                                {/* Conversion Agent — REQUIRED */}
                                <div className="form-group">
                                    <label className="form-label" style={{ color: convForm.conversion_agent_id ? 'var(--brand-accent)' : 'var(--status-failed)' }}>
                                        Conversion Agent * (who converts SAR → AED)
                                    </label>
                                    <select id="conv-agent-select" className="form-select"
                                        value={convForm.conversion_agent_id}
                                        onChange={e => setConvForm({ ...convForm, conversion_agent_id: e.target.value })}
                                        style={{ borderColor: convForm.conversion_agent_id ? 'var(--border-color)' : 'rgba(255,84,112,0.5)' }}
                                        required>
                                        <option value="">— Select Conversion Agent —</option>
                                        {convAgents.map(a => (
                                            <option key={a.$id} value={a.$id}>{a.name}{a.phone ? ` (${a.phone})` : ''}</option>
                                        ))}
                                    </select>
                                    {convAgents.length === 0 && (
                                        <p style={{ fontSize: 12, color: 'var(--status-failed)', marginTop: 4 }}>
                                            No conversion agents found. <a href="/conversion-agents" style={{ color: '#4a9eff' }}>Add one →</a>
                                        </p>
                                    )}
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">SAR Amount to Convert *</label>
                                        <input id="conv-sar" className="form-input" type="number" step="0.01" min="0"
                                            placeholder={`e.g. ${balanceSAR.toFixed(2)}`}
                                            value={convForm.sar_amount}
                                            onChange={e => setConvForm({ ...convForm, sar_amount: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">SAR per 1 AED (rate) *</label>
                                        <input id="conv-rate" className="form-input" type="number" step="0.0001" min="0"
                                            placeholder="e.g. 1.0395"
                                            value={convForm.sar_rate}
                                            onChange={e => setConvForm({ ...convForm, sar_rate: e.target.value })} required />
                                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                            {convRate > 0 ? `${convRate} SAR = 1 AED` : 'How many SAR for 1 AED'}
                                        </p>
                                    </div>
                                </div>

                                {/* Auto AED */}
                                <div className="form-group">
                                    <label className="form-label" style={{ color: 'var(--brand-gold)' }}>AED You Will Receive — auto</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(245,166,35,0.07)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 8, padding: '12px 16px' }}>
                                        <Banknote size={20} style={{ color: 'var(--brand-gold)', flexShrink: 0 }} />
                                        <div>
                                            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-gold)' }}>{calcAED.toLocaleString(undefined, { maximumFractionDigits: 2 })} AED</div>
                                            {convSAR > 0 && convRate > 0 && (
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>= {convSAR} ÷ {convRate}</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <hr className="divider" />
                                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 12 }}>Profit Calculation</p>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">AED → INR Rate</label>
                                        <input id="conv-aed-inr" className="form-input" type="number" step="0.0001" min="0"
                                            placeholder="e.g. 22.85"
                                            value={convForm.aed_inr_rate}
                                            onChange={e => setConvForm({ ...convForm, aed_inr_rate: e.target.value })} />
                                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>1 AED = how many INR</p>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" style={{ color: '#a78bfa' }}>Total INR after AED to INR conversion</label>
                                        <div style={{ padding: '10px 14px', background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 8 }}>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: '#a78bfa' }}>₹{calcINRGet.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                            {calcAED > 0 && convAEDInr > 0 && (
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>= {calcAED.toFixed(2)} AED × {convAEDInr}</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Profit breakdown */}
                                <div style={{ background: calcProfit >= 0 ? 'rgba(0,200,150,0.07)' : 'rgba(255,84,112,0.07)', border: `1px solid ${calcProfit >= 0 ? 'rgba(0,200,150,0.3)' : 'rgba(255,84,112,0.3)'}`, borderRadius: 10, padding: '16px' }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 12, textAlign: 'center' }}>PROFIT = TOTAL INR AFTER CONVERSION − TOTAL INR TO CLIENT</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', gap: 8, alignItems: 'center', textAlign: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Total INR after conversion</div>
                                            <div style={{ fontSize: 17, fontWeight: 700, color: '#a78bfa' }}>₹{calcINRGet.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>AED × rate</div>
                                        </div>
                                        <div style={{ fontSize: 18, color: 'var(--text-muted)', fontWeight: 300 }}>−</div>
                                        <div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Total INR to client</div>
                                            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--status-failed)' }}>₹{batchCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>for {convSAR} SAR</div>
                                        </div>
                                        <div style={{ fontSize: 18, color: 'var(--text-muted)', fontWeight: 300 }}>=</div>
                                        <div style={{ background: calcProfit >= 0 ? 'rgba(0,200,150,0.12)' : 'rgba(255,84,112,0.12)', borderRadius: 8, padding: '8px 4px' }}>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Profit</div>
                                            <div style={{ fontSize: 20, fontWeight: 800, color: calcProfit >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)' }}>
                                                {calcProfit >= 0 ? '+' : ''}₹{calcProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginTop: 16 }}>
                                    <label className="form-label">Notes</label>
                                    <textarea className="form-textarea" placeholder="Optional notes…"
                                        value={convForm.notes} onChange={e => setConvForm({ ...convForm, notes: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setConvModal(false)}>Cancel</button>
                                <button id="save-conv-btn" type="submit" className="btn btn-accent" disabled={convSaving}>
                                    {convSaving ? 'Saving…' : 'Record Conversion & Mark AED Received'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
