import { useState, useEffect, useMemo } from 'react';
import { dbService, Query } from '../lib/appwrite';
import { X, Download, FileSpreadsheet, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const LABEL_CONFIG = {
    distributor: {
        debit: 'Total Deposited',
        credit: 'Total Distributed',
        balance: 'Balance in Hand',
        debitIcon: TrendingUp,
        creditIcon: TrendingDown,
        balanceIcon: Wallet,
        debitColor: '#4a9eff',
        creditColor: '#ff5460',
        balanceColor: '#a78bfa',
    },
    collection: {
        debit: 'Total',
        credit: 'Paid',
        balance: 'Balance',
        debitIcon: TrendingUp,
        creditIcon: TrendingDown,
        balanceIcon: Wallet,
        debitColor: '#4a9eff',
        creditColor: '#ff5460',
        balanceColor: '#25D366',
    },
    conversion_sar: {
        debit: 'Total Given',
        credit: 'Total Returned',
        balance: 'Balance',
        debitIcon: TrendingUp,
        creditIcon: TrendingDown,
        balanceIcon: Wallet,
        debitColor: '#4a9eff',
        creditColor: '#ff5460',
        balanceColor: '#25D366',
    },
    conversion_aed: {
        debit: 'Total Given',
        credit: 'Total Returned',
        balance: 'Balance',
        debitIcon: TrendingUp,
        creditIcon: TrendingDown,
        balanceIcon: Wallet,
        debitColor: '#f5a623',
        creditColor: '#ff5460',
        balanceColor: '#25D366',
    },
};

export default function LedgerModal({ agent, onClose }) {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currencyFilter, setCurrencyFilter] = useState('All');
    const type = agent?.type || 'collection';

    const cfg = LABEL_CONFIG[type] || LABEL_CONFIG.collection;

    const fetchEntries = async () => {
        setLoading(true);
        try {
            const res = await dbService.listLedgerEntries([
                Query.equal('agent_id', agent.$id),
                Query.orderDesc('createdAt'),
            ]);
            const filtered = res.documents.filter(e => !e.agent_type || e.agent_type === agent.type);
            setEntries(filtered);
        } catch (e) {
            toast.error('Failed to load: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (agent) fetchEntries();
    }, [agent]);

    const allEntries = useMemo(() => {
        return entries.map(e => ({
            _id: e.$id,
            _date: e.createdAt,
            _type: e.type,
            particular: e.description,
            reference_type: e.reference_type,
            reference_id: e.reference_id,
            currency: e.currency,
            amt: e.type === 'debit' ? Number(e.amount) : -Number(e.amount),
            credit: e.type === 'credit' ? Number(e.amount) : 0,
            debit: e.type === 'debit' ? Number(e.amount) : 0,
        }));
    }, [entries]);

    const filtered = allEntries.filter(r => currencyFilter === 'All' || r.currency === currencyFilter);

    // Totals per currency
    const allCurrencies = ['SAR', 'AED', 'INR'];
    const displayCurrencies = currencyFilter === 'All' ? allCurrencies : [currencyFilter];

    const totals = {};
    allCurrencies.forEach(cur => {
        const curEntries = allEntries.filter(e => e.currency === cur);
        const totalDebit = curEntries.reduce((a, e) => a + Number(e.debit || 0), 0);
        const totalCredit = curEntries.reduce((a, e) => a + Number(e.credit || 0), 0);
        let bal = totalDebit - totalCredit;
        if (Math.abs(bal) < 0.001) bal = 0;
        totals[cur] = { debit: totalDebit, credit: totalCredit, balance: bal };
    });

    // Running balance calculation (ascending, then reverse for display)
    const sortedEntries = [...filtered].sort((a, b) => new Date(a._date) - new Date(b._date));
    const runningBal = { SAR: 0, AED: 0, INR: 0 };
    const entriesWithBalance = sortedEntries.map(entry => {
        const cur = entry.currency;
        if (cur && runningBal[cur] !== undefined) {
            runningBal[cur] += Number(entry.debit || 0) - Number(entry.credit || 0);
            if (Math.abs(runningBal[cur]) < 0.001) runningBal[cur] = 0;
        }
        return { ...entry, runningBalance: cur ? runningBal[cur] : 0 };
    }).reverse();

    const exportToExcel = () => {
        const rows = entriesWithBalance.map((r, i) => ({
            '#': entriesWithBalance.length - i,
            'Date': r._date ? format(new Date(r._date), 'dd-MM-yyyy HH:mm') : '',
            'Particular': r.particular,
            'Type': r._type.toUpperCase(),
            'Currency': r.currency,
            [cfg.debit]: r.debit || '',
            [cfg.credit]: r.credit || '',
            'Balance': r.runningBalance,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `${agent.name}_Ledger`);
        XLSX.writeFile(wb, `Ledger_${agent.name}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        toast.success(`Downloaded ledger`);
    };

    if (!agent) return null;

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: '900px', width: '95%', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
                {/* ── Header ── */}
                <div className="modal-header" style={{ paddingBottom: 16 }}>
                    <div>
                        <h3 className="modal-title" style={{ fontSize: 24 }}>{agent.name}</h3>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {agent.type === 'distributor' ? 'Distributor' : agent.type === 'collection' ? 'Collection Agent' : 'Conversion Agent'} — {entries.length} entries
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="btn btn-outline btn-sm" onClick={exportToExcel} title="Export to Excel">
                            <Download size={14} /> Excel
                        </button>
                        <button className="close-btn" onClick={onClose}><X size={20} /></button>
                    </div>
                </div>

                <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: 'var(--bg-color)' }}>
                    {loading ? (
                        <div className="loading-screen" style={{ minHeight: '300px' }}>
                            <div className="spinner" /><p>Loading…</p>
                        </div>
                    ) : (
                        <>
                            {/* ── Summary Report Cards ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                                {/* Deposited / Total Given */}
                                <div className="card" style={{ padding: '20px 18px', border: `1px solid ${cfg.debitColor}30`, background: `linear-gradient(135deg, ${cfg.debitColor}08, transparent)` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${cfg.debitColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <TrendingUp size={16} color={cfg.debitColor} />
                                        </div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            + {cfg.debit}
                                        </div>
                                    </div>
                                    {displayCurrencies.map(cur => {
                                        const t = totals[cur];
                                        return (
                                            <div key={cur} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{cur}</span>
                                                <span style={{ fontSize: 15, fontWeight: 800, color: cfg.debitColor }}>{fmt(t.debit)}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Distributed / Paid / Returned */}
                                <div className="card" style={{ padding: '20px 18px', border: `1px solid ${cfg.creditColor}30`, background: `linear-gradient(135deg, ${cfg.creditColor}08, transparent)` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${cfg.creditColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <TrendingDown size={16} color={cfg.creditColor} />
                                        </div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            − {cfg.credit}
                                        </div>
                                    </div>
                                    {displayCurrencies.map(cur => {
                                        const t = totals[cur];
                                        return (
                                            <div key={cur} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{cur}</span>
                                                <span style={{ fontSize: 15, fontWeight: 800, color: cfg.creditColor }}>{fmt(t.credit)}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Balance in Hand */}
                                <div className="card" style={{ padding: '20px 18px', border: `1px solid ${cfg.balanceColor}40`, background: `linear-gradient(135deg, ${cfg.balanceColor}10, transparent)` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${cfg.balanceColor}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Wallet size={16} color={cfg.balanceColor} />
                                        </div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            {cfg.balance}
                                        </div>
                                    </div>
                                    {displayCurrencies.map(cur => {
                                        const t = totals[cur];
                                        const balColor = t.balance >= 0 ? cfg.balanceColor : 'var(--status-failed)';
                                        return (
                                            <div key={cur} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{cur}</span>
                                                <span style={{ fontSize: 15, fontWeight: 800, color: balColor }}>
                                                    {t.balance >= 0 ? '+' : '−'}{fmt(Math.abs(t.balance))}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Currency Filter ── */}
                            <div className="flex items-center justify-between mb-4">
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>
                                    All Transactions
                                </span>
                                <div className="flex gap-1" style={{ background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 8 }}>
                                    {['All', 'SAR', 'AED', 'INR'].map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setCurrencyFilter(c)}
                                            style={{
                                                padding: '6px 16px',
                                                fontSize: 13,
                                                fontWeight: currencyFilter === c ? 700 : 500,
                                                borderRadius: 6,
                                                border: 'none',
                                                color: currencyFilter === c ? '#fff' : 'var(--text-muted)',
                                                background: currencyFilter === c
                                                    ? (c === 'SAR' ? '#4a9eff' : c === 'AED' ? 'var(--brand-gold)' : c === 'INR' ? '#a78bfa' : 'var(--brand-accent)')
                                                    : 'transparent',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ── Transaction List ── */}
                            {entriesWithBalance.length === 0 ? (
                                <div className="empty-state card" style={{ padding: 40 }}>
                                    <FileSpreadsheet size={40} />
                                    <p>No entries found.</p>
                                </div>
                            ) : (
                                <div className="card" style={{ padding: 0, border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                                    <div className="table-wrapper">
                                        <table className="data-table" style={{ fontSize: 13, borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: 'var(--bg-main)' }}>
                                                    <th style={{ width: 40, padding: '14px 12px' }}>#</th>
                                                    <th style={{ width: 100 }}>Date</th>
                                                    <th>Particular</th>
                                                    <th style={{ width: 70 }}>Currency</th>
                                                    <th style={{ textAlign: 'right', color: cfg.debitColor, width: 120 }}>− {cfg.credit.split(' ').pop()}</th>
                                                    <th style={{ textAlign: 'right', color: cfg.creditColor, width: 120 }}>+ {cfg.debit.split(' ').pop()}</th>
                                                    <th style={{ textAlign: 'right', width: 130 }}>Balance</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {entriesWithBalance.map((r, i) => {
                                                    const balCol = r.runningBalance >= 0 ? cfg.balanceColor : 'var(--status-failed)';
                                                    const curCol = { SAR: '#4a9eff', AED: 'var(--brand-gold)', INR: '#a78bfa' }[r.currency] || 'var(--text-muted)';
                                                    return (
                                                        <tr key={r._id + i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                            <td style={{ color: 'var(--text-muted)', fontSize: 11, padding: '12px' }}>
                                                                {entriesWithBalance.length - i}
                                                            </td>
                                                            <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                                                                {r._date ? format(new Date(r._date), 'dd MMM yy') : '—'}
                                                            </td>
                                                            <td style={{ fontWeight: 500, maxWidth: 280 }}>
                                                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.particular}</div>
                                                                {r.reference_type && (
                                                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                                                                        {r.reference_type.toUpperCase()}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td>
                                                                <span style={{
                                                                    fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                                                    background: `${curCol}15`, color: curCol
                                                                }}>{r.currency}</span>
                                                            </td>
                                                            {/* credit = money going out (paid/distributed) → negative sign */}
                                                            <td style={{ textAlign: 'right', fontWeight: 600, color: r.credit > 0 ? cfg.creditColor : 'var(--text-muted)' }}>
                                                                {r.credit > 0 ? `−${fmt(r.credit)}` : '—'}
                                                            </td>
                                                            {/* debit = money received (deposited/total) → positive sign */}
                                                            <td style={{ textAlign: 'right', fontWeight: 600, color: r.debit > 0 ? cfg.debitColor : 'var(--text-muted)' }}>
                                                                {r.debit > 0 ? `+${fmt(r.debit)}` : '—'}
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 700, color: balCol }}>
                                                                {r.runningBalance >= 0 ? '+' : '−'}{fmt(Math.abs(r.runningBalance))} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.currency}</span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
