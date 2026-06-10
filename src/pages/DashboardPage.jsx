import { useEffect, useState, useMemo } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import {
    TrendingUp, SendHorizonal, Banknote, Wallet, PiggyBank
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DateRangeFilter } from '../components/filters';
import { applyDateRange, round2 } from '../utils/filterHelpers';

// ─── Helpers ──────────────────────────────────────────────────────────────────


// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
    const [txs, setTxs] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [aedConversions, setAedConversions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Date range
    const [dateRange, setDateRange] = useState({ range: 'All Time', customFrom: '', customTo: '' });

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [t, ex, ac] = await Promise.all([
                dbService.listTransactions(),
                dbService.listExpenses(),
                dbService.listAedConversions(),
            ]);
            setTxs(t.documents);
            setExpenses(ex.documents);
            setAedConversions(ac.documents);
        } catch (e) { console.error(e); toast.error('Error loading dashboard'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchAll(); }, []);

    // Mirror the Financial Ledger page so dashboard totals match the source of truth.
    const allEntries = useMemo(() => {
        const entries = [];

        txs.forEach(tx => {
            if (tx.status === 'completed' && Number(tx.actual_inr_distributed) > 0) {
                entries.push({
                    _date: tx.$updatedAt || tx.$createdAt,
                    currency: 'INR',
                    credit: 0,
                    debit: Number(tx.actual_inr_distributed),
                });
            }
        });

        expenses.filter(e => e.type === 'income').forEach(e => {
            entries.push({
                _date: e.$createdAt,
                currency: e.currency || 'AED',
                credit: Number(e.amount) || 0,
                debit: 0,
            });
        });

        expenses
            .filter(e => e.type !== 'income' && e.category !== 'Distributor Deposit' && e.category !== 'Distributor Transfer')
            .forEach(e => {
                entries.push({
                    _date: e.$createdAt,
                    currency: e.currency || 'AED',
                    credit: 0,
                    debit: Number(e.amount) || 0,
                });
            });

        aedConversions.forEach(c => {
            entries.push({
                _date: c.$createdAt || c.date,
                currency: 'SAR',
                credit: 0,
                debit: Number(c.sar_amount) || 0,
            });

            entries.push({
                _date: c.$createdAt || c.date,
                currency: 'AED',
                credit: Number(c.aed_amount) || 0,
                debit: 0,
            });
        });

        return entries;
    }, [txs, expenses, aedConversions]);

    const fLedger = useMemo(() => applyDateRange(allEntries, dateRange.range, dateRange.customFrom, dateRange.customTo, '_date'), [allEntries, dateRange]);

    const getMetrics = (cur) => {
        const items = fLedger.filter(e => e.currency === cur);
        const debit = items.reduce((a, b) => a + (Number(b.debit) || 0), 0);
        const credit = items.reduce((a, b) => a + (Number(b.credit) || 0), 0);
        const balance = credit - debit;
        return {
            debit: round2(debit),
            credit: round2(credit),
            balance: Math.abs(balance) < 0.001 ? 0 : round2(balance)
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

            <div className="stats-grid dashboard-stats-grid" style={{ marginBottom: 28 }}>
                {/* INR Cards */}
                <Card label="INR Debit" value={inr.debit} cur="₹" color="#a78bfa" icon={<TrendingUp size={20} />} />
                <Card label="INR Credit" value={inr.credit} cur="₹" color="#ef4444" icon={<SendHorizonal size={20} />} />
                <Card label="INR Native Balance" value={inr.balance} cur="₹" color="var(--brand-accent)" icon={<Wallet size={20} />} />

                {/* SAR Cards */}
                <Card label="SAR Debit" value={sar.debit} cur="SAR" color="#4a9eff" icon={<TrendingUp size={20} />} />
                <Card label="SAR Credit" value={sar.credit} cur="SAR" color="#ef4444" icon={<SendHorizonal size={20} />} />
                <Card label="SAR Native Balance" value={sar.balance} cur="SAR" color="var(--brand-gold)" icon={<Banknote size={20} />} />

                {/* AED Cards */}
                <Card label="AED Debit" value={aed.debit} cur="AED" color="#22c55e" icon={<TrendingUp size={20} />} />
                <Card label="AED Credit" value={aed.credit} cur="AED" color="#ef4444" icon={<SendHorizonal size={20} />} />
                <Card label="AED Native Balance" value={aed.balance} cur="AED" color="#f5a623" icon={<PiggyBank size={20} />} />
            </div>

        </Layout>
    );
}

function Card({ label, value, cur, color, icon }) {
    const isInr = cur === '₹';
    const amount = Number(value).toLocaleString(isInr ? 'en-IN' : undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });

    return (
        <div className="card dashboard-stat-card" style={{ '--stat-color': color, borderColor: `${color}40`, background: `${color}05` }}>
            <div className="dashboard-stat-inner">
                <div className="dashboard-stat-icon">
                    {icon}
                </div>
                <div className="dashboard-stat-content">
                    <div className="dashboard-stat-label">{label}</div>
                    <div className="dashboard-stat-value">
                        <span className="dashboard-stat-number">{isInr ? '₹' : ''}{amount}</span>
                        {!isInr && <span className="dashboard-stat-currency">{cur}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}
