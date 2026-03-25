import { useState, useEffect } from 'react';
import { dbService, Query } from '../lib/appwrite';
import { X, Calendar, Download, Trash2, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

const DATE_RANGES = ['Today', 'This Week', 'This Month', 'All Time', 'Custom'];

export default function LedgerModal({ agent, onClose, onEditRecord, onDeleteRecord }) {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState('All Time');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    const fetchEntries = async () => {
        setLoading(true);
        try {
            const res = await dbService.listLedgerEntries([
                Query.equal('agent_id', agent.$id),
                Query.orderDesc('createdAt')
            ]);
            setEntries(res.documents);
        } catch (e) {
            toast.error('Failed to load ledger: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (agent) fetchEntries();
    }, [agent]);

    const exportToExcel = () => {
        const rows = entries.map((e, i) => ({
            '#': i + 1,
            'Date': format(new Date(e.createdAt), 'dd MMM yyyy HH:mm'),
            'Type': e.type,
            'Reference': e.reference_type,
            'Description': e.description,
            'Amount': e.amount,
            'Currency': e.currency,
            'Balance': e.running_balance
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
        XLSX.writeFile(wb, `Ledger_${agent.name}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    if (!agent) return null;

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: '1000px', width: '95%', maxHeight: '90vh' }}>
                <div className="modal-header">
                    <div>
                        <h3 className="modal-title">Ledger: {agent.name}</h3>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Transaction history and running balance
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="btn btn-outline btn-sm" onClick={exportToExcel} title="Export to Excel">
                            <Download size={14} /> Excel
                        </button>
                        <button className="close-btn" onClick={onClose}><X size={20} /></button>
                    </div>
                </div>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
                    <div className="table-wrapper" style={{ flex: 1 }}>
                        <table className="data-table" style={{ fontSize: 13 }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>#</th>
                                    <th>Date</th>
                                    <th>Reference</th>
                                    <th style={{ textAlign: 'center' }}>Type</th>
                                    <th style={{ textAlign: 'right' }}>Credit</th>
                                    <th style={{ textAlign: 'right' }}>Debit</th>
                                    <th style={{ textAlign: 'right' }}>Running Bal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}><div className="spinner" /></td></tr>
                                ) : entries.length === 0 ? (
                                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>No records found.</td></tr>
                                ) : (
                                    entries.map((e, idx) => (
                                        <tr key={e.$id}>
                                            <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                                            <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                                                <div className="flex items-center gap-1"><Calendar size={12} /> {format(new Date(e.createdAt), 'dd MMM yy HH:mm')}</div>
                                            </td>
                                            <td>
                                                <span style={{ color: 'var(--brand-accent)', fontSize: 11, marginRight: 6 }}>{e.reference_type?.toUpperCase()}</span>
                                                <br />{e.description}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span className={`badge badge-${e.type === 'credit' ? 'completed' : 'pending'}`} style={{ fontSize: 10 }}>
                                                    {e.type}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: e.type === 'credit' ? 800 : 500, color: e.type === 'credit' ? 'var(--brand-accent)' : 'inherit' }}>
                                                {e.type === 'credit' ? `+${e.currency} ${e.amount.toLocaleString()}` : '—'}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: e.type === 'debit' ? 800 : 500, color: e.type === 'debit' ? 'var(--status-failed)' : 'inherit' }}>
                                                {e.type === 'debit' ? `-${e.currency} ${e.amount.toLocaleString()}` : '—'}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 800, color: e.running_balance >= 0 ? 'inherit' : 'var(--status-failed)' }}>
                                                {e.currency} {e.running_balance.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
