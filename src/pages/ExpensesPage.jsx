import { useState, useEffect } from 'react';
import { dbService, Query } from '../lib/appwrite';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Plus, X, Trash2, TrendingDown, TrendingUp, Download } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

const EXPENSE_CATEGORIES = [
    'Office Rent', 'Salaries', 'Commission', 'Transfer Fees',
    'Bank Charges', 'Utilities', 'Marketing', 'Miscellaneous'
];
const INCOME_CATEGORIES = ['Service Fee', 'Markup', 'Capital Injection', 'Agent Payment', 'Other Income'];

const EMPTY = { title: '', type: 'expense', category: EXPENSE_CATEGORIES[0], amount: '', currency: 'AED', date: '', notes: '', distributor_id: '', distributor_name: '' };

export default function ExpensesPage() {
    const [expenses, setExpenses] = useState([]);
    const [distributors, setDistributors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [currencyFilter, setCurrencyFilter] = useState('All');

    const fetch = async () => {
        setLoading(true);
        try {
            const [r, dr] = await Promise.all([
                dbService.listExpenses(),
                dbService.listAgents([Query.equal('type', 'distributor')]),
            ]);
            setExpenses(r.documents);
            setDistributors(dr.documents);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetch(); }, []);

    const filteredExpenses = expenses.filter(e => currencyFilter === 'All' || e.currency === currencyFilter);

    const expenseSAR = filteredExpenses.filter(e => e.type !== 'income' && e.currency === 'SAR').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const expenseAED = filteredExpenses.filter(e => e.type !== 'income' && e.currency === 'AED').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const expenseINR = filteredExpenses.filter(e => e.type !== 'income' && e.currency === 'INR').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const incomeSAR = filteredExpenses.filter(e => e.type === 'income' && e.currency === 'SAR').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const incomeAED = filteredExpenses.filter(e => e.type === 'income' && e.currency === 'AED').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const incomeINR = filteredExpenses.filter(e => e.type === 'income' && e.currency === 'INR').reduce((a, e) => a + (Number(e.amount) || 0), 0);

    const handleSave = async (ev) => {
        ev.preventDefault();
        setSaving(true);
        try {
            const payload = {
                ...form,
                amount: parseFloat(form.amount) || 0,
            };
            // If category is Commission and a distributor is selected, set name
            if (form.category === 'Commission' && form.distributor_id) {
                const dist = distributors.find(d => d.$id === form.distributor_id);
                payload.distributor_name = dist ? dist.name : '';
            } else {
                payload.distributor_id = '';
                payload.distributor_name = '';
            }
            const created = await dbService.createExpense(payload);
            toast.success('Record saved');
            setModal(false);
            setForm(EMPTY);
            // Optimistic: prepend new record to state
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
            await dbService.deleteExpense(id);
            toast.success('Deleted');
            // Optimistic: remove from state
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
            'Distributor': e.distributor_name || '',
            'Date': e.date || (e.$createdAt ? format(new Date(e.$createdAt), 'dd MMM yyyy') : ''),
            'Notes': e.notes || '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Income & Ops');
        XLSX.writeFile(wb, `income_ops_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    return (
        <Layout title="Income &amp; Ops">
            {/* Summary */}
            <div className="stats-grid mb-6">
                {/* Income by currency */}
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

                {/* Expenses by currency */}
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

                {/* Record count */}
                <div className="stat-card" style={{ '--accent-bar': '#4a9eff' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(74,158,255,0.15)', '--icon-color': '#4a9eff' }}>
                        <TrendingUp size={20} />
                    </div>
                    <div style={{ fontSize: 'clamp(24px,3vw,36px)', fontWeight: 800 }}>{filteredExpenses.length}</div>
                    <div className="stat-label">Total Records</div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6" style={{ gap: 12, flexWrap: 'wrap' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500 }}>
                    {filteredExpenses.length} record{filteredExpenses.length !== 1 ? 's' : ''}
                </div>
                <div className="flex gap-3 items-center flex-wrap">
                    <select className="form-select" style={{ maxWidth: 140, fontSize: 13, padding: '6px 10px', height: '36px' }}
                        value={currencyFilter} onChange={e => setCurrencyFilter(e.target.value)}>
                        <option value="All">All Currencies</option>
                        <option value="SAR">SAR</option>
                        <option value="AED">AED</option>
                        <option value="INR">INR</option>
                    </select>
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
                    <p>No expenses found for selected filters.</p>
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
                                    <th>Distributor</th>
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

            {/* Modal */}
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
                                            value={form.category} onChange={e => setForm({ ...form, category: e.target.value, distributor_id: '', distributor_name: '' })}>
                                            {(form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Currency</label>
                                        <select id="exp-currency" className="form-select"
                                            value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                                            <option>AED</option>
                                            <option>SAR</option>
                                            <option>INR</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Distributor dropdown — only for Commission category */}
                                {form.category === 'Commission' && form.type === 'expense' && (
                                    <div className="form-group">
                                        <label className="form-label">Distributor (Commission for)</label>
                                        <select
                                            className="form-select"
                                            value={form.distributor_id}
                                            onChange={e => setForm({ ...form, distributor_id: e.target.value })}
                                        >
                                            <option value="">— Select Distributor —</option>
                                            {distributors.map(d => (
                                                <option key={d.$id} value={d.$id}>{d.name}</option>
                                            ))}
                                        </select>
                                        {form.distributor_id && (
                                            <div style={{ fontSize: 12, color: 'var(--brand-accent)', marginTop: 4 }}>
                                                ✓ This commission will appear in {distributors.find(d => d.$id === form.distributor_id)?.name}'s ledger
                                            </div>
                                        )}
                                    </div>
                                )}

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
