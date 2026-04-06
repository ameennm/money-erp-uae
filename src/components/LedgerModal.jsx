import { useState, useEffect, useMemo } from 'react';
import { dbService, Query } from '../lib/appwrite';
import { X, Download, FileSpreadsheet, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { SearchInput, DateRangeFilter, CurrencyFilter, FilterBar } from './filters';
import { applyDateRange, createSearchMatcher } from '../utils/filterHelpers';

const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function LedgerModal({ agent, onClose }) {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currencyFilter, setCurrencyFilter] = useState('All');
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState({ range: 'All Time', customFrom: '', customTo: '' });
    
    const fetchEntries = async () => {
        setLoading(true);
        try {
            const res = await dbService.listLedgerEntries([
                Query.equal('agent_id', agent.$id),
                Query.orderDesc('createdAt'),
            ]);
            setEntries(res.documents);
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
            credit: e.type === 'credit' ? Number(e.amount) : 0,
            debit: e.type === 'debit' ? Number(e.amount) : 0,
        }));
    }, [entries]);

    const allEntriesWithBalance = useMemo(() => {
        const sorted = [...allEntries].sort((a, b) => new Date(a._date) - new Date(b._date));
        const runningBal = { SAR: 0, AED: 0, INR: 0 };
        return sorted.map(entry => {
            const cur = entry.currency;
            if (cur && runningBal[cur] !== undefined) {
                runningBal[cur] += Number(entry.debit || 0) - Number(entry.credit || 0);
                if (Math.abs(runningBal[cur]) < 0.001) runningBal[cur] = 0;
            }
            return { ...entry, runningBalance: cur ? runningBal[cur] : 0 };
        }).reverse(); 
    }, [allEntries]);

    const filtered = useMemo(() => {
        let result = allEntriesWithBalance;
        result = applyDateRange(result, dateRange.range, dateRange.customFrom, dateRange.customTo, '_date');
        if (currencyFilter !== 'All') {
            result = result.filter(r => r.currency === currencyFilter);
        }
        const searchMatcher = createSearchMatcher(['particular', 'reference_type']);
        result = result.filter(r => searchMatcher(r, search));
        return result;
    }, [allEntriesWithBalance, dateRange, currencyFilter, search]);

    const allCurrencies = ['SAR', 'AED', 'INR'];
    const displayCurrencies = currencyFilter === 'All' ? allCurrencies : [currencyFilter];

    const totals = {};
    allCurrencies.forEach(cur => {
        const curEntries = filtered.filter(e => e.currency === cur);
        const totalDebit = curEntries.reduce((a, e) => a + Number(e.debit || 0), 0);
        const totalCredit = curEntries.reduce((a, e) => a + Number(e.credit || 0), 0);
        let bal = totalDebit - totalCredit;
        if (Math.abs(bal) < 0.001) bal = 0;
        totals[cur] = { debit: totalDebit, credit: totalCredit, balance: bal };
    });

    const activeFilterCount = [search, currencyFilter !== 'All', dateRange.range !== 'All Time'].filter(Boolean).length;

    const resetFilters = () => {
        setSearch('');
        setCurrencyFilter('All');
        setDateRange({ range: 'All Time', customFrom: '', customTo: '' });
    };

    const exportToExcel = () => {
        const rows = filtered.map((r, i) => ({
            '#': filtered.length - i,
            'Date': r._date ? format(new Date(r._date), 'dd-MM-yyyy HH:mm') : '',
            'Particular': r.particular,
            'Business Debit': r.debit || '',
            'Business Credit': r.credit || '',
            'Currency': r.currency,
            'Net Balance': r.runningBalance,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `${agent.name}_Ledger`);
        XLSX.writeFile(wb, `Business_Ledger_${agent.name}.xlsx`);
        toast.success(`Downloaded ledger`);
    };

    if (!agent) return null;

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: '950px', width: '95%', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <div>
                        <h3 className="modal-title" style={{ fontSize: 22 }}>{agent.name} — Business Ledger</h3>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            View history from the perspective of the business. 
                            <strong> Debit</strong> (Owed to us) | <strong>Credit</strong> (We owe them).
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button className="btn btn-outline btn-sm" onClick={exportToExcel}><Download size={14} /> Excel</button>
                        <button className="close-btn" onClick={onClose}><X size={20} /></button>
                    </div>
                </div>

                <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: 'var(--bg-color)' }}>
                    {loading ? (
                        <div className="loading-screen" style={{ minHeight: '300px' }}><div className="spinner" /><p>Loading…</p></div>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                                <div className="card" style={{ padding: '16px', border: '1px solid rgba(74,158,255,0.2)', background: 'rgba(74,158,255,0.05)' }}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <TrendingUp size={16} color="#4a9eff" />
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Business Debit</span>
                                    </div>
                                    {displayCurrencies.map(c => (
                                        <div key={c} className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] font-bold text-gray-500">{c}</span>
                                            <span className="text-lg font-black text-[#4a9eff]">{fmt(totals[c].debit)}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="card" style={{ padding: '16px', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <TrendingDown size={16} color="#ef4444" />
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Business Credit</span>
                                    </div>
                                    {displayCurrencies.map(c => (
                                        <div key={c} className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] font-bold text-gray-500">{c}</span>
                                            <span className="text-lg font-black text-[#ef4444]">{fmt(totals[c].credit)}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="card" style={{ padding: '16px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Wallet size={16} color="var(--brand-primary)" />
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Net Position</span>
                                    </div>
                                    {displayCurrencies.map(c => (
                                        <div key={c} className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] font-bold text-gray-500">{c}</span>
                                            <span className={`text-lg font-black ${totals[c].balance >= 0 ? 'text-brand-primary' : 'text-[#ef4444]'}`}>
                                                {totals[c].balance >= 0 ? '+' : ''}{fmt(totals[c].balance)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <FilterBar showClearAll onClearAll={resetFilters} activeFilterCount={activeFilterCount}>
                                <SearchInput value={search} onChange={setSearch} placeholder="Search ledger..." />
                                <CurrencyFilter value={currencyFilter} onChange={setCurrencyFilter} currencies={['All', 'SAR', 'AED', 'INR']} />
                                <DateRangeFilter value={dateRange} onChange={setDateRange} />
                            </FilterBar>

                            {filtered.length === 0 ? (
                                <div className="empty-state card py-20"><FileSpreadsheet size={40} /><p>No ledger entries found.</p></div>
                            ) : (
                                <div className="card p-0 overflow-hidden border-border">
                                    <div className="table-wrapper">
                                        <table className="data-table text-sm border-collapse">
                                            <thead>
                                                <tr className="bg-main">
                                                    <th className="w-10 p-4">#</th>
                                                    <th className="w-28">Date</th>
                                                    <th>Particular</th>
                                                    <th className="w-20 text-center">Cur</th>
                                                    <th className="w-32 text-right text-[#4a9eff]">Debit (+)</th>
                                                    <th className="w-32 text-right text-[#ef4444]">Credit (−)</th>
                                                    <th className="w-36 text-right">Balance</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filtered.map((r, i) => {
                                                    const balCol = r.runningBalance >= 0 ? 'text-brand-primary' : 'text-[#ef4444]';
                                                    const curCol = { SAR: '#4a9eff', AED: 'var(--brand-gold)', INR: '#a78bfa' }[r.currency] || 'var(--text-muted)';
                                                    return (
                                                        <tr key={r._id + i} className="border-b border-border">
                                                            <td className="text-[11px] text-gray-500 p-3">{filtered.length - i}</td>
                                                            <td className="text-[11px] text-gray-400 whitespace-nowrap">
                                                                {r._date ? format(new Date(r._date), 'dd MMM yyyy') : '—'}
                                                            </td>
                                                            <td className="font-semibold py-3">
                                                                <div className="truncate max-w-sm">{r.particular}</div>
                                                                {r.reference_type && <span className="text-[9px] uppercase tracking-tighter opacity-50">{r.reference_type} — {r.reference_id?.slice(-6)}</span>}
                                                            </td>
                                                            <td className="text-center">
                                                                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: `${curCol}15`, color: curCol }}>{r.currency}</span>
                                                            </td>
                                                            <td className={`text-right font-bold ${r.debit > 0 ? 'text-[#4a9eff]' : 'text-gray-600 opacity-20'}`}>
                                                                {r.debit > 0 ? `+${fmt(r.debit)}` : '—'}
                                                            </td>
                                                            <td className={`text-right font-bold ${r.credit > 0 ? 'text-[#ef4444]' : 'text-gray-600 opacity-20'}`}>
                                                                {r.credit > 0 ? `−${fmt(r.credit)}` : '—'}
                                                            </td>
                                                            <td className={`text-right font-black ${balCol}`}>
                                                                {r.runningBalance >= 0 ? '+' : ''}{fmt(r.runningBalance)} <span className="text-[9px] opacity-40">{r.currency}</span>
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
