import { useEffect, useState } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import {
    ArrowLeftRight, Users, UserCog,
    TrendingUp, TrendingDown, Clock,
    CheckCircle, AlertCircle, SendHorizonal, Banknote
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const sum = (arr, field) => arr.reduce((acc, d) => acc + (Number(d[field]) || 0), 0);

const STATUSES = {
    pending: { label: 'Pending', badge: 'badge-pending' },
    sar_sent: { label: 'SAR Sent to Agent', badge: 'badge-inprogress' },
    aed_received: { label: 'AED Received', badge: 'badge-collector' },
    completed: { label: 'Completed (INR)', badge: 'badge-completed' },
    failed: { label: 'Failed', badge: 'badge-failed' },
};

const statusBadge = (s) => {
    const cfg = STATUSES[s] || STATUSES.pending;
    return <span className={`badge ${cfg.badge}`}>{cfg.label}</span>;
};

export default function DashboardPage() {
    const { role } = useAuth();
    const isSuperAdmin = role === 'superadmin';
    const isCollector = role === 'collector';

    const [txs, setTxs] = useState([]);
    const [agents, setAgents] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const results = await Promise.all([
                dbService.listTransactions(),
                isSuperAdmin ? dbService.listAgents() : Promise.resolve({ documents: [] }),
                isSuperAdmin ? dbService.listEmployees() : Promise.resolve({ documents: [] }),
                isSuperAdmin ? dbService.listExpenses() : Promise.resolve({ documents: [] }),
            ]);
            setTxs(results[0].documents);
            setAgents(results[1].documents);
            setEmployees(results[2].documents);
            setExpenses(results[3].documents);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchAll(); }, []);

    // ── Aggregates ─────────────────────────────────────────────────────────────
    const pending = txs.filter(t => t.status === 'pending');
    const sarSent = txs.filter(t => t.status === 'sar_sent');
    const aedReceived = txs.filter(t => t.status === 'aed_received');
    const completed = txs.filter(t => t.status === 'completed');

    const totalSAR = sum(txs, 'amount_sar');
    const totalGivenSAR = sum(txs, 'amount_given_sar');
    const totalAED = sum(txs, 'amount_aed');
    const totalINR = sum(txs, 'amount_inr');
    const totalExp = sum(expenses, 'amount');

    const pendingSARSum = sum(pending, 'amount_given_sar');
    const sarSentSARSum = sum(sarSent, 'amount_given_sar');

    // ── Batch status update ────────────────────────────────────────────────────
    const batchUpdate = async (arr, toStatus, label) => {
        if (arr.length === 0) { toast.error('No transactions to update.'); return; }
        if (!window.confirm(`Mark all ${arr.length} transactions as "${label}"?`)) return;
        try {
            await Promise.all(arr.map(t => dbService.updateTransaction(t.$id, { status: toStatus })));
            toast.success(`${arr.length} transactions → ${label}`);
            fetchAll();
        } catch (e) { toast.error(e.message); }
    };

    const recentTxs = txs.slice(0, 8);

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

            {/* ── Collector Day-Close Panel ─────────────────────────────────────── */}
            {(isCollector || isSuperAdmin) && (
                <div style={{ marginBottom: '28px' }}>
                    <div style={{
                        fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '1.2px', color: 'var(--text-muted)', marginBottom: '12px'
                    }}>
                        Day Close Actions
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: '16px' }}>
                        {/* Step 1 */}
                        <div className="card" style={{ border: '1px solid rgba(245,166,35,0.25)', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: '10px', background: 'rgba(245,166,35,0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'var(--status-pending)', flexShrink: 0
                                }}>
                                    <SendHorizonal size={20} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>Step 1 — Pending to Send</div>
                                    <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                                        {pendingSARSum.toLocaleString()}
                                        <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>SAR</span>
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 12px' }}>
                                        {pending.length} pending transaction{pending.length !== 1 ? 's' : ''}
                                    </div>
                                    <button
                                        id="dash-btn-sar-sent"
                                        className="btn btn-sm"
                                        style={{ background: 'rgba(245,166,35,0.15)', color: 'var(--status-pending)', border: '1px solid rgba(245,166,35,0.3)' }}
                                        onClick={() => batchUpdate(pending, 'sar_sent', 'SAR Sent to Agent')}
                                        disabled={pending.length === 0}
                                    >
                                        Mark SAR Sent to Agent
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="card" style={{ border: '1px solid rgba(74,158,255,0.25)', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: '10px', background: 'rgba(74,158,255,0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'var(--status-inprogress)', flexShrink: 0
                                }}>
                                    <Banknote size={20} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>Step 2 — Confirm SAR→AED Done</div>
                                    <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                                        {sarSentSARSum.toLocaleString()}
                                        <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>SAR</span>
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 12px' }}>
                                        {sarSent.length} sent, awaiting AED confirmation
                                    </div>
                                    <button
                                        id="dash-btn-aed-received"
                                        className="btn btn-sm"
                                        style={{ background: 'rgba(74,158,255,0.15)', color: 'var(--status-inprogress)', border: '1px solid rgba(74,158,255,0.3)' }}
                                        onClick={() => batchUpdate(sarSent, 'aed_received', 'AED Received')}
                                        disabled={sarSent.length === 0}
                                    >
                                        Confirm AED Received
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
            <div style={{
                fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '1.2px', color: 'var(--text-muted)', marginBottom: '12px'
            }}>
                Overview
            </div>
            <div className="stats-grid">
                <div className="stat-card" style={{ '--accent-bar': 'var(--status-pending)' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(245,166,35,0.15)', '--icon-color': 'var(--status-pending)' }}>
                        <Clock size={20} />
                    </div>
                    <div className="stat-value">{pending.length}</div>
                    <div className="stat-label">Pending</div>
                </div>

                <div className="stat-card" style={{ '--accent-bar': 'var(--status-inprogress)' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(74,158,255,0.15)', '--icon-color': 'var(--status-inprogress)' }}>
                        <SendHorizonal size={20} />
                    </div>
                    <div className="stat-value">{sarSent.length}</div>
                    <div className="stat-label">SAR Sent to Agent</div>
                </div>

                <div className="stat-card" style={{ '--accent-bar': '#a78bfa' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(167,139,250,0.15)', '--icon-color': '#a78bfa' }}>
                        <Banknote size={20} />
                    </div>
                    <div className="stat-value">{aedReceived.length}</div>
                    <div className="stat-label">AED Received</div>
                </div>

                <div className="stat-card" style={{ '--accent-bar': 'var(--status-completed)' }}>
                    <div className="stat-icon">
                        <CheckCircle size={20} />
                    </div>
                    <div className="stat-value">{completed.length}</div>
                    <div className="stat-label">Completed</div>
                </div>

                <div className="stat-card" style={{ '--accent-bar': '#4a9eff' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(74,158,255,0.15)', '--icon-color': '#4a9eff' }}>
                        <TrendingUp size={20} />
                    </div>
                    <div className="stat-value">{totalSAR.toLocaleString()}</div>
                    <div className="stat-label">Total SAR Collected</div>
                </div>

                <div className="stat-card" style={{ '--accent-bar': 'var(--brand-gold)' }}>
                    <div className="stat-icon" style={{ '--icon-bg': 'rgba(245,166,35,0.15)', '--icon-color': 'var(--brand-gold)' }}>
                        <TrendingUp size={20} />
                    </div>
                    <div className="stat-value">{totalGivenSAR.toLocaleString()}</div>
                    <div className="stat-label">Total SAR Given to Agents</div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">
                        <TrendingUp size={20} />
                    </div>
                    <div className="stat-value">₹{totalINR.toLocaleString('en-IN')}</div>
                    <div className="stat-label">Total INR Disbursed</div>
                </div>

                {isSuperAdmin && (
                    <>
                        <div className="stat-card" style={{ '--accent-bar': 'var(--status-failed)' }}>
                            <div className="stat-icon" style={{ '--icon-bg': 'rgba(255,84,112,0.15)', '--icon-color': 'var(--status-failed)' }}>
                                <TrendingDown size={20} />
                            </div>
                            <div className="stat-value">₹{totalExp.toLocaleString('en-IN')}</div>
                            <div className="stat-label">Total Expenses</div>
                        </div>
                        <div className="stat-card" style={{ '--accent-bar': '#4a9eff' }}>
                            <div className="stat-icon" style={{ '--icon-bg': 'rgba(74,158,255,0.15)', '--icon-color': '#4a9eff' }}>
                                <Users size={20} />
                            </div>
                            <div className="stat-value">{agents.length}</div>
                            <div className="stat-label">Active Agents</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon">
                                <UserCog size={20} />
                            </div>
                            <div className="stat-value">{employees.length}</div>
                            <div className="stat-label">Employees</div>
                        </div>
                    </>
                )}
            </div>

            {/* ── Recent Transactions ───────────────────────────────────────────── */}
            <div className="card section-gap" style={{ marginTop: '28px' }}>
                <div className="card-header">
                    <div>
                        <div className="card-title">Recent Transactions</div>
                        <div className="card-subtitle">Last {recentTxs.length} entries</div>
                    </div>
                </div>
                {recentTxs.length === 0 ? (
                    <div className="empty-state">
                        <AlertCircle size={40} />
                        <p>No transactions yet.</p>
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>TX ID</th>
                                    <th>Client</th>
                                    <th>Agent</th>
                                    <th>SAR</th>
                                    <th>Given (SAR)</th>
                                    <th>AED</th>
                                    <th>INR</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentTxs.map(tx => (
                                    <tr key={tx.$id}>
                                        <td><span className="tx-id">{tx.tx_id || tx.$id.slice(0, 8)}</span></td>
                                        <td style={{ fontWeight: 600 }}>{tx.client_name}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{tx.agent_name || '—'}</td>
                                        <td><span className="currency sar">{Number(tx.amount_sar || 0).toLocaleString()}</span></td>
                                        <td><span className="currency sar">{Number(tx.amount_given_sar || 0).toLocaleString()}</span></td>
                                        <td><span className="currency aed">{Number(tx.amount_aed || 0).toLocaleString()}</span></td>
                                        <td><span className="currency inr">₹{Number(tx.amount_inr || 0).toLocaleString('en-IN')}</span></td>
                                        <td>{statusBadge(tx.status)}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                            {tx.$createdAt ? format(new Date(tx.$createdAt), 'dd MMM yy') : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Layout>
    );
}
