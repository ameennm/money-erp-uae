import { useState, useEffect } from 'react';
import { dbService } from '../lib/appwrite';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Download, Clock } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { SearchInput, DateRangeFilter, FilterBar } from '../components/filters';
import { applyDateRange } from '../utils/filterHelpers';

export default function ActivityLogsPage() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState({ range: 'All Time', customFrom: '', customTo: '' });

    const fetchAll = async () => {
        setLoading(true);
        try {
            const res = await dbService.listActivityLogs();
            setLogs(res.documents);
        } catch (e) {
            toast.error('Failed to load logs: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, []);

    const filtered = applyDateRange(logs, dateRange.range, dateRange.customFrom, dateRange.customTo)
        .filter(log => {
            const term = search.toLowerCase();
            return !term ||
                log.actor_name?.toLowerCase().includes(term) ||
                log.actor_email?.toLowerCase().includes(term) ||
                log.actor_role?.toLowerCase().includes(term) ||
                log.action?.toLowerCase().includes(term) ||
                log.entity_type?.toLowerCase().includes(term) ||
                log.entity_label?.toLowerCase().includes(term);
        });

    const exportToExcel = () => {
        const rows = filtered.map((r, i) => ({
            '#': i + 1,
            'Date': r.$createdAt ? format(new Date(r.$createdAt), 'dd MMM yyyy HH:mm') : '',
            'Actor': r.actor_name || '',
            'Email': r.actor_email || '',
            'Role': r.actor_role || '',
            'Action': r.action || '',
            'Entity': r.entity_type || '',
            'Record': r.entity_label || '',
            'Record ID': r.entity_id || '',
            'Details': r.details || ''
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Activity Logs');
        XLSX.writeFile(wb, `activity_logs_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    return (
        <Layout title="Activity Logs">
            <FilterBar>
                <DateRangeFilter
                    value={dateRange}
                    onChange={setDateRange}
                />
                <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search actor, action, table..."
                    style={{ maxWidth: 400 }}
                />
                <button className="btn btn-outline" onClick={exportToExcel}><Download size={16} /> Export Excel</button>
            </FilterBar>

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
                                    <th>Actor</th>
                                    <th>Action</th>
                                    <th>Entity</th>
                                    <th>Record</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((log, i) => (
                                    <tr key={`${log.id}-${i}`}>
                                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                            {log.$createdAt ? format(new Date(log.$createdAt), 'dd MMM yy HH:mm') : '—'}
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 700 }}>{log.actor_name || 'System'}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.actor_email || log.actor_role || '—'}</div>
                                        </td>
                                        <td>
                                            <span style={{
                                                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                                background: 'rgba(74,158,255,0.15)', color: '#4a9eff', border: '1px solid rgba(74,158,255,0.35)'
                                            }}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{log.entity_type}</td>
                                        <td style={{ fontWeight: 600 }}>{log.entity_label || log.entity_id}</td>
                                        <td style={{ color: 'var(--text-muted)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {log.details || '—'}
                                        </td>
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
