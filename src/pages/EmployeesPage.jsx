import { useState, useEffect } from 'react';
import { dbService, authService } from '../lib/appwrite';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Plus, X, Trash2, UserCog, Eye, EyeOff, Copy, CheckCircle, Shield } from 'lucide-react';
import { format } from 'date-fns';

const EMPTY = { name: '', email: '', password: '', role: 'employee', notes: '' };

export default function EmployeesPage() {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [showPw, setShowPw] = useState(false);
    const [copiedRow, setCopiedRow] = useState(null);

    const fetch = async () => {
        setLoading(true);
        try {
            const r = await dbService.listEmployees();
            setEmployees(r.documents);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetch(); }, []);

    const generatePassword = () => {
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
        const pw = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        setForm(f => ({ ...f, password: pw }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (form.password.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
        setSaving(true);
        try {
            // Create Appwrite account
            await authService.createEmployee(form.email, form.password, form.name);
            // Store employee record in DB
            await dbService.createEmployee({
                name: form.name,
                email: form.email,
                role: form.role,
                notes: form.notes,
            });
            toast.success(`Employee "${form.name}" created. Share the credentials securely.`);
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
        if (!window.confirm('Remove this employee record?')) return;
        try {
            await dbService.deleteEmployee(id);
            toast.success('Employee record removed');
            fetch();
        } catch (e) {
            toast.error(e.message);
        }
    };

    const copyCredentials = (emp) => {
        const text = `MoneyFlow ERP Credentials\nName: ${emp.name}\nEmail: ${emp.email}\nRole: ${emp.role}\nURL: ${window.location.origin}`;
        navigator.clipboard.writeText(text);
        setCopiedRow(emp.$id);
        toast.success('Credentials copied to clipboard');
        setTimeout(() => setCopiedRow(null), 2000);
    };

    const roleBadge = (r) => {
        if (r === 'collector') return <span className="badge badge-collector">Collector</span>;
        if (r === 'superadmin') return <span className="badge badge-superadmin">Super Admin</span>;
        return <span className="badge badge-employee">Employee</span>;
    };

    return (
        <Layout title="Employees">
            <div className="flex items-center justify-between mb-6">
                <h3 style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    {employees.length} employee{employees.length !== 1 ? 's' : ''}
                </h3>
                <button id="new-emp-btn" className="btn btn-accent" onClick={() => { setForm(EMPTY); setModal(true); }}>
                    <Plus size={16} /> Add Employee
                </button>
            </div>

            {/* Secure credentials notice */}
            <div className="card mb-6" style={{
                background: 'rgba(0,200,150,0.06)',
                border: '1px solid rgba(0,200,150,0.2)',
                marginBottom: '20px'
            }}>
                <div className="flex items-center gap-3">
                    <Shield size={20} style={{ color: 'var(--brand-accent)', flexShrink: 0 }} />
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Secure Credential Sharing
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            When you create a new employee, their credentials are auto-generated. Use the copy button to share securely via encrypted channels (Signal, WhatsApp, etc.). Passwords are not stored in plain text.
                        </div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="loading-screen" style={{ minHeight: '40vh' }}>
                    <div className="spinner" /><p>Loading…</p>
                </div>
            ) : employees.length === 0 ? (
                <div className="empty-state card">
                    <UserCog size={40} />
                    <p>No employees yet.</p>
                </div>
            ) : (
                <div className="card">
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Added</th>
                                    <th>Notes</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map((emp, i) => (
                                    <tr key={emp.$id}>
                                        <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                        <td style={{ fontWeight: 600 }}>
                                            <div className="flex items-center gap-2">
                                                <div style={{
                                                    width: 32, height: 32, borderRadius: '50%',
                                                    background: 'linear-gradient(135deg, #4a9eff, var(--brand-accent))',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0
                                                }}>
                                                    {emp.name?.[0]?.toUpperCase()}
                                                </div>
                                                {emp.name}
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{emp.email}</td>
                                        <td>{roleBadge(emp.role)}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                            {emp.$createdAt ? format(new Date(emp.$createdAt), 'dd MMM yyyy') : '—'}
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{emp.notes || '—'}</td>
                                        <td>
                                            <div className="flex gap-2">
                                                <button
                                                    className="btn btn-outline btn-sm btn-icon"
                                                    title="Copy credentials"
                                                    onClick={() => copyCredentials(emp)}
                                                >
                                                    {copiedRow === emp.$id ? <CheckCircle size={14} style={{ color: 'var(--brand-accent)' }} /> : <Copy size={14} />}
                                                </button>
                                                <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(emp.$id)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
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
                            <h3 className="modal-title">Add New Employee</h3>
                            <button className="close-btn" onClick={() => setModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Full Name *</label>
                                    <input id="emp-name" className="form-input" placeholder="John Doe"
                                        value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email Address *</label>
                                    <input id="emp-email" className="form-input" type="email" placeholder="employee@moneytransfer.com"
                                        value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Password *</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            id="emp-password"
                                            className="form-input"
                                            type={showPw ? 'text' : 'password'}
                                            placeholder="Min 8 characters"
                                            value={form.password}
                                            onChange={e => setForm({ ...form, password: e.target.value })}
                                            style={{ paddingRight: '80px' }}
                                            required
                                        />
                                        <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '4px' }}>
                                            <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                                                onClick={() => setShowPw(!showPw)}>
                                                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                                            </button>
                                        </div>
                                    </div>
                                    <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: '8px' }} onClick={generatePassword}>
                                        Generate Strong Password
                                    </button>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Role *</label>
                                    <select id="emp-role" className="form-select"
                                        value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                                        <option value="employee">Employee (AED → INR)</option>
                                        <option value="collector">Collector (SAR logging)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notes</label>
                                    <textarea id="emp-notes" className="form-textarea" placeholder="Department, shift, etc."
                                        value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
                                <button id="save-emp-btn" type="submit" className="btn btn-accent" disabled={saving}>
                                    {saving ? 'Creating…' : 'Create Employee'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
