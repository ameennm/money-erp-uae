import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Topbar({ title }) {
    const { role } = useAuth();

    const roleColors = {
        admin: 'badge-admin',
        collector: 'badge-collector',
    };

    const roleLabels = {
        admin: 'Admin',
        collector: 'Collector',
    };

    return (
        <header className="topbar">
            <h2 className="topbar-title">{title}</h2>
            <div className="topbar-actions">
                <span className={`badge ${roleColors[role] || 'badge-employee'}`}>
                    {roleLabels[role] || role}
                </span>
                <button className="btn btn-outline btn-icon" title="Notifications">
                    <Bell size={18} />
                </button>
            </div>
        </header>
    );
}
