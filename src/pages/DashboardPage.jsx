import { useEffect, useState, useMemo } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import {
    ArrowLeftRight, Users, UserCog,
    TrendingUp, SendHorizonal,
    Banknote, Wallet, X, PiggyBank, CircleDollarSign
} from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, isAfter } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sumF = (arr, f) => arr.reduce((a, d) => a + (Number(d[f]) || 0), 0);

const DATE_RANGES = ['Today', 'This Week', 'This Month', 'All Time', 'Custom'];

const filterByRange = (arr, range, from, to) => {
    if (range === 'All Time') return arr;
    const now = new Date();
    let start;
    if (range === 'Today') start = startOfDay(now);
    if (range === 'This Week') start = startOfWeek(now, { weekStartsOn: 1 });
    if (range === 'This Month') start = startOfMonth(now);
    if (range === 'Custom') {
        return arr.filter(r => {
            const d = new Date(r.$createdAt);
            const f = from ? new Date(from) : null;
            const t = to ? new Date(to + 'T23:59:59') : null;
            return (!f || d >= f) && (!t || d <= t);
        });
    }
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
    const [convRecs, setConvRecs] = useState([]);
    const [expenseRecs, setExpenseRecs] = useState([]);
    const [loading, setLoading] = useState(true);

    const [convertModal, setConvertModal] = useState(false);
    const [inrConvertModal, setInrConvertModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [convertForm, setConvertForm] = useState({
        sar_to_convert: '',
        sar_to_aed_rate: '',
        conversion_agent_id: '',
        conversion_agent_name: ''
    });
    const [inrForm, setInrForm] = useState({ aed_amount: '', aed_to_inr_rate: '', conversion_agent_id: '', conversion_agent_name: '' });

    // Date range
    const [dateRange, setDateRange] = useState('All Time');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [t, ag, cr, ex] = await Promise.all([
                dbService.listTransactions(),
                dbService.listAgents(),
                dbService.listAedConversions(),
                dbService.listExpenses(),
            ]);
            setTxs(t.documents);
            setAgents(ag.documents);
            setConvRecs(cr.documents);
            setExpenseRecs(ex.documents);
        } catch (e) { console.error(e); toast.error('Error loading dashboard'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchAll(); }, []);

    const safeFloat = (num) => {
        let n = parseFloat(num);
        if (isNaN(n)) return 0;
        return Number.isInteger(n) ? n + 0.00001 : n;
    };

    const handleBulkConvert = async (e) => {
        e.preventDefault();
        if (!convertForm.conversion_agent_id) return toast.error('Select a conversion agent');

        const targetAmount = parseFloat(convertForm.sar_to_convert);
        if (isNaN(targetAmount) || targetAmount <= 0) return toast.error('Enter a valid SAR amount');

        const rate = parseFloat(convertForm.sar_to_aed_rate);
        if (isNaN(rate) || rate <= 0) return toast.error('Enter a valid SAR→AED rate');

        setSaving(true);
        try {
            const aedAmount = targetAmount * rate;

            await dbService.createAedConversion({
                sar_amount: safeFloat(targetAmount),
                aed_amount: safeFloat(aedAmount),
                conversion_agent_id: convertForm.conversion_agent_id,
                conversion_agent_name: convertForm.conversion_agent_name,
                date: new Date().toISOString().split('T')[0]
            });

            toast.success(`Converted ${targetAmount} SAR → ${aedAmount.toFixed(2)} AED`);
            setConvertModal(false);
            setConvertForm({ sar_to_convert: '', sar_to_aed_rate: '', conversion_agent_id: '', conversion_agent_name: '' });
            fetchAll();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleAedToInrConvert = async (e) => {
        e.preventDefault();
        if (!inrForm.conversion_agent_id) return toast.error('Select a conversion agent');
        const aedAmt = parseFloat(inrForm.aed_amount);
        if (isNaN(aedAmt) || aedAmt <= 0) return toast.error('Enter a valid AED amount');
        const rate = parseFloat(inrForm.aed_to_inr_rate);
        if (isNaN(rate) || rate <= 0) return toast.error('Enter a valid AED→INR rate');

        setSaving(true);
        try {
            const inrAmount = aedAmt * rate;

            // Create AED expense (money leaving AED pool)
            await dbService.createExpense({
                title: `AED→INR Conversion via ${inrForm.conversion_agent_name}`,
                type: 'expense',
                category: 'AED→INR Conversion',
                amount: safeFloat(aedAmt),
                currency: 'AED',
                date: new Date().toISOString().split('T')[0],
                notes: `Agent: ${inrForm.conversion_agent_name} | Converted ${aedAmt} AED at rate ${rate}`
            });

            // Create INR income (money entering INR undistributed pool)
            await dbService.createExpense({
                title: 'AED→INR Conversion',
                type: 'income',
                category: 'AED→INR Conversion',
                amount: safeFloat(inrAmount),
                currency: 'INR',
                date: new Date().toISOString().split('T')[0],
                notes: `Received ₹${inrAmount.toLocaleString('en-IN')} from ${aedAmt} AED at rate ${rate}`
            });

            toast.success(`Converted ${aedAmt} AED → ₹${inrAmount.toLocaleString('en-IN')} via ${inrForm.conversion_agent_name}`);
            setInrConvertModal(false);
            setInrForm({ aed_amount: '', aed_to_inr_rate: '', conversion_agent_id: '', conversion_agent_name: '' });
            fetchAll();
        } catch (error) {
            toast.error('Conversion failed: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    // ── Filtered data ──────────────────────────────────────────────────────────
    const fTxs = useMemo(() => filterByRange(txs, dateRange), [txs, dateRange]);

    // ── Aggregates ────────────────────────────────────────────────────────────
    const completed = fTxs.filter(t => t.status === 'completed');

    // Income & Expenses by currency
    const incByCur = (cur) => expenseRecs.filter(e => e.type === 'income' && e.currency === cur).reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const expByCur = (cur) => expenseRecs.filter(e => e.type === 'expense' && e.currency === cur).reduce((a, e) => a + (Number(e.amount) || 0), 0);

    // SAR Balance = SAR Income (agent payments) minus SAR Expenses and SAR->AED Conversions
    const totalSARCollected = sumF(fTxs.filter(t => t.collected_currency === 'SAR'), 'collected_amount');
    const totalSARConverted = sumF(convRecs, 'sar_amount');
    let balanceSAR = incByCur('SAR') - expByCur('SAR') - totalSARConverted;
    if (Math.abs(balanceSAR) < 0.001) balanceSAR = 0;

    // AED Balance = AED Income + AED gained from SAR conversions minus AED Expenses
    const totalAEDCollected = sumF(fTxs.filter(t => t.collected_currency === 'AED'), 'collected_amount');
    const totalAEDFromConversions = sumF(convRecs, 'aed_amount');
    let balanceAED = incByCur('AED') + totalAEDFromConversions - expByCur('AED');
    if (Math.abs(balanceAED) < 0.001) balanceAED = 0;

    // INR Balance = total INR received (deposits) minus general expenses minus INR already paid out to clients
    const inrGeneralExpenses = expenseRecs.filter(e => e.type !== 'income' && e.currency === 'INR' && e.category !== 'Distributor Deposit' && e.category !== 'Distributor Transfer').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const totalINRDistributed = sumF(completed, 'actual_inr_distributed');

    // INR deposited to distributors
    const inrDepositedToDistributors = expenseRecs.filter(e => e.type !== 'income' && e.currency === 'INR' && e.category === 'Distributor Deposit').reduce((a, e) => a + (Number(e.amount) || 0), 0);

    // INR Not Given to Distributor = all INR received - sent to clients - deposited to distributors - other expenses
    const totalINRIn = incByCur('INR'); // includes AED→INR conversion income
    const inrNotGiven = Math.max(0, round2(totalINRIn - totalINRDistributed - inrDepositedToDistributors - inrGeneralExpenses));

    // INR Balance = all INR in system (not yet spent anywhere)
    const balanceINR = Math.max(0, round2(totalINRIn - inrGeneralExpenses - totalINRDistributed));

    // (totalINRDistributed already declared above)

    // Total Profit split by currency: profit_inr field stores SAR or AED profit based on collected_currency
    const totalProfitSAR = fTxs.filter(t => (t.collected_currency || 'SAR') === 'SAR').reduce((a, t) => a + (Number(t.profit_inr) || 0), 0);
    const totalProfitAED = fTxs.filter(t => t.collected_currency === 'AED').reduce((a, t) => a + (Number(t.profit_inr) || 0), 0);

    // Agents owed SAR/AED (from their balance fields)
    const collectionAgents = agents.filter(a => a.type && a.type.startsWith('collection'));
    const totalAgentsOweSAR = collectionAgents
        .filter(a => (a.currency || 'SAR') === 'SAR')
        .reduce((s, a) => s + round2(a.sar_balance || 0), 0);
    const totalAgentsOweAED = collectionAgents
        .filter(a => (a.currency || 'SAR') === 'AED')
        .reduce((s, a) => s + round2(a.aed_balance || 0), 0);

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

            {/* ── Financial Summary ────────────────────────── */}
            {(isAdmin) && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-muted)' }}>
                            Financial Summary — {dateRange}
                        </div>
                    </div>
                    <div className="stats-grid" style={{ marginBottom: 28 }}>
                        {/* Total SAR Balance */}
                        <div className="card" style={{ padding: 20, border: '1px solid rgba(74,158,255,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(74,158,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a9eff', flexShrink: 0 }}>
                                    <TrendingUp size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>SAR Balance</div>
                                    <div style={{ fontSize: 'clamp(16px, 2.5vw, 24px)', fontWeight: 800, color: '#4a9eff', lineHeight: 1 }}>{balanceSAR.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>pending conversion</div>
                                </div>
                            </div>
                        </div>
                        {/* AED Balance */}
                        <div className="card" style={{ padding: 20, border: '1px solid rgba(245,166,35,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(245,166,35,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-gold)', flexShrink: 0 }}>
                                    <Banknote size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>AED Balance</div>
                                    <div style={{ fontSize: 'clamp(16px, 2.5vw, 24px)', fontWeight: 800, color: 'var(--brand-gold)', lineHeight: 1 }}>{balanceAED.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>collected + converted</div>
                                </div>
                            </div>
                        </div>
                        {/* INR Balance */}
                        <div className="card" style={{ padding: 20, border: '1px solid rgba(167,139,250,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa', flexShrink: 0 }}>
                                    <Wallet size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>INR Balance</div>
                                    <div style={{ fontSize: 'clamp(16px, 2.5vw, 24px)', fontWeight: 800, color: '#a78bfa', lineHeight: 1 }}>₹{balanceINR.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>total INR in system</div>
                                </div>
                            </div>
                        </div>
                        {/* INR Distributed to Clients */}
                        <div className="card" style={{ padding: 20, border: '1px solid rgba(0,200,150,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(0,200,150,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-accent)', flexShrink: 0 }}>
                                    <SendHorizonal size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>INR Distributed</div>
                                    <div style={{ fontSize: 'clamp(16px, 2.5vw, 24px)', fontWeight: 800, color: 'var(--brand-accent)', lineHeight: 1 }}>₹{totalINRDistributed.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{completed.length} transactions to clients</div>
                                </div>
                            </div>
                        </div>
                        {/* INR Not Given to Distributor */}
                        <div className="card" style={{ padding: 20, border: '1px solid rgba(255,170,50,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,170,50,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffaa32', flexShrink: 0 }}>
                                    <Banknote size={20} />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, whiteSpace: 'nowrap' }}>INR Not Given to Distributor</div>
                                    <div style={{ fontSize: 'clamp(16px, 2.5vw, 24px)', fontWeight: 800, color: '#ffaa32', lineHeight: 1 }}>₹{inrNotGiven.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>pending deposit to distributors</div>
                                </div>
                            </div>
                        </div>

                        {/* Agents Owe SAR */}
                        <div className="card" style={{ padding: 20, border: '1px solid rgba(74,158,255,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(74,158,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a9eff', flexShrink: 0 }}>
                                    <Users size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Agents Owe SAR</div>
                                    <div style={{ fontSize: 'clamp(16px, 2.5vw, 24px)', fontWeight: 800, color: '#4a9eff', lineHeight: 1 }}>{totalAgentsOweSAR.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>pending collection from SAR agents</div>
                                </div>
                            </div>
                        </div>

                        {/* Agents Owe AED */}
                        <div className="card" style={{ padding: 20, border: '1px solid rgba(245,166,35,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(245,166,35,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-gold)', flexShrink: 0 }}>
                                    <Users size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Agents Owe AED</div>
                                    <div style={{ fontSize: 'clamp(16px, 2.5vw, 24px)', fontWeight: 800, color: 'var(--brand-gold)', lineHeight: 1 }}>{totalAgentsOweAED.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>pending collection from AED agents</div>
                                </div>
                            </div>
                        </div>

                        {/* Total Profit SAR — admin only */}
                        {isAdmin && (
                            <div className="card" style={{ padding: 20, border: '1px solid rgba(74,158,255,0.3)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(74,158,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a9eff', flexShrink: 0 }}>
                                        <PiggyBank size={20} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Total Profit (SAR)</div>
                                        <div style={{ fontSize: 'clamp(16px, 2.5vw, 24px)', fontWeight: 800, color: '#4a9eff', lineHeight: 1 }}>{round2(totalProfitSAR).toLocaleString(undefined, { maximumFractionDigits: 2 })} <span style={{ fontSize: 13 }}>SAR</span></div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>from SAR collections</div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* Total Profit AED — admin only */}
                        {isAdmin && (
                            <div className="card" style={{ padding: 20, border: '1px solid rgba(245,166,35,0.3)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(245,166,35,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-gold)', flexShrink: 0 }}>
                                        <PiggyBank size={20} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Total Profit (AED)</div>
                                        <div style={{ fontSize: 'clamp(16px, 2.5vw, 24px)', fontWeight: 800, color: 'var(--brand-gold)', lineHeight: 1 }}>{round2(totalProfitAED).toLocaleString(undefined, { maximumFractionDigits: 2 })} <span style={{ fontSize: 13 }}>AED</span></div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>from AED collections</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── Overview Stats ───────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-4">
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-muted)' }}>Operational Overview</div>
            </div>
            <div className="stats-grid">
                <div className="stat-card" style={{ '--accent-bar': '#4a9eff' }}>
                    <div className="stat-value">{totalSARCollected.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div className="stat-label">Total SAR</div>
                </div>
                <div className="stat-card" style={{ '--accent-bar': 'var(--brand-gold)' }}>
                    <div className="stat-value">{totalAEDCollected.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div className="stat-label">Total AED</div>
                </div>
                <div className="stat-card" style={{ '--accent-bar': 'var(--status-completed)' }}>
                    <div className="stat-value">{completed.length}</div>
                    <div className="stat-label">Transactions Done</div>
                </div>
                <div className="stat-card" style={{ '--accent-bar': 'var(--status-inprogress)' }}>
                    <div className="stat-value">{fTxs.length}</div>
                    <div className="stat-label">Total Transactions</div>
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

            {/* Bulk Convert SAR→AED Modal */}
            {convertModal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConvertModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">SAR → AED Conversion</h3>
                            <button className="close-btn" onClick={() => setConvertModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleBulkConvert}>
                            <div className="modal-body">
                                <div className="card mb-4" style={{ background: 'var(--bg-main)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Available SAR Balance:</span>
                                        <span style={{ fontWeight: 800, color: '#4a9eff' }}>
                                            {balanceSAR.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR
                                        </span>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Amount (SAR) *</label>
                                    <input className="form-input" type="number" step="0.01" placeholder="e.g. 50000" required
                                        value={convertForm.sar_to_convert} onChange={e => setConvertForm({ ...convertForm, sar_to_convert: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Rate (SAR → AED) *</label>
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
                                        {agents.filter(a => a.type === 'conversion_sar').map(a => (
                                            <option key={a.$id} value={a.$id}>{a.name}</option>
                                        ))}
                                    </select>
                                </div>
                                {convertForm.sar_to_convert && convertForm.sar_to_aed_rate && (
                                    <div className="card" style={{ background: 'var(--bg-main)', padding: 12, marginTop: 8 }}>
                                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Result: <strong style={{ color: 'var(--brand-gold)' }}>{(parseFloat(convertForm.sar_to_convert) * parseFloat(convertForm.sar_to_aed_rate)).toFixed(2)} AED</strong></div>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setConvertModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-accent" disabled={saving}>
                                    {saving ? 'Converting...' : 'Convert SAR → AED'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* AED→INR Convert Modal */}
            {inrConvertModal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setInrConvertModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">AED → INR Conversion</h3>
                            <button className="close-btn" onClick={() => setInrConvertModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleAedToInrConvert}>
                            <div className="modal-body">
                                <div className="card mb-4" style={{ background: 'var(--bg-main)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Available AED Balance:</span>
                                        <span style={{ fontWeight: 800, color: 'var(--brand-gold)' }}>
                                            {balanceAED.toLocaleString(undefined, { maximumFractionDigits: 2 })} AED
                                        </span>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Conversion Agent (AED→INR) *</label>
                                    <select className="form-select" required
                                        value={inrForm.conversion_agent_id}
                                        onChange={e => {
                                            const ag = agents.find(a => a.$id === e.target.value);
                                            setInrForm({ ...inrForm, conversion_agent_id: ag?.$id || '', conversion_agent_name: ag?.name || '' });
                                        }}>
                                        <option value="">Select Agent...</option>
                                        {agents.filter(a => a.type === 'conversion_aed').map(a => (
                                            <option key={a.$id} value={a.$id}>{a.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Amount (AED) *</label>
                                    <input className="form-input" type="number" step="0.01" placeholder="e.g. 5000" required
                                        value={inrForm.aed_amount} onChange={e => setInrForm({ ...inrForm, aed_amount: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Rate (1 AED = ? INR) *</label>
                                    <input className="form-input" type="number" step="0.01" placeholder="e.g. 22.5" required
                                        value={inrForm.aed_to_inr_rate} onChange={e => setInrForm({ ...inrForm, aed_to_inr_rate: e.target.value })} />
                                </div>
                                {inrForm.aed_amount && inrForm.aed_to_inr_rate && (
                                    <div className="card" style={{ background: 'var(--bg-main)', padding: 12, marginTop: 8 }}>
                                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Result: <strong style={{ color: '#a78bfa' }}>₹{(parseFloat(inrForm.aed_amount) * parseFloat(inrForm.aed_to_inr_rate)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong> INR</div>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setInrConvertModal(false)}>Cancel</button>
                                <button type="submit" className="btn" style={{ background: '#a78bfa', color: '#fff', border: 'none' }} disabled={saving}>
                                    {saving ? 'Converting...' : 'Convert AED → INR'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
