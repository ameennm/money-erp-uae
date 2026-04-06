import { Bell, Menu, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Topbar({ title, onMenuToggle }) {
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
            <div className="flex items-center gap-3">
                <button className="mobile-menu-btn" onClick={onMenuToggle} aria-label="Toggle menu">
                    <Menu size={22} />
                </button>
                <div className="flex items-center gap-1 mr-2 hide-on-mobile">
                    <button className="btn btn-icon btn-sm" onClick={() => window.history.back()} title="Back">
                        <ChevronLeft size={18} />
                    </button>
                    <button className="btn btn-icon btn-sm" onClick={() => window.history.forward()} title="Forward">
                        <ChevronRight size={18} />
                    </button>
                </div>
                <h2 className="topbar-title">{title}</h2>
            </div>
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
