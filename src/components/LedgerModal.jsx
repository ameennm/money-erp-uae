import { useState, useEffect, useMemo } from 'react';
import { dbService, Query } from '../lib/appwrite';
import { X, Download, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function LedgerModal({ agent, onClose }) {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currencyFilter, setCurrencyFilter] = useState('All');

    const fetchEntries = async () => {
        setLoading(true);
        try {
            const res = await dbService.listLedgerEntries([
                Query.equal('agent_id', agent.$id),
                Query.orderAsc('createdAt') // Ascending to calculate running balance correctly
            ]);
            setEntries(res.documents);
        } catch (e) {
            toast.error('Failed to load ledger: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (agent) fetchEntries();
    }, [agent]);

    // Format entries and calculate running balance
    const allEntries = useMemo(() => {
        return entries.map(e => ({
            _id: e.$id,
            _date: e.createdAt,
            _type: e.type, // 'credit' or 'debit'
            particular: e.description,
            reference_type: e.reference_type,
            reference_id: e.reference_id,
            currency: e.currency,
            credit: e.type === 'credit' ? Number(e.amount) : 0,
            debit: e.type === 'debit' ? Number(e.amount) : 0,
            notes: e.reference_type?.toUpperCase() || ''
        }));
    }, [entries]);

    const filtered = allEntries.filter(r => currencyFilter === 'All' || r.currency === currencyFilter);

    // Ledger totals per currency
    const allCurrencies = ['SAR', 'AED', 'INR'];
    const displayCurrencies = currencyFilter === 'All' ? allCurrencies : [currencyFilter];

    const totals = {};
    const globalTotals = {};

    // Calculate global totals for the top summary cards
    allCurrencies.forEach(cur => {
        const curEntries = allEntries.filter(e => e.currency === cur);
        const totalCredit = curEntries.reduce((a, e) => a + Number(e.credit || 0), 0);
        const totalDebit = curEntries.reduce((a, e) => a + Number(e.debit || 0), 0);
        let bal = totalCredit - totalDebit;
        if (Math.abs(bal) < 0.001) bal = 0;
        globalTotals[cur] = { credit: totalCredit, debit: totalDebit, balance: bal };
    });

    // Calculate totals for the current filtered view
    displayCurrencies.forEach(cur => {
        const curEntries = filtered.filter(e => e.currency === cur);
        const totalCredit = curEntries.reduce((a, e) => a + Number(e.credit || 0), 0);
        const totalDebit = curEntries.reduce((a, e) => a + Number(e.debit || 0), 0);
        let bal = totalCredit - totalDebit;
        if (Math.abs(bal) < 0.001) bal = 0;
        totals[cur] = { credit: totalCredit, debit: totalDebit, balance: bal };
    });

    // Calculate running balance per currency
    const runningBal = { SAR: 0, AED: 0, INR: 0 };
    const entriesWithBalance = filtered.map(entry => {
        const cur = entry.currency;
        if (cur && runningBal[cur] !== undefined) {
            runningBal[cur] += Number(entry.credit || 0) - Number(entry.debit || 0);
            if (Math.abs(runningBal[cur]) < 0.001) runningBal[cur] = 0;
        }
        return { ...entry, runningBalance: cur ? runningBal[cur] : 0 };
    });

    // Reverse so newest entries are at the top
    const displayEntries = [...entriesWithBalance].reverse();

    const exportToExcel = () => {
        const rows = displayEntries.map((r, i) => ({
            '#': displayEntries.length - i,
            'Date': r._date ? format(new Date(r._date), 'dd-MM-yyyy HH:mm') : '',
            'Particular': r.particular,
            'Reference ID': r.reference_id || '',
            'Type': r._type.toUpperCase(),
            'Currency': r.currency,
            'Credit': r.credit || '',
            'Debit': r.debit || '',
            'Balance': r.runningBalance,
            'Notes': r.notes || '',
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Ledger_${currencyFilter}`);
        XLSX.writeFile(wb, `Ledger_${agent.name}_${currencyFilter}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        toast.success(`Downloaded ledger`);
    };

    const typeBadge = (type, refType) => {
        if (refType === 'transaction') return <span className="badge badge-completed" style={{ fontSize: 10, padding: '2px 8px' }}>TXN</span>;
        if (type === 'credit') return <span className="badge" style={{ background: 'rgba(0,200,150,0.15)', color: 'var(--brand-accent)', fontSize: 10, padding: '2px 8px' }}>CR</span>;
        return <span className="badge" style={{ background: 'rgba(255,84,112,0.15)', color: 'var(--status-failed)', fontSize: 10, padding: '2px 8px' }}>DR</span>;
    };

    if (!agent) return null;

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: '1200px', width: '95%', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header" style={{ paddingBottom: 16 }}>
                    <div>
                        <h3 className="modal-title" style={{ fontSize: 24 }}>Ledger: {agent.name}</h3>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Full transaction history and running balances ({agent.type.toUpperCase()})
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
                        <div className="loading-screen" style={{ minHeight: '400px' }}>
                            <div className="spinner" /><p>Loading ledger…</p>
                        </div>
                    ) : (
                        <>
                            {/* ── Ledger Summary Cards ─────────────────────────────────────── */}
                            <div className="stats-grid" style={{ marginBottom: 32 }}>
                                {allCurrencies.map(cur => {
                                    const t = globalTotals[cur];
                                    const colors = { SAR: '#4a9eff', AED: 'var(--brand-gold)', INR: '#a78bfa' };
                                    const col = colors[cur];
                                    
                                    // If agent has no balance in this currency and no entries, we could hide it, 
                                    // but for "match reports page", keeping all 3 is better.
                                    
                                    return (
                                        <div key={cur} className="card" style={{ padding: '24px 20px', border: `1px solid ${col}40`, position: 'relative', overflow: 'hidden' }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: col }}></div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{cur} Balance</span>
                                                    <span style={{ fontSize: 13, fontWeight: 800, color: col }}>{cur}</span>
                                                </div>
                                                <div style={{ fontSize: 'clamp(24px, 2.8vw, 32px)', fontWeight: 900, color: col, letterSpacing: '-0.5px', margin: '4px 0' }}>
                                                    {t.balance >= 0 ? '' : '-'}{fmt(Math.abs(t.balance))}
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
                                                    <div>
                                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Total Credit</div>
                                                        <div style={{ color: 'var(--brand-accent)', fontWeight: 700, fontSize: 14 }}>{fmt(t.credit)}</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Total Debit</div>
                                                        <div style={{ color: 'var(--status-failed)', fontWeight: 700, fontSize: 14 }}>{fmt(t.debit)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex items-center justify-between mb-4">
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>
                                    {displayEntries.length} entries shown
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

                            {/* ── Ledger Table ────────────────────────────────────── */}
                            {displayEntries.length === 0 ? (
                                <div className="empty-state card" style={{ padding: 40 }}>
                                    <FileSpreadsheet size={40} />
                                    <p>No entries found for {currencyFilter}.</p>
                                </div>
                            ) : (
                                <div className="card" style={{ padding: 0, border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                                    <div className="table-wrapper">
                                        <table className="data-table" style={{ fontSize: 13, borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: 'var(--bg-main)' }}>
                                                    <th style={{ width: 40, padding: '16px 12px' }}>#</th>
                                                    <th style={{ width: 100 }}>Date</th>
                                                    <th style={{ width: 60 }}>Type</th>
                                                    <th>Particular</th>
                                                    <th style={{ width: 80 }}>Currency</th>
                                                    <th style={{ textAlign: 'right', color: 'var(--brand-accent)', width: 120 }}>Credit</th>
                                                    <th style={{ textAlign: 'right', color: 'var(--status-failed)', width: 120 }}>Debit</th>
                                                    <th style={{ textAlign: 'right', width: 140 }}>Balance</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {displayEntries.map((r, i) => (
                                                    <tr key={r._id + i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                        <td style={{ color: 'var(--text-muted)', fontSize: 11, padding: '14px 12px' }}>{displayEntries.length - i}</td>
                                                        <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                                                            {r._date ? format(new Date(r._date), 'dd MMM yy') : '—'}
                                                        </td>
                                                        <td>{typeBadge(r._type, r.reference_type)}</td>
                                                        <td style={{ fontWeight: 500 }}>
                                                            <div>{r.particular}</div>
                                                            {r.reference_id && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>Ref: {r.reference_id}</div>}
                                                        </td>
                                                        <td>
                                                            <span style={{
                                                                fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                                                background: r.currency === 'SAR' ? 'rgba(74,158,255,0.1)' :
                                                                    r.currency === 'AED' ? 'rgba(245,166,35,0.1)' : 'rgba(167,139,250,0.1)',
                                                                color: r.currency === 'SAR' ? '#4a9eff' :
                                                                    r.currency === 'AED' ? 'var(--brand-gold)' : '#a78bfa'
                                                            }}>{r.currency}</span>
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 600, color: r.credit > 0 ? 'var(--brand-accent)' : 'var(--text-muted)' }}>
                                                            {r.credit > 0 ? fmt(r.credit) : '—'}
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 600, color: r.debit > 0 ? 'var(--status-failed)' : 'var(--text-muted)' }}>
                                                            {r.debit > 0 ? fmt(r.debit) : '—'}
                                                        </td>
                                                        <td style={{
                                                            textAlign: 'right', fontWeight: 700,
                                                            color: r.runningBalance >= 0 ? 'var(--text-primary)' : 'var(--status-failed)'
                                                        }}>
                                                            {fmt(r.runningBalance)} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.currency}</span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                {displayCurrencies.map(cur => {
                                                    const t = totals[cur];
                                                    if (t.credit === 0 && t.debit === 0) return null;
                                                    const colors = { SAR: '#4a9eff', AED: 'var(--brand-gold)', INR: '#a78bfa' };
                                                    return (
                                                        <tr key={cur} style={{ background: 'var(--bg-main)', borderTop: '2px solid var(--border-color)' }}>
                                                            <td colSpan={5} style={{ textAlign: 'right', padding: '16px 12px', fontWeight: 700, color: colors[cur] }}>
                                                                {cur} SUMMARY
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand-accent)' }}>
                                                                {fmt(t.credit)}
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--status-failed)' }}>
                                                                {fmt(t.debit)}
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 800, color: t.balance >= 0 ? colors[cur] : 'var(--status-failed)' }}>
                                                                {fmt(t.balance)} <span style={{ fontSize: 10 }}>{cur}</span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tfoot>
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
