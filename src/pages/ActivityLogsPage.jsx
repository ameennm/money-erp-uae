import { useState, useEffect } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Download, Search, Clock } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

export default function ActivityLogsPage() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [t, ex, ac, cr] = await Promise.all([
                dbService.listTransactions(),
                dbService.listExpenses(),
                dbService.listAedConversions(),
                dbService.listCredits()
            ]);

            const allLogs = [];

            // 1. Transactions
            t.documents.forEach(tx => {
                allLogs.push({
                    id: tx.$id,
                    date: tx.$createdAt,
                    type: 'Transaction',
                    title: `Transaction #${tx.tx_id} — ${tx.client_name}`,
                    description: `Status: ${tx.status} | Agent: ${tx.collection_agent_name || '—'}`,
                    amount: `${Number(tx.collected_amount || 0).toLocaleString('en-IN')} ${tx.collected_currency}`,
                    tagColor: 'var(--status-completed)',
                });
            });

            // 2. Expenses / Incomes / Deposits
            ex.documents.forEach(e => {
                const isInc = e.type === 'income';
                allLogs.push({
                    id: e.$id,
                    date: e.$createdAt,
                    type: isInc ? 'Income' : 'Expense',
                    title: e.title || e.category,
                    description: `${e.notes || ''} ${e.distributor_name ? `| Distributor: ${e.distributor_name}` : ''}`,
                    amount: `${isInc ? '+' : '-'}${Number(e.amount || 0).toLocaleString('en-IN')} ${e.currency}`,
                    tagColor: isInc ? 'var(--brand-accent)' : 'var(--status-failed)',
                });
            });

            // 3. Conversions
            ac.documents.forEach(c => {
                allLogs.push({
                    id: c.$id,
                    date: c.$createdAt || c.date,
                    type: 'Conversion',
                    title: `SAR → AED Conversion`,
                    description: `Agent: ${c.conversion_agent_name} | Rate: ${c.sar_rate || '—'}`,
                    amount: `${Number(c.sar_amount || 0).toLocaleString()} SAR → ${Number(c.aed_amount || 0).toLocaleString()} AED`,
                    tagColor: 'var(--brand-gold)',
                });
            });

            // 4. Credits
            cr.documents.forEach(c => {
                allLogs.push({
                    id: c.$id,
                    date: c.$createdAt,
                    type: 'Credit',
                    title: `Customer Credit - ${c.from_person}`,
                    description: c.reason || '',
                    amount: `${Number(c.amount_sar || 0).toLocaleString()} SAR`,
                    tagColor: '#a78bfa',
                });
            });

            allLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
            setLogs(allLogs);
        } catch (e) {
            toast.error('Failed to load logs: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, []);

    const filtered = logs.filter(L =>
        L.title.toLowerCase().includes(search.toLowerCase()) ||
        (L.description && L.description.toLowerCase().includes(search.toLowerCase())) ||
        L.type.toLowerCase().includes(search.toLowerCase())
    );

    const exportToExcel = () => {
        const rows = filtered.map((r, i) => ({
            '#': i + 1,
            'Date': format(new Date(r.date), 'dd MMM yyyy HH:mm'),
            'Type': r.type,
            'Title': r.title,
            'Amount': r.amount,
            'Description': r.description || ''
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Activity Logs');
        XLSX.writeFile(wb, `activity_logs_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    return (
        <Layout title="Activity Logs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="form-input" style={{ paddingLeft: 38, width: '100%' }} placeholder="Search logs..."
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <button className="btn btn-outline" onClick={exportToExcel}><Download size={16} /> Export Excel</button>
            </div>

            {loading ? (
                <div className="loading-screen" style={{ minHeight: '60vh' }}>
                    <div className="spinner" /><p>Loading activity logs…</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="empty-state card">
                    <Clock size={40} />
                    <p>No activity logs found.</p>
                </div>
            ) : (
                <div className="card">
                    <div className="table-wrapper">
                        <table className="data-table" style={{ fontSize: 13 }}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Title</th>
                                    <th>Amount</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((log, i) => (
                                    <tr key={`${log.id}-${i}`}>
                                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                            {format(new Date(log.date), 'dd MMM yy HH:mm')}
                                        </td>
                                        <td>
                                            <span style={{
                                                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                                background: `${log.tagColor}15`, color: log.tagColor, border: `1px solid ${log.tagColor}40`
                                            }}>
                                                {log.type}
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{log.title}</td>
                                        <td style={{ fontWeight: 700 }}>{log.amount}</td>
                                        <td style={{ color: 'var(--text-muted)' }}>{log.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </Layout>
    );
}
