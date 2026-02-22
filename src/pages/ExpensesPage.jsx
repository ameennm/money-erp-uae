import { useState, useEffect } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Plus, X, Trash2, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';

const CATEGORIES = [
    'Office Rent', 'Salaries', 'Commission', 'Transfer Fees',
    'Bank Charges', 'Utilities', 'Marketing', 'Miscellaneous'
];

const EMPTY = { title: '', category: CATEGORIES[0], amount: '', currency: 'INR', date: '', notes: '' };

export default function ExpensesPage() {
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);

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

    const total = expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    const handleSave = async (ev) => {
        ev.preventDefault();
        setSaving(true);
        try {
            await dbService.createExpense({
                ...form,
                amount: parseFloat(form.amount) || 0,
            });
            toast.success('Expense recorded');
            setModal(false);
            setForm(EMPTY);
            fetch();
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
            fetch();
        } catch (e) {
            toast.error(e.message);
        }
    };

    return (
        <Layout title="Expenses">
            {/* Summary */}
            <div className="stats-grid mb-6">
                <div className="stat-card" style={{ '--accent-bar': 'var(--status-failed)' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(255,84,112,0.15)', '--icon-color': 'var(--status-failed)' }}>
                        <TrendingDown size={20} />
                    </div>
                    <div className="stat-value">₹{total.toLocaleString('en-IN')}</div>
                    <div className="stat-label">Total Expenses (INR)</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">
                        <TrendingDown size={20} />
                    </div>
                    <div className="stat-value">{expenses.length}</div>
                    <div className="stat-label">Expense Records</div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6">
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    {expenses.length} record{expenses.length !== 1 ? 's' : ''}
                </div>
                <button id="new-expense-btn" className="btn btn-danger" onClick={() => { setForm(EMPTY); setModal(true); }}>
                    <Plus size={16} /> Add Expense
                </button>
            </div>

            {loading ? (
                <div className="loading-screen" style={{ minHeight: '40vh' }}>
                    <div className="spinner" /><p>Loading…</p>
                </div>
            ) : expenses.length === 0 ? (
                <div className="empty-state card">
                    <TrendingDown size={40} />
                    <p>No expenses recorded.</p>
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
                                    <th>Amount</th>
                                    <th>Currency</th>
                                    <th>Date</th>
                                    <th>Notes</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenses.map((exp, i) => (
                                    <tr key={exp.$id}>
                                        <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                        <td style={{ fontWeight: 600 }}>{exp.title}</td>
                                        <td>
                                            <span className="pill">{exp.category}</span>
                                        </td>
                                        <td>
                                            <span className="currency" style={{ color: 'var(--status-failed)' }}>
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
                            <h3 className="modal-title">Add Expense</h3>
                            <button className="close-btn" onClick={() => setModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Title *</label>
                                    <input id="exp-title" className="form-input" placeholder="e.g. Office Rent – Feb"
                                        value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Category</label>
                                        <select id="exp-category" className="form-select"
                                            value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                                            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Currency</label>
                                        <select id="exp-currency" className="form-select"
                                            value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                                            <option>INR</option>
                                            <option>AED</option>
                                            <option>SAR</option>
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
                                <button id="save-exp-btn" type="submit" className="btn btn-danger" disabled={saving}>
                                    {saving ? 'Saving…' : 'Add Expense'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
