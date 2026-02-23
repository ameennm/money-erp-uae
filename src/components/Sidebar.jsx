import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard, ArrowLeftRight, Users, UserCog,
    TrendingDown, LogOut, Wallet, RefreshCw, PiggyBank
} from 'lucide-react';

const NAV = {
    superadmin: [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
        { label: 'Credits', path: '/credits', icon: PiggyBank },
        { label: 'Conversion Agents', path: '/conversion-agents', icon: RefreshCw },
        { label: 'Collection Agents', path: '/agents', icon: Users },
        { label: 'Employees', path: '/employees', icon: UserCog },
        { label: 'Expenses', path: '/expenses', icon: TrendingDown },
    ],
    collector: [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
        { label: 'Credits', path: '/credits', icon: PiggyBank },
        { label: 'Conversion Agents', path: '/conversion-agents', icon: RefreshCw },
        { label: 'Collection Agents', path: '/agents', icon: Users },
        { label: 'Employees', path: '/employees', icon: UserCog },
    ],
    employee: [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
    ],
};

const ROLE_COLOR = {
    superadmin: '#f5a623',
    collector: '#4a9eff',
    employee: '#00c896',
};

export default function Sidebar() {
    const { user, role, logout } = useAuth();
    const navigate = useNavigate();
    const links = NAV[role] || NAV.employee;

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <aside className="sidebar">
            {/* ── Brand ────────────────────────────────────────────────────────── */}
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
            </div>

            {/* ── Nav ──────────────────────────────────────────────────────────── */}
            <nav className="sidebar-nav">
                <div className="nav-section-title">Main Menu</div>
                {links.map(({ label, path, icon: Icon }) => (
                    <NavLink
                        key={path}
                        to={path}
                        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                    >
                        <Icon size={17} className="nav-icon" />
                        <span>{label}</span>
                    </NavLink>
                ))}
            </nav>

            {/* ── Footer ───────────────────────────────────────────────────────── */}
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
                            {role === 'superadmin' ? 'Super Admin' : role?.charAt(0).toUpperCase() + role?.slice(1)}
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
