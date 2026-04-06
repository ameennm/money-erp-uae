import { useEffect, useState, useMemo } from 'react';
import { dbService } from '../lib/appwrite';
import { ledgerService } from '../lib/ledgerService';
import Layout from '../components/Layout';
import {
    TrendingUp, SendHorizonal,
    Banknote, Wallet, X, PiggyBank
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { DateRangeFilter } from '../components/filters';
import { applyDateRange, round2 } from '../utils/filterHelpers';

// ─── Helpers ──────────────────────────────────────────────────────────────────


// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
    const { role } = useAuth();
    const isAdmin = role === 'admin';

    const [ledger, setLedger] = useState([]);
    const [loading, setLoading] = useState(true);

    // Date range
    const [dateRange, setDateRange] = useState({ range: 'All Time', customFrom: '', customTo: '' });

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [, , lg] = await Promise.all([
                dbService.listTransactions(),
                dbService.listAgents(),
                dbService.listLedgerEntries(),
            ]);
            setLedger(lg.documents);
        } catch (e) { console.error(e); toast.error('Error loading dashboard'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchAll(); }, []);

    // ── Aggregates from Ledger ──────────────────────────────────────────────
    const fLedger = useMemo(() => applyDateRange(ledger, dateRange.range, dateRange.customFrom, dateRange.customTo), [ledger, dateRange]);

    const getMetrics = (cur) => {
        const items = fLedger.filter(e => e.currency === cur);
        const debit = items.filter(e => e.type === 'debit').reduce((a, b) => a + (Number(b.amount) || 0), 0);
        const credit = items.filter(e => e.type === 'credit').reduce((a, b) => a + (Number(b.amount) || 0), 0);
        return {
            debit: round2(debit),
            credit: round2(credit),
            balance: round2(debit - credit)
        };
    };

    const inr = getMetrics('INR');
    const sar = getMetrics('SAR');
    const aed = getMetrics('AED');

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

            <div style={{ marginBottom: 24 }}>
                <DateRangeFilter
                    value={dateRange}
                    onChange={setDateRange}
                />
            </div>

            <div className="stats-grid" style={{ marginBottom: 28 }}>
                {/* INR Cards */}
                <Card label="INR Debit" value={inr.debit} cur="₹" color="#a78bfa" icon={<TrendingUp size={20} />} />
                <Card label="INR Credit" value={inr.credit} cur="₹" color="#ef4444" icon={<SendHorizonal size={20} />} />
                <Card label="INR Balance in Hand" value={inr.balance} cur="₹" color="var(--brand-accent)" icon={<Wallet size={20} />} />

                {/* SAR Cards */}
                <Card label="SAR Debit" value={sar.debit} cur="SAR" color="#4a9eff" icon={<TrendingUp size={20} />} />
                <Card label="SAR Credit" value={sar.credit} cur="SAR" color="#ef4444" icon={<SendHorizonal size={20} />} />
                <Card label="SAR Balance in Hand" value={sar.balance} cur="SAR" color="var(--brand-gold)" icon={<Banknote size={20} />} />

                {/* AED Cards */}
                <Card label="AED Debit" value={aed.debit} cur="AED" color="#22c55e" icon={<TrendingUp size={20} />} />
                <Card label="AED Credit" value={aed.credit} cur="AED" color="#ef4444" icon={<SendHorizonal size={20} />} />
                <Card label="AED Balance in Hand" value={aed.balance} cur="AED" color="#f5a623" icon={<PiggyBank size={20} />} />
            </div>

        </Layout>
    );
}

function Card({ label, value, cur, color, icon }) {
    const isInr = cur === '₹';
    return (
        <div className="card" style={{ padding: 22, border: `1px solid ${color}40`, background: `${color}05` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ 
                    width: 48, height: 48, borderRadius: 12, 
                    background: `${color}15`, display: 'flex', 
                    alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 
                }}>
                    {icon}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                    <div style={{ fontSize: 'clamp(18px, 2.5vw, 26px)', fontWeight: 900, color, lineHeight: 1.1 }}>
                        {isInr ? '₹' : ''}{Number(value).toLocaleString(isInr ? 'en-IN' : undefined, { minimumFractionDigits: 2 })}
                        {!isInr && <span style={{ fontSize: 12, marginLeft: 5, opacity: 0.8 }}>{cur}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}
