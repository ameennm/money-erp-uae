import { useState, useEffect } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Download, Search, FileSpreadsheet, Filter } from 'lucide-react';
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
            const d = new Date(r._date);
            const f = from ? new Date(from) : null;
            const t = to ? new Date(to + 'T23:59:59') : null;
            return (!f || d >= f) && (!t || d <= t);
        });
    }
    return arr.filter(r => isAfter(new Date(r._date), start));
};

const fmt = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function ReportsPage() {
    const { role } = useAuth();

    const [txs, setTxs] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState('All Time');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [search, setSearch] = useState('');
    const [showTx, setShowTx] = useState(true);
    const [showIncome, setShowIncome] = useState(true);
    const [showExpense, setShowExpense] = useState(true);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [t, ex] = await Promise.all([
                dbService.listTransactions(),
                dbService.listExpenses(),
            ]);
            setTxs(t.documents);
            setExpenses(ex.documents);
        } catch (e) {
            toast.error('Failed to load data: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, []);

    // Build unified ledger entries
    const allEntries = [];

    if (showTx) {
        txs.forEach(tx => {
            // Collection (Credit in SAR/AED)
            allEntries.push({
                _type: 'transaction',
                _date: tx.$createdAt,
                _id: tx.$id + '_col',
                particular: `${tx.client_name} — Collection`,
                txId: tx.tx_id || '',
                currency: tx.collected_currency || '',
                credit: tx.collected_amount || 0,
                debit: 0,
                agent: tx.collection_agent_name || '',
                notes: tx.notes || '',
            });
        });
    }

    if (showIncome) {
        expenses.filter(e => e.type === 'income').forEach(e => {
            allEntries.push({
                _type: 'income',
                _date: e.$createdAt,
                _id: e.$id,
                particular: e.title || 'Income',
                txId: '',
                currency: e.currency || 'AED',
                credit: Number(e.amount) || 0,
                debit: 0,
                agent: '',
                notes: `${e.category || ''}${e.notes ? ' — ' + e.notes : ''}`,
            });
        });
    }

    if (showExpense) {
        expenses.filter(e => e.type !== 'income').forEach(e => {
            allEntries.push({
                _type: 'expense',
                _date: e.$createdAt,
                _id: e.$id,
                particular: e.title || 'Expense',
                txId: '',
                currency: e.currency || 'AED',
                credit: 0,
                debit: Number(e.amount) || 0,
                agent: '',
                notes: `${e.category || ''}${e.notes ? ' — ' + e.notes : ''}`,
            });
        });
    }

    // Sort by date ascending for ledger
    allEntries.sort((a, b) => new Date(a._date) - new Date(b._date));

    // Apply filters
    const dateFiltered = applyDateRange(allEntries, dateRange, customFrom, customTo);
    const filtered = dateFiltered.filter(r =>
        r.particular?.toLowerCase().includes(search.toLowerCase()) ||
        r.txId?.includes(search) ||
        r.agent?.toLowerCase().includes(search.toLowerCase()) ||
        r.notes?.toLowerCase().includes(search.toLowerCase())
    );

    // Ledger totals per currency
    const currencies = ['SAR', 'AED', 'INR'];
    const totals = {};
    currencies.forEach(cur => {
        const curEntries = filtered.filter(e => e.currency === cur);
        const totalCredit = curEntries.reduce((a, e) => a + e.credit, 0);
        const totalDebit = curEntries.reduce((a, e) => a + e.debit, 0);
        totals[cur] = { credit: totalCredit, debit: totalDebit, balance: totalCredit - totalDebit };
    });

    // Running balance per currency
    const runningBal = { SAR: 0, AED: 0, INR: 0 };
    const entriesWithBalance = filtered.map(entry => {
        const cur = entry.currency;
        if (cur && runningBal[cur] !== undefined) {
            runningBal[cur] += entry.credit - entry.debit;
        }
        return { ...entry, runningBalance: cur ? runningBal[cur] : 0 };
    });

    const exportToExcel = () => {
        if (filtered.length === 0) return toast.error('No records to export');
        const rows = filtered.map((r, i) => ({
            '#': i + 1,
            'Date': r._date ? format(new Date(r._date), 'dd-MM-yyyy HH:mm') : '',
            'Particular': r.particular,
            'TX ID': r.txId || '',
            'Type': r._type.charAt(0).toUpperCase() + r._type.slice(1),
            'Currency': r.currency,
            'Credit': r.credit || '',
            'Debit': r.debit || '',
            'Agent': r.agent || '',
            'Notes': r.notes || '',
        }));

        // Add summary rows
        rows.push({});
        rows.push({ '#': '', 'Date': '', 'Particular': 'SUMMARY', 'TX ID': '', 'Type': '', 'Currency': '', 'Credit': '', 'Debit': '' });
        currencies.forEach(cur => {
            rows.push({
                '#': '', 'Date': '', 'Particular': `${cur} Totals`,
                'TX ID': '', 'Type': '', 'Currency': cur,
                'Credit': totals[cur].credit, 'Debit': totals[cur].debit,
                'Agent': `Balance: ${totals[cur].balance}`, 'Notes': ''
            });
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const colWidths = Object.keys(rows[0]).map(key => ({
            wch: Math.max(key.length, ...rows.map(r => String(r[key] || '').length)) + 2
        }));
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
        const fileName = `Ledger_${dateRange.replace(/\s/g, '_')}_${format(new Date(), 'dd-MMM-yyyy')}.xlsx`;
        XLSX.writeFile(wb, fileName);
        toast.success(`Downloaded ledger with ${filtered.length} entries`);
    };

    const typeBadge = (type) => {
        if (type === 'transaction') return <span className="badge badge-completed" style={{ fontSize: 10, padding: '2px 8px' }}>TXN</span>;
        if (type === 'income') return <span className="badge" style={{ background: 'rgba(0,200,150,0.15)', color: 'var(--brand-accent)', fontSize: 10, padding: '2px 8px' }}>CR</span>;
        return <span className="badge" style={{ background: 'rgba(255,84,112,0.15)', color: 'var(--status-failed)', fontSize: 10, padding: '2px 8px' }}>DR</span>;
    };

    if (loading) {
        return (
            <Layout title="Reports">
                <div className="loading-screen" style={{ minHeight: '60vh' }}>
                    <div className="spinner" /><p>Loading ledger…</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="Reports — Financial Ledger">

            {/* ── Ledger Summary ─────────────────────────────────────── */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-muted)', marginBottom: 12 }}>
                Ledger Summary — {dateRange}
            </div>
            <div className="stats-grid" style={{ marginBottom: 28 }}>
                {currencies.map(cur => {
                    const t = totals[cur];
                    const colors = { SAR: '#4a9eff', AED: 'var(--brand-gold)', INR: '#a78bfa' };
                    const col = colors[cur];
                    return (
                        <div key={cur} className="card" style={{ padding: 20, border: `1px solid ${col}25` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                <span style={{ fontSize: 15, fontWeight: 800, color: col }}>{cur}</span>
                                <span style={{ fontSize: 'clamp(16px, 2.5vw, 22px)', fontWeight: 800, color: col }}>
                                    {t.balance >= 0 ? '' : '-'}{fmt(Math.abs(t.balance))}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Credit: </span>
                                    <span style={{ color: 'var(--brand-accent)', fontWeight: 700 }}>{fmt(t.credit)}</span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Debit: </span>
                                    <span style={{ color: 'var(--status-failed)', fontWeight: 700 }}>{fmt(t.debit)}</span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Balance: </span>
                                    <span style={{ fontWeight: 700, color: t.balance >= 0 ? 'var(--brand-accent)' : 'var(--status-failed)' }}>{fmt(t.balance)}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Filters ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                    {DATE_RANGES.map(r => (
                        <button key={r} onClick={() => setDateRange(r)}
                            className={`btn btn-sm ${dateRange === r ? 'btn-accent' : 'btn-outline'}`}>{r}</button>
                    ))}
                    {dateRange === 'Custom' && (
                        <>
                            <input type="date" className="form-input" style={{ maxWidth: 140, padding: '4px 8px', fontSize: 13 }}
                                value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                            <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>to</span>
                            <input type="date" className="form-input" style={{ maxWidth: 140, padding: '4px 8px', fontSize: 13 }}
                                value={customTo} onChange={e => setCustomTo(e.target.value)} />
                        </>
                    )}
                </div>
            </div>

            {/* ── Type Checkboxes + Search + Download ─────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <div className="flex gap-4 flex-wrap" style={{ fontSize: 13 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: showTx ? 'var(--brand-accent)' : 'var(--text-muted)' }}>
                        <input type="checkbox" checked={showTx} onChange={e => setShowTx(e.target.checked)}
                            style={{ accentColor: 'var(--brand-accent)', width: 15, height: 15 }} />
                        Transactions
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: showIncome ? 'var(--brand-accent)' : 'var(--text-muted)' }}>
                        <input type="checkbox" checked={showIncome} onChange={e => setShowIncome(e.target.checked)}
                            style={{ accentColor: 'var(--brand-accent)', width: 15, height: 15 }} />
                        Income
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: showExpense ? 'var(--brand-accent)' : 'var(--text-muted)' }}>
                        <input type="checkbox" checked={showExpense} onChange={e => setShowExpense(e.target.checked)}
                            style={{ accentColor: 'var(--brand-accent)', width: 15, height: 15 }} />
                        Expenses
                    </label>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input className="form-input" style={{ paddingLeft: 38, width: '100%' }} placeholder="Search particulars..."
                            value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <button className="btn btn-outline" onClick={exportToExcel} style={{ whiteSpace: 'nowrap' }}>
                        <Download size={16} /> Excel
                    </button>
                </div>
            </div>

            {/* ── Ledger Table ────────────────────────────────────── */}
            {filtered.length === 0 ? (
                <div className="empty-state card">
                    <FileSpreadsheet size={40} />
                    <p>No entries found for the selected filters.</p>
                </div>
            ) : (
                <div className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title">Ledger</div>
                            <div className="card-subtitle">{filtered.length} entries — {dateRange}</div>
                        </div>
                    </div>
                    <div className="table-wrapper">
                        <table className="data-table" style={{ fontSize: 13 }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 30 }}>#</th>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Particular</th>
                                    <th>Currency</th>
                                    <th style={{ textAlign: 'right', color: 'var(--brand-accent)' }}>Credit</th>
                                    <th style={{ textAlign: 'right', color: 'var(--status-failed)' }}>Debit</th>
                                    <th style={{ textAlign: 'right' }}>Balance</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entriesWithBalance.map((r, i) => (
                                    <tr key={r._id}>
                                        <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                                            {r._date ? format(new Date(r._date), 'dd MMM yy') : '—'}
                                        </td>
                                        <td>{typeBadge(r._type)}</td>
                                        <td style={{ fontWeight: 500, maxWidth: 220 }}>
                                            {r.txId && <span style={{ color: 'var(--brand-accent)', fontSize: 11, marginRight: 4 }}>#{r.txId}</span>}
                                            {r.particular}
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
                                        <td style={{ textAlign: 'right', fontWeight: 600, color: r.credit > 0 ? 'var(--brand-accent)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                            {r.credit > 0 ? fmt(r.credit) : '—'}
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 600, color: r.debit > 0 ? 'var(--status-failed)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                            {r.debit > 0 ? fmt(r.debit) : '—'}
                                        </td>
                                        <td style={{
                                            textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                                            color: r.runningBalance >= 0 ? 'var(--text-primary)' : 'var(--status-failed)'
                                        }}>
                                            {fmt(r.runningBalance)} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.currency}</span>
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {r.notes || '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                {currencies.map(cur => {
                                    const t = totals[cur];
                                    if (t.credit === 0 && t.debit === 0) return null;
                                    const colors = { SAR: '#4a9eff', AED: 'var(--brand-gold)', INR: '#a78bfa' };
                                    return (
                                        <tr key={cur} style={{ borderTop: cur === 'SAR' ? '2px solid var(--border-color)' : undefined }}>
                                            <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, color: colors[cur] }}>
                                                {cur} TOTAL
                                            </td>
                                            <td></td>
                                            <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand-accent)', fontVariantNumeric: 'tabular-nums' }}>
                                                {fmt(t.credit)}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--status-failed)', fontVariantNumeric: 'tabular-nums' }}>
                                                {fmt(t.debit)}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 800, color: t.balance >= 0 ? colors[cur] : 'var(--status-failed)', fontVariantNumeric: 'tabular-nums' }}>
                                                {fmt(t.balance)} <span style={{ fontSize: 10 }}>{cur}</span>
                                            </td>
                                            <td></td>
                                        </tr>
                                    );
                                })}
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </Layout>
    );
}
