import { useState, useEffect, useMemo } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Download, FileSpreadsheet, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

// Filter components
import { SearchInput, DateRangeFilter, CurrencyFilter, TypeFilter, FilterBar } from '../components/filters';
import { applyDateRange } from '../utils/filterHelpers';

const fmt = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

const TYPE_OPTIONS = [
    { value: 'income', label: 'Income', color: 'var(--brand-accent)' },
    { value: 'expense', label: 'Expenses', color: 'var(--status-failed)' }
];

export default function ReportsPage() {
    const [txs, setTxs] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [aedConversions, setAedConversions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [dateRange, setDateRange] = useState({ range: 'All Time', customFrom: '', customTo: '' });
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState(['income', 'expense']);
    const [currencyFilter, setCurrencyFilter] = useState('All');

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
        } catch (e) {
            toast.error('Failed to load data: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, []);

    // Build unified ledger entries
    const allEntries = useMemo(() => {
        const entries = [];

        // Distribution (Debit in INR) - money leaving the system to customers!
        txs.forEach(tx => {
            if (tx.status === 'completed' && Number(tx.actual_inr_distributed) > 0) {
                entries.push({
                    _type: 'transaction',
                    _date: tx.$updatedAt || tx.$createdAt,
                    _id: tx.$id + '_dist',
                    particular: `${tx.client_name} — Distribution`,
                    txId: tx.tx_id || '',
                    currency: 'INR',
                    credit: 0,
                    debit: Number(tx.actual_inr_distributed),
                    agent: tx.distributor_name || '',
                    notes: tx.notes || '',
                });
            }
        });

        if (typeFilter.includes('income')) {
            expenses.filter(e => e.type === 'income').forEach(e => {
                entries.push({
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

        if (typeFilter.includes('expense')) {
            // Exclude internal transfers/deposits to distributors since they are still inside the system
            expenses
                .filter(e => e.type !== 'income' && e.category !== 'Distributor Deposit' && e.category !== 'Distributor Transfer')
                .forEach(e => {
                    entries.push({
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

            // Show SAR -> AED Conversions in the ledger
            aedConversions.forEach(c => {
                // SAR Out (Debit)
                entries.push({
                    _type: 'expense',
                    _date: c.$createdAt || c.date,
                    _id: c.$id + '_sar',
                    particular: `SAR→AED Conversion via ${c.conversion_agent_name || ''}`,
                    txId: '',
                    currency: 'SAR',
                    credit: 0,
                    debit: Number(c.sar_amount) || 0,
                    agent: c.conversion_agent_name || '',
                    notes: `Rate: ${c.sar_rate || ''}`,
                });

                // AED In (Credit)
                entries.push({
                    _type: 'income',
                    _date: c.$createdAt || c.date,
                    _id: c.$id + '_aed',
                    particular: `SAR→AED Conversion via ${c.conversion_agent_name || ''}`,
                    txId: '',
                    currency: 'AED',
                    credit: Number(c.aed_amount) || 0,
                    debit: 0,
                    agent: c.conversion_agent_name || '',
                    notes: `Converted from ${Number(c.sar_amount) || 0} SAR`,
                });
            });
        }

        // Sort by date ascending for ledger
        entries.sort((a, b) => new Date(a._date) - new Date(b._date));
        return entries;
    }, [txs, expenses, aedConversions, typeFilter]);

    // Apply filters
    const filtered = useMemo(() => {
        let result = [...allEntries];

        // Apply date range
        result = applyDateRange(result, dateRange.range, dateRange.customFrom, dateRange.customTo, '_date');

        // Apply currency filter
        if (currencyFilter !== 'All') {
            result = result.filter(r => r.currency === currencyFilter);
        }

        // Apply search filter
        if (search.trim()) {
            const term = search.toLowerCase();
            result = result.filter(r =>
                r.particular?.toLowerCase().includes(term) ||
                r.txId?.toLowerCase().includes(term) ||
                r.agent?.toLowerCase().includes(term) ||
                r.notes?.toLowerCase().includes(term)
            );
        }

        return result;
    }, [allEntries, dateRange, currencyFilter, search]);

    // Ledger totals per currency
    const allCurrencies = ['SAR', 'AED', 'INR'];
    const displayCurrencies = currencyFilter === 'All' ? allCurrencies : [currencyFilter];

    const totals = useMemo(() => {
        const result = {};
        displayCurrencies.forEach(cur => {
            const curEntries = filtered.filter(e => e.currency === cur);
            const totalCredit = curEntries.reduce((a, e) => a + Number(e.credit || 0), 0);
            const totalDebit = curEntries.reduce((a, e) => a + Number(e.debit || 0), 0);
            let bal = totalCredit - totalDebit;
            if (Math.abs(bal) < 0.001) bal = 0;
            result[cur] = { credit: totalCredit, debit: totalDebit, balance: bal };
        });
        return result;
    }, [filtered, displayCurrencies]);

    // Running balance per currency
    const entriesWithBalance = useMemo(() => {
        const runningBal = { SAR: 0, AED: 0, INR: 0 };
        return filtered.map(entry => {
            const cur = entry.currency;
            if (cur && runningBal[cur] !== undefined) {
                runningBal[cur] += Number(entry.credit || 0) - Number(entry.debit || 0);
                if (Math.abs(runningBal[cur]) < 0.001) runningBal[cur] = 0;
            }
            return { ...entry, runningBalance: cur ? runningBal[cur] : 0 };
        });
    }, [filtered]);

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
        displayCurrencies.forEach(cur => {
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
        const fileName = `Ledger_${dateRange.range.replace(/\s/g, '_')}_${format(new Date(), 'dd-MMM-yyyy')}.xlsx`;
        XLSX.writeFile(wb, fileName);
        toast.success(`Downloaded ledger with ${filtered.length} entries`);
    };

    const shareOnWhatsApp = () => {
        const lines = [
            `📊 *MoneyFlow Ledger Report*`,
            `Period: ${dateRange.range}`,
            `Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
            `─────────────────────`,
            `*Currency Summary:*`,
            ...displayCurrencies
                .filter(cur => totals[cur].credit > 0 || totals[cur].debit > 0)
                .map(cur => `${cur}: Credit ${fmt(totals[cur].credit)} | Debit ${fmt(totals[cur].debit)} | Balance ${fmt(totals[cur].balance)}`),
            `─────────────────────`,
            `*Recent Entries (${Math.min(filtered.length, 20)} of ${filtered.length}):*`,
            ...filtered.slice(0, 20).map((r, i) =>
                `${i + 1}. ${r._date ? format(new Date(r._date), 'dd MMM') : '—'} | ${r.particular} | ${r.currency} ${r.credit > 0 ? '+' + fmt(r.credit) : '-' + fmt(r.debit)}`
            ),
            ``,
            `_MoneyFlow ERP_`,
        ];
        const text = encodeURIComponent(lines.join('\n'));
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    const typeBadge = (type) => {
        if (type === 'transaction') return <span className="badge badge-completed" style={{ fontSize: 10, padding: '2px 8px' }}>TXN</span>;
        if (type === 'income') return <span className="badge" style={{ background: 'rgba(0,200,150,0.15)', color: 'var(--brand-accent)', fontSize: 10, padding: '2px 8px' }}>CR</span>;
        return <span className="badge" style={{ background: 'rgba(255,84,112,0.15)', color: 'var(--status-failed)', fontSize: 10, padding: '2px 8px' }}>DR</span>;
    };

    const resetFilters = () => {
        setDateRange({ range: 'All Time', customFrom: '', customTo: '' });
        setSearch('');
        setTypeFilter(['income', 'expense']);
        setCurrencyFilter('All');
    };

    const activeFilterCount = [
        dateRange.range !== 'All Time',
        search,
        currencyFilter !== 'All',
        typeFilter.length !== 2
    ].filter(Boolean).length;

    if (loading) {
        return (
            <Layout title="Ledger">
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
                Ledger Summary — {dateRange.range}
            </div>
            <div className="stats-grid" style={{ marginBottom: 32 }}>
                {displayCurrencies.map(cur => {
                    const t = totals[cur];
                    const colors = { SAR: '#4a9eff', AED: 'var(--brand-gold)', INR: '#a78bfa' };
                    const col = colors[cur];
                    return (
                        <div key={cur} className="card" style={{ padding: '24px 20px', border: `1px solid ${col}40`, position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: col }}></div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{cur} Native Balance</span>
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

            {/* ── Filter Bar ─────────────────────────────────────────── */}
            <FilterBar showClearAll onClearAll={resetFilters} activeFilterCount={activeFilterCount}>
                <DateRangeFilter
                    value={dateRange}
                    onChange={setDateRange}
                />
                <TypeFilter
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={TYPE_OPTIONS}
                    type="checkboxes"
                    multiSelect
                />
                <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search particulars..."
                />
                <CurrencyFilter
                    value={currencyFilter}
                    onChange={setCurrencyFilter}
                    currencies={['All', 'SAR', 'AED', 'INR']}
                />
                <div className="flex gap-2 ml-auto">
                    <button className="btn btn-outline" onClick={exportToExcel} style={{ whiteSpace: 'nowrap' }}>
                        <Download size={16} /> Excel
                    </button>
                    <button
                        className="btn btn-sm"
                        style={{ background: '#25D366', color: '#fff', border: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}
                        onClick={shareOnWhatsApp}
                        title="Share on WhatsApp"
                    >
                        <MessageCircle size={15} /> WhatsApp
                    </button>
                </div>
            </FilterBar>

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
                            <div className="card-subtitle">{filtered.length} entries — {dateRange.range}</div>
                        </div>
                    </div>
                    <div className="table-wrapper">
                        <table className="data-table" style={{ fontSize: 13 }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>#</th>
                                    <th style={{ width: 100 }}>Date</th>
                                    <th style={{ width: 80 }}>Type</th>
                                    <th>Particular</th>
                                    <th style={{ width: 90 }}>Currency</th>
                                    <th style={{ textAlign: 'right', color: 'var(--brand-accent)', width: 140 }}>Credit</th>
                                    <th style={{ textAlign: 'right', color: 'var(--status-failed)', width: 140 }}>Debit</th>
                                    <th style={{ textAlign: 'right', width: 160 }}>Balance</th>
                                    <th style={{ width: 200 }}>Notes</th>
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
                                {displayCurrencies.map(cur => {
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
