import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard, ArrowLeftRight, Users, UserCog,
    TrendingDown, LogOut, Wallet, RefreshCw, FileSpreadsheet, Settings, X
} from 'lucide-react';

const NAV = {
    admin: [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
        { label: 'Conversion Agents', path: '/conversion-agents', icon: RefreshCw },
        { label: 'Agents', path: '/agents', icon: Users },
        { label: 'Distributors', path: '/distributors', icon: UserCog },
        { label: 'Income & Ops', path: '/expenses', icon: TrendingDown },
        { label: 'Reports', path: '/reports', icon: FileSpreadsheet },
        { label: 'Settings', path: '/settings', icon: Settings },
    ],
    collector: [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
        { label: 'Conversion Agents', path: '/conversion-agents', icon: RefreshCw },
        { label: 'Agents', path: '/agents', icon: Users },
        { label: 'Distributors', path: '/distributors', icon: UserCog },
        { label: 'Income & Ops', path: '/expenses', icon: TrendingDown },
        { label: 'Reports', path: '/reports', icon: FileSpreadsheet },
    ],
};

const ROLE_COLOR = {
    admin: '#f5a623',
    collector: '#4a9eff',
};

export default function Sidebar({ isOpen, onClose }) {
    const { user, role, logout } = useAuth();
    const navigate = useNavigate();
    const links = NAV[role] || NAV.admin;

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
            {/* ── Brand ─────────────────────────────────────────── */}
            <div className="sidebar-logo">
                <div className="logo-mark">
                    <div className="logo-icon">
                        <Wallet size={20} />
                    </div>
                    <div className="logo-text">
                        <span className="logo-name">MoneyFlow</span>
                        <span className="logo-sub">ERP System</span>
                    </div>
                </div>
                <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
                    <X size={20} />
                </button>
            </div>

            {/* ── Nav ────────────────────────────────────────────── */}
            <nav className="sidebar-nav">
                <div className="nav-section-title">Main Menu</div>
                {links.map(({ label, path, icon: Icon }) => (
                    <NavLink
                        key={path}
                        to={path}
                        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                        onClick={onClose}
                    >
                        <Icon size={17} className="nav-icon" />
                        <span>{label}</span>
                    </NavLink>
                ))}
            </nav>

            {/* ── Footer ─────────────────────────────────────────── */}
            <div className="sidebar-footer">
                <div className="sidebar-user">
                    <div className="user-avatar">
                        {user?.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="user-info">
                        <div className="user-name">
                            {user?.name || user?.email?.split('@')[0]}
                        </div>
                        <div className="user-role" style={{ color: ROLE_COLOR[role] }}>
                            {role?.charAt(0).toUpperCase() + role?.slice(1)}
                        </div>
                    </div>
                    <button id="logout-btn" className="logout-btn" onClick={handleLogout} title="Logout">
                        <LogOut size={17} />
                    </button>
                </div>
            </div>
        </aside>
    );
}
