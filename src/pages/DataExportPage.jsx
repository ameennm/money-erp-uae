import { useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import { dbService } from '../lib/appwrite';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { CheckCircle, Database, Download, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';

const TABLES = [
    {
        key: 'agents',
        sheet: 'Agents',
        label: 'Agents',
        list: () => dbService.listAgents(),
        create: row => dbService.createAgent(row),
        update: (id, row) => dbService.updateAgent(id, row),
        columns: ['id', 'createdAt', 'updatedAt', 'name', 'phone', 'location', 'type', 'currency', 'notes', 'inr_balance', 'sar_balance', 'aed_balance'],
        alwaysInclude: true,
    },
    {
        key: 'transactions',
        sheet: 'Transactions',
        label: 'Transactions',
        list: () => dbService.listTransactions(),
        create: row => dbService.createTransaction(row),
        update: (id, row) => dbService.updateTransaction(id, row),
        columns: ['id', 'createdAt', 'updatedAt', 'tx_id', 'creator_id', 'creator_name', 'status', 'client_name', 'inr_requested', 'collected_currency', 'collected_amount', 'collection_rate', 'sar_to_aed_rate', 'actual_aed', 'aed_to_inr_rate', 'actual_inr_distributed', 'profit_aed', 'profit_inr', 'notes', 'collection_agent_id', 'collection_agent_name', 'conversion_agent_id', 'conversion_agent_name', 'distributor_id', 'distributor_name', 'edit_pending_approval', 'is_petty_cash'],
    },
    {
        key: 'expenses',
        sheet: 'Income_Ops',
        label: 'Income & Ops',
        list: () => dbService.listExpenses(),
        create: row => dbService.createExpense(row),
        update: (id, row) => dbService.updateExpense(id, row),
        columns: ['id', 'createdAt', 'updatedAt', 'title', 'category', 'amount', 'currency', 'date', 'notes', 'type', 'distributor_id', 'distributor_name'],
        dateField: 'date',
    },
    {
        key: 'credits',
        sheet: 'Credits',
        label: 'Credits',
        list: () => dbService.listCredits(),
        create: row => dbService.createCredit(row),
        update: (id, row) => dbService.updateCredit(id, row),
        columns: ['id', 'createdAt', 'updatedAt', 'from_person', 'reason', 'amount_sar', 'date', 'admin_approved'],
        dateField: 'date',
    },
    {
        key: 'aed_conversions',
        sheet: 'Conversions',
        label: 'Conversions',
        list: () => dbService.listAedConversions(),
        create: row => dbService.createAedConversion(row),
        update: (id, row) => dbService.updateAedConversion(id, row),
        columns: ['id', 'createdAt', 'updatedAt', 'sar_amount', 'aed_amount', 'profit_inr', 'conversion_agent_id', 'conversion_agent_name', 'date', 'sar_rate', 'aed_rate', 'source_currency', 'target_currency'],
        dateField: 'date',
    },
    {
        key: 'ledger_entries',
        sheet: 'Ledger_Entries',
        label: 'Ledger Entries',
        list: () => dbService.listLedgerEntries(),
        create: row => dbService.createLedgerEntry(row),
        update: (id, row) => dbService.updateLedgerEntry(id, row),
        columns: ['id', 'createdAt', 'updatedAt', 'agent_id', 'agent_name', 'agent_type', 'amount', 'currency', 'type', 'reference_type', 'reference_id', 'description', 'running_balance'],
    },
    {
        key: 'activity_logs',
        sheet: 'Activity_Logs',
        label: 'Activity Logs',
        list: () => dbService.listActivityLogs(),
        create: row => dbService.createActivityLog(row),
        update: (id, row) => dbService.updateActivityLog(id, row),
        columns: ['id', 'createdAt', 'updatedAt', 'actor_id', 'actor_name', 'actor_email', 'actor_role', 'action', 'entity_type', 'entity_id', 'entity_label', 'details'],
    },
];

const SETTINGS_TABLE = {
    key: 'settings',
    sheet: 'Settings',
    label: 'Settings',
    columns: ['id', 'createdAt', 'updatedAt', 'min_sar_rate', 'min_aed_rate'],
};

const formatSheet = (ws, rows) => {
    const keys = rows[0] ? Object.keys(rows[0]) : [];
    ws['!cols'] = keys.map(key => ({
        wch: Math.min(42, Math.max(key.length, ...rows.map(row => String(row[key] ?? '').length)) + 2),
    }));
};

const rawDate = (record, config) => record[config.dateField] || record.createdAt || record.$createdAt;

const isSameMonth = (record, config, month) => {
    if (!month || config.alwaysInclude) return true;
    const d = rawDate(record, config);
    if (!d) return false;
    return format(new Date(d), 'yyyy-MM') === month;
};

const toRawRow = (record, columns) => {
    const source = { ...record, id: record.id || record.$id, createdAt: record.createdAt || record.$createdAt, updatedAt: record.updatedAt || record.$updatedAt };
    return columns.reduce((row, key) => {
        row[key] = source[key] ?? '';
        return row;
    }, {});
};

const cleanImportRow = (row, columns) => {
    return columns.reduce((out, key) => {
        if (row[key] !== undefined && row[key] !== '') out[key] = row[key];
        return out;
    }, {});
};

export default function DataExportPage() {
    const [periodMode, setPeriodMode] = useState('all');
    const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [loading, setLoading] = useState(false);
    const [importRows, setImportRows] = useState(null);
    const fileInputRef = useRef(null);

    const activeMonth = periodMode === 'month' ? month : '';

    const periodLabel = useMemo(() => {
        if (!activeMonth) return 'All Data';
        return format(new Date(`${activeMonth}-01T00:00:00`), 'MMMM yyyy');
    }, [activeMonth]);

    const loadAllData = async () => {
        const tableResults = await Promise.all(TABLES.map(async config => {
            const res = await config.list();
            return [config.key, res.documents || []];
        }));
        const settings = await dbService.getSettings();
        return {
            ...Object.fromEntries(tableResults),
            settings: [{ id: 'global_settings', ...settings }],
        };
    };

    const exportWorkbook = async () => {
        setLoading(true);
        try {
            const data = await loadAllData();
            const wb = XLSX.utils.book_new();
            const summaryRows = [
                { Field: 'Export Period', Value: periodLabel },
                { Field: 'Generated At', Value: format(new Date(), 'dd MMM yyyy HH:mm') },
                { Field: 'Mode', Value: activeMonth ? 'Monthly' : 'All Data' },
            ];

            TABLES.forEach(config => {
                const rows = (data[config.key] || []).filter(record => isSameMonth(record, config, activeMonth));
                summaryRows.push({ Field: config.label, Value: rows.length });
            });

            const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
            formatSheet(summarySheet, summaryRows);
            XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

            TABLES.forEach(config => {
                const rows = (data[config.key] || [])
                    .filter(record => isSameMonth(record, config, activeMonth))
                    .map(record => toRawRow(record, config.columns));
                const safeRows = rows.length ? rows : [config.columns.reduce((row, key) => ({ ...row, [key]: '' }), {})];
                const ws = XLSX.utils.json_to_sheet(safeRows);
                formatSheet(ws, safeRows);
                XLSX.utils.book_append_sheet(wb, ws, config.sheet);
            });

            const settingsRows = data.settings.map(record => toRawRow(record, SETTINGS_TABLE.columns));
            const settingsSheet = XLSX.utils.json_to_sheet(settingsRows);
            formatSheet(settingsSheet, settingsRows);
            XLSX.utils.book_append_sheet(wb, settingsSheet, SETTINGS_TABLE.sheet);

            const suffix = activeMonth || 'all_data';
            XLSX.writeFile(wb, `moneyflow_export_${suffix}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
            toast.success(`Downloaded ${periodLabel}`);
        } catch (e) {
            toast.error('Export failed: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const downloadTemplate = () => {
        const wb = XLSX.utils.book_new();
        [...TABLES, SETTINGS_TABLE].forEach(config => {
            const row = config.columns.reduce((out, key) => ({ ...out, [key]: '' }), {});
            const ws = XLSX.utils.json_to_sheet([row]);
            formatSheet(ws, [row]);
            XLSX.utils.book_append_sheet(wb, ws, config.sheet);
        });
        XLSX.writeFile(wb, `moneyflow_import_template_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    const parseImportFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });
            const rowsByTable = {};
            [...TABLES, SETTINGS_TABLE].forEach(config => {
                const sheet = wb.Sheets[config.sheet];
                if (!sheet) return;
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
                    .map(row => cleanImportRow(row, config.columns))
                    .filter(row => Object.keys(row).some(key => key !== 'id' && row[key] !== ''));
                if (rows.length) rowsByTable[config.key] = rows;
            });

            if (Object.keys(rowsByTable).length === 0) {
                toast.error('No recognizable sheets found');
                return;
            }
            setImportRows(rowsByTable);
            toast.success('Import file loaded for preview');
        } catch (e) {
            toast.error('Import read failed: ' + e.message);
        }
    };

    const runImport = async () => {
        if (!importRows) return;
        setLoading(true);
        try {
            const existingData = await loadAllData();
            const result = { created: 0, updated: 0 };

            for (const config of TABLES) {
                const rows = importRows[config.key] || [];
                if (rows.length === 0) continue;
                const existingIds = new Set((existingData[config.key] || []).map(item => item.id || item.$id));

                for (const raw of rows) {
                    const { id, ...payload } = raw;
                    if (id && existingIds.has(id) && config.update) {
                        await config.update(id, payload);
                        result.updated += 1;
                    } else {
                        await config.create(id ? { id, ...payload } : payload);
                        result.created += 1;
                    }
                }
            }

            const settingsRows = importRows.settings || [];
            if (settingsRows[0]) {
                const { min_sar_rate, min_aed_rate } = settingsRows[0];
                await dbService.upsertSettings({
                    min_sar_rate: Number(min_sar_rate) || 0,
                    min_aed_rate: Number(min_aed_rate) || 0,
                });
                result.updated += 1;
            }

            setImportRows(null);
            toast.success(`Import complete: ${result.created} created, ${result.updated} updated`);
        } catch (e) {
            toast.error('Import failed: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout title="Data Export">
            <div className="stats-grid" style={{ marginBottom: 24 }}>
                <div className="card" style={{ padding: 20, border: '1px solid rgba(74,158,255,0.25)' }}>
                    <div className="flex items-center gap-3">
                        <Database size={22} color="#4a9eff" />
                        <div>
                            <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{periodLabel}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Workbook export</div>
                        </div>
                    </div>
                </div>
                <div className="card" style={{ padding: 20, border: '1px solid rgba(0,200,150,0.25)' }}>
                    <div className="flex items-center gap-3">
                        <CheckCircle size={22} color="var(--brand-accent)" />
                        <div>
                            <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Non-destructive</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Creates or updates rows</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: 24, marginBottom: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Export Range</label>
                        <select className="form-select" value={periodMode} onChange={e => setPeriodMode(e.target.value)}>
                            <option value="all">All Data</option>
                            <option value="month">Specific Month</option>
                        </select>
                    </div>
                    {periodMode === 'month' && (
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Month</label>
                            <input className="form-input" type="month" value={month} onChange={e => setMonth(e.target.value)} />
                        </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                        <button className="btn btn-accent" onClick={exportWorkbook} disabled={loading}>
                            {loading ? <RefreshCw size={16} /> : <Download size={16} />} Download Excel
                        </button>
                        <button className="btn btn-outline" onClick={downloadTemplate} disabled={loading}>
                            <FileSpreadsheet size={16} /> Template
                        </button>
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: 24 }}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <div className="card-title">Import Excel</div>
                        <div className="card-subtitle">Upload a workbook with matching sheet names and field columns.</div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={parseImportFile} style={{ display: 'none' }} />
                        <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                            <Upload size={16} /> Choose File
                        </button>
                        {importRows && (
                            <button className="btn btn-accent" onClick={runImport} disabled={loading}>
                                {loading ? <RefreshCw size={16} /> : <CheckCircle size={16} />} Confirm Import
                            </button>
                        )}
                    </div>
                </div>

                {importRows && (
                    <div style={{ marginTop: 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                            Import Preview
                        </div>
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Sheet</th>
                                        <th style={{ textAlign: 'right' }}>Rows</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...TABLES, SETTINGS_TABLE]
                                        .filter(config => importRows[config.key]?.length)
                                        .map(config => (
                                            <tr key={config.key}>
                                                <td>{config.label}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 800 }}>{importRows[config.key].length}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
