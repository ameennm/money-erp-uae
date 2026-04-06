import { useState, useEffect, useMemo } from 'react';
import { dbService } from '../lib/appwrite';
import { ledgerService } from '../lib/ledgerService';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Plus, X, Trash2, TrendingDown, TrendingUp, Download } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

// Filter components
import { SearchInput, DateRangeFilter, CurrencyFilter, TypeFilter, FilterBar } from '../components/filters';
import { applyDateRange, createSearchMatcher } from '../utils/filterHelpers';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants';

const EMPTY = {
    title: '',
    type: 'expense',
    category: EXPENSE_CATEGORIES[0],
    amount: '',
    currency: 'AED',
    date: '',
    notes: '',
    distributor_id: '',
    distributor_name: ''
};

const TYPE_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'income', label: 'Income', color: 'var(--brand-accent)' },
    { value: 'expense', label: 'Expenses', color: 'var(--status-failed)' }
];

export default function ExpensesPage() {
    const [expenses, setExpenses] = useState([]);
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);

    // Filter states
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [currencyFilter, setCurrencyFilter] = useState('All');
    const [dateRange, setDateRange] = useState({ range: 'All Time', customFrom: '', customTo: '' });

    const fetch = async () => {
        setLoading(true);
        try {
            const r = await dbService.listExpenses();
            setExpenses(r.documents);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetch(); }, []);

    // Combined filter logic
    const filteredExpenses = useMemo(() => {
        let result = [...expenses];

        // Apply date range filter
        result = applyDateRange(result, dateRange.range, dateRange.customFrom, dateRange.customTo);

        // Apply type filter
        if (typeFilter !== 'all') {
            result = result.filter(e => e.type === typeFilter);
        }

        // Apply currency filter
        if (currencyFilter !== 'All') {
            result = result.filter(e => e.currency === currencyFilter);
        }

        // Apply search filter
        const searchMatcher = createSearchMatcher(['title', 'notes', 'category', 'distributor_name']);
        result = result.filter(e => searchMatcher(e, search));

        return result;
    }, [expenses, dateRange, typeFilter, currencyFilter, search]);

    // Calculate totals
    const incomeSAR = filteredExpenses.filter(e => e.type === 'income' && e.currency === 'SAR').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const incomeAED = filteredExpenses.filter(e => e.type === 'income' && e.currency === 'AED').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const incomeINR = filteredExpenses.filter(e => e.type === 'income' && e.currency === 'INR').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const expenseSAR = filteredExpenses.filter(e => e.type !== 'income' && e.currency === 'SAR').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const expenseAED = filteredExpenses.filter(e => e.type !== 'income' && e.currency === 'AED').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const expenseINR = filteredExpenses.filter(e => e.type !== 'income' && e.currency === 'INR').reduce((a, e) => a + (Number(e.amount) || 0), 0);

    const handleSave = async (ev) => {
        ev.preventDefault();
        setSaving(true);
        try {
            const amt = parseFloat(form.amount) || 0;
            const payload = { ...form, amount: amt };
            
            // Note: Balance-affecting entries (Distributors/Agents) 
            // are now handled via their specific pages for better audit trails.
            const created = await dbService.createExpense(payload);

            toast.success('Record saved');
            setModal(false);
            setForm(EMPTY);
            setExpenses(prev => [{ ...created, ...payload }, ...prev]);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this expense?')) return;
        try {
            // ── Remove related ledger entries and rollback balances if any ──
            await ledgerService.deleteRelatedEntries(id, 'expense');

            await dbService.deleteExpense(id);
            toast.success('Deleted');
            setExpenses(prev => prev.filter(e => e.$id !== id));
        } catch (e) {
            toast.error(e.message);
        }
    };

    const exportToExcel = () => {
        const rows = filteredExpenses.map((e, i) => ({
            '#': i + 1,
            'Type': e.type === 'income' ? 'Income' : 'Expense',
            'Title': e.title,
            'Category': e.category,
            'Amount': Number(e.amount || 0),
            'Currency': e.currency,
            'Related Agent': e.distributor_name || '',
            'Date': e.date || (e.$createdAt ? format(new Date(e.$createdAt), 'dd MMM yyyy') : ''),
            'Notes': e.notes || '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Income & Ops');
        XLSX.writeFile(wb, `income_ops_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };


    const resetFilters = () => {
        setSearch('');
        setTypeFilter('all');
        setCurrencyFilter('All');
        setDateRange({ range: 'All Time', customFrom: '', customTo: '' });
    };

    const activeFilterCount = [
        search,
        typeFilter !== 'all',
        currencyFilter !== 'All',
        dateRange.range !== 'All Time'
    ].filter(Boolean).length;

    return (
        <Layout title="Income &amp; Ops">
            <div className="stats-grid mb-6">
                <div className="stat-card" style={{ '--accent-bar': 'var(--brand-accent)' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(0,200,150,0.15)', '--icon-color': 'var(--brand-accent)' }}>
                        <TrendingUp size={20} />
                    </div>
                    <div className="stat-label" style={{ marginBottom: 8 }}>Total Income</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {incomeSAR > 0 && <div style={{ fontSize: 15, fontWeight: 800, color: '#4a9eff' }}>{incomeSAR.toLocaleString()} <span style={{ fontSize: 11, opacity: 0.7 }}>SAR</span></div>}
                        {incomeAED > 0 && <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-gold)' }}>{incomeAED.toLocaleString()} <span style={{ fontSize: 11, opacity: 0.7 }}>AED</span></div>}
                        {incomeINR > 0 && <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-accent)' }}>₹{incomeINR.toLocaleString('en-IN')} <span style={{ fontSize: 11, opacity: 0.7 }}>INR</span></div>}
                        {incomeSAR === 0 && incomeAED === 0 && incomeINR === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No income recorded</div>}
                    </div>
                </div>

                <div className="stat-card" style={{ '--accent-bar': 'var(--status-failed)' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(255,84,112,0.15)', '--icon-color': 'var(--status-failed)' }}>
                        <TrendingDown size={20} />
                    </div>
                    <div className="stat-label" style={{ marginBottom: 8 }}>Total Expenses</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {expenseSAR > 0 && <div style={{ fontSize: 15, fontWeight: 800, color: '#4a9eff' }}>{expenseSAR.toLocaleString()} <span style={{ fontSize: 11, opacity: 0.7 }}>SAR</span></div>}
                        {expenseAED > 0 && <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-gold)' }}>{expenseAED.toLocaleString()} <span style={{ fontSize: 11, opacity: 0.7 }}>AED</span></div>}
                        {expenseINR > 0 && <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--status-failed)' }}>₹{expenseINR.toLocaleString('en-IN')} <span style={{ fontSize: 11, opacity: 0.7 }}>INR</span></div>}
                        {expenseSAR === 0 && expenseAED === 0 && expenseINR === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No expenses recorded</div>}
                    </div>
                </div>

                <div className="stat-card" style={{ '--accent-bar': '#4a9eff' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(74,158,255,0.15)', '--icon-color': '#4a9eff' }}>
                        <TrendingUp size={20} />
                    </div>
                    <div style={{ fontSize: 'clamp(24px,3vw,36px)', fontWeight: 800 }}>{filteredExpenses.length}</div>
                    <div className="stat-label">Total Records</div>
                </div>
            </div>

            {/* Filter Bar */}
            <FilterBar showClearAll onClearAll={resetFilters} activeFilterCount={activeFilterCount}>
                <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search title, notes, category..."
                />
                <TypeFilter
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={TYPE_OPTIONS}
                    type="tabs"
                />
                <CurrencyFilter
                    value={currencyFilter}
                    onChange={setCurrencyFilter}
                    currencies={['All', 'SAR', 'AED', 'INR']}
                />
                <DateRangeFilter
                    value={dateRange}
                    onChange={setDateRange}
                />
            </FilterBar>

            {/* Action Buttons */}
            <div className="flex items-center justify-between mb-6" style={{ gap: 12, flexWrap: 'wrap', marginTop: -12 }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500 }}>
                    {filteredExpenses.length} record{filteredExpenses.length !== 1 ? 's' : ''}
                </div>
                <div className="flex gap-3 items-center flex-wrap">
                    <button className="btn btn-outline btn-sm" onClick={exportToExcel} title="Export to Excel">
                        <Download size={15} /> Excel
                    </button>
                    <div className="flex gap-2">
                        <button className="btn btn-accent" onClick={() => { setForm({ ...EMPTY, type: 'income', category: INCOME_CATEGORIES[0] }); setModal(true); }}>
                            <Plus size={16} /> Add Income
                        </button>
                        <button id="new-expense-btn" className="btn btn-danger" onClick={() => { setForm({ ...EMPTY, type: 'expense', category: EXPENSE_CATEGORIES[0] }); setModal(true); }}>
                            <Plus size={16} /> Add Expense
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="loading-screen" style={{ minHeight: '40vh' }}>
                    <div className="spinner" /><p>Loading…</p>
                </div>
            ) : filteredExpenses.length === 0 ? (
                <div className="empty-state card">
                    <TrendingDown size={40} />
                    <p>{expenses.length === 0 ? 'No records yet. Add your first income or expense.' : 'No records found for selected filters.'}</p>
                </div>
            ) : (
                <div className="card">
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Title</th>
                                    <th>Category</th>
                                    <th>Entity</th>
                                    <th>Amount</th>
                                    <th>Currency</th>
                                    <th>Date</th>
                                    <th>Notes</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredExpenses.map((exp, i) => (
                                    <tr key={exp.$id}>
                                        <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                        <td style={{ fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {exp.type === 'income' ? <TrendingUp size={14} style={{ color: 'var(--brand-accent)' }} /> : <TrendingDown size={14} style={{ color: 'var(--status-failed)' }} />}
                                                {exp.title}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="pill">{exp.category}</span>
                                        </td>
                                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                            {exp.distributor_name || '—'}
                                        </td>
                                        <td>
                                            <span className="currency" style={{ color: exp.type === 'income' ? 'var(--brand-accent)' : 'var(--status-failed)' }}>
                                                {Number(exp.amount || 0).toLocaleString('en-IN')}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{exp.currency}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                            {exp.date || (exp.$createdAt ? format(new Date(exp.$createdAt), 'dd MMM yyyy') : '—')}
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{exp.notes || '—'}</td>
                                        <td>
                                            <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(exp.$id)}>
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">Add {form.type === 'income' ? 'Income' : 'Expense'}</h3>
                            <button className="close-btn" onClick={() => setModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Type</label>
                                    <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value, category: e.target.value === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0] })}>
                                        <option value="expense">Expense</option>
                                        <option value="income">Income</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Title *</label>
                                    <input id="exp-title" className="form-input" placeholder="Description..."
                                        value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Category</label>
                                        <select id="exp-category" className="form-select"
                                            value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                                            {(form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Currency</label>
                                        <select id="exp-currency" className="form-select"
                                            value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value, distributor_id: '', distributor_name: '' })}>
                                            <option>AED</option>
                                            <option>SAR</option>
                                            <option>INR</option>
                                        </select>
                                    </div>
                                </div>


                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Amount *</label>
                                        <input id="exp-amount" className="form-input" type="number" step="0.01" min="0"
                                            placeholder="0.00" value={form.amount}
                                            onChange={e => setForm({ ...form, amount: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Date</label>
                                        <input id="exp-date" className="form-input" type="date"
                                            value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notes</label>
                                    <textarea id="exp-notes" className="form-textarea" placeholder="Additional notes…"
                                        value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
                                <button id="save-exp-btn" type="submit" className={`btn ${form.type === 'income' ? 'btn-accent' : 'btn-danger'}`} disabled={saving}>
                                    {saving ? 'Saving…' : 'Save Record'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
