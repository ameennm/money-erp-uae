import { useState, useEffect } from 'react';
import { dbService, Query } from '../lib/appwrite';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Settings, Save, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';

export default function SettingsPage() {
    const { role } = useAuth();
    const isAdmin = role === 'admin';

    const [minSarRate, setMinSarRate] = useState('');
    const [minAedRate, setMinAedRate] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [wiping, setWiping] = useState(false);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const s = await dbService.getSettings();
            setMinSarRate(s.min_sar_rate ? String(s.min_sar_rate) : '');
            setMinAedRate(s.min_aed_rate ? String(s.min_aed_rate) : '');
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchSettings(); }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        const sar = parseFloat(minSarRate);
        const aed = parseFloat(minAedRate);
        if (isNaN(sar) || sar <= 0) return toast.error('Enter a valid minimum SAR rate');
        if (isNaN(aed) || aed <= 0) return toast.error('Enter a valid minimum AED rate');

        setSaving(true);
        try {
            await dbService.upsertSettings({ min_sar_rate: sar, min_aed_rate: aed });
            toast.success('✅ Settings saved successfully');
        } catch (e) {
            toast.error('Failed to save: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const wipeAllData = async () => {
        const confirmed = window.prompt(
            'DANGER: This will delete ALL transactions, expenses, conversion records, and reset all agent balances.\n\nType "wipe all data" to confirm:'
        );
        if (confirmed !== 'wipe all data') return toast.error('Aborted. You did not type wipe all data.');
        setWiping(true);
        const cols = ['transactions', 'aed_conversions', 'expenses', 'credits'];
        try {
            let totalDeleted = 0;
            // Using existing API routes to fetch and delete
            for (const col of cols) {
                let count = 0;
                while (true) {
                    const res = await fetch(`/api/${col}`).then(r => r.json());
                    if (!res || res.length === 0) break;
                    await Promise.all(res.map(doc => fetch(`/api/${col}/${doc.$id}`, { method: 'DELETE' })));
                    count += res.length;
                }
                totalDeleted += count;
            }
            // Reset all agent/distributor balances
            let agentDone = false;
            while (!agentDone) {
                const res = await fetch(`/api/agents`).then(r => r.json());
                if (!res || res.length === 0) { agentDone = true; break; }
                const toUpdate = res.filter(a => a.inr_balance > 0 || a.sar_balance > 0 || a.aed_balance > 0);
                if (toUpdate.length === 0) { agentDone = true; break; }
                await Promise.all(toUpdate.map(doc =>
                    fetch(`/api/agents/${doc.$id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ inr_balance: 0, sar_balance: 0, aed_balance: 0 })
                    })
                ));
            }
            toast.success(`✅ Wiped ${totalDeleted} records. All balances reset to zero.`);
        } catch (e) {
            toast.error('Wipe failed: ' + e.message);
        } finally {
            setWiping(false);
        }
    };

    if (!isAdmin) {
        return (
            <Layout title="Settings">
                <div className="empty-state card">
                    <Settings size={40} />
                    <p>Access denied. Admin only.</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="Settings">
            <div style={{ maxWidth: 560 }}>
                {/* Header */}
                <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-muted)', marginBottom: 6 }}>
                        Admin Configuration
                    </div>
                    <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                        Conversion Rate Settings
                    </h2>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                        Set minimum collection rates for each currency. Transactions below these rates will be blocked.
                    </p>
                </div>

                {loading ? (
                    <div className="loading-screen" style={{ minHeight: '30vh' }}>
                        <div className="spinner" /><p>Loading settings…</p>
                    </div>
                ) : (
                    <form onSubmit={handleSave}>
                        {/* SAR Rate Card */}
                        <div className="card" style={{ marginBottom: 16, padding: 24, border: '1px solid rgba(74,158,255,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 10,
                                    background: 'rgba(74,158,255,0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#4a9eff', fontWeight: 800, fontSize: 14
                                }}>SAR</div>
                                <div>
                                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>SAR → INR Minimum Rate</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Per 1000 INR — e.g. 39.9 SAR</div>
                                </div>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <input
                                    className="form-input"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    required
                                    placeholder="e.g. 39.9"
                                    value={minSarRate}
                                    onChange={e => setMinSarRate(e.target.value)}
                                    style={{ fontSize: 18, fontWeight: 700, height: 52 }}
                                />
                                {minSarRate && (
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                                        ✓ Transactions must collect at least <strong style={{ color: '#4a9eff' }}>{minSarRate} SAR</strong> per 1000 INR
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* AED Rate Card */}
                        <div className="card" style={{ marginBottom: 28, padding: 24, border: '1px solid rgba(245,166,35,0.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 10,
                                    background: 'rgba(245,166,35,0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'var(--brand-gold)', fontWeight: 800, fontSize: 14
                                }}>AED</div>
                                <div>
                                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>AED → INR Minimum Rate</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Per 1000 INR — e.g. 44.5 AED</div>
                                </div>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <input
                                    className="form-input"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    required
                                    placeholder="e.g. 44.5"
                                    value={minAedRate}
                                    onChange={e => setMinAedRate(e.target.value)}
                                    style={{ fontSize: 18, fontWeight: 700, height: 52 }}
                                />
                                {minAedRate && (
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                                        ✓ Transactions must collect at least <strong style={{ color: 'var(--brand-gold)' }}>{minAedRate} AED</strong> per 1000 INR
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Info Banner */}
                        <div className="card" style={{ padding: 16, marginBottom: 24, background: 'rgba(0,200,150,0.06)', border: '1px solid rgba(0,200,150,0.2)' }}>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                💡 <strong>Profit Calculation:</strong> When a transaction uses a rate above the minimum, the difference is recorded as profit.
                                E.g. if min SAR rate is 39.9 and agent collects 40.2, the profit = <strong>(40.2 − 39.9) / 1000 × INR requested</strong>.
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button type="button" className="btn btn-outline" onClick={fetchSettings} disabled={loading}>
                                <RefreshCw size={15} /> Reload
                            </button>
                            <button type="submit" className="btn btn-accent" disabled={saving} style={{ flex: 1, height: 48 }}>
                                <Save size={15} /> {saving ? 'Saving…' : 'Save Settings'}
                            </button>
                        </div>
                    </form>
                )}

                {/* Danger Zone */}
                <div className="card" style={{ marginTop: 40, padding: 24, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <AlertTriangle size={18} color="#ef4444" />
                        <span style={{ fontWeight: 700, color: '#ef4444', fontSize: 15 }}>Danger Zone</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                        Permanently deletes <strong>all transactions, expenses, AED conversions, and credits</strong>.
                        Also resets all agent and distributor balances to zero. Use this only when starting fresh.
                    </p>
                    <button
                        type="button"
                        className="btn"
                        style={{ background: '#ef4444', color: '#fff', border: 'none', fontWeight: 700 }}
                        onClick={wipeAllData}
                        disabled={wiping}
                    >
                        <Trash2 size={15} /> {wiping ? 'Wiping… please wait' : 'Wipe All Data'}
                    </button>
                </div>
            </div>
        </Layout>
    );
}
