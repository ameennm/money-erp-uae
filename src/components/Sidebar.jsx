import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard, ArrowLeftRight, Users, UserCog,
    TrendingDown, LogOut, Shield, Wallet
} from 'lucide-react';

const NAV = {
    superadmin: [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
        { label: 'Agents', path: '/agents', icon: Users },
        { label: 'Employees', path: '/employees', icon: UserCog },
        { label: 'Expenses', path: '/expenses', icon: TrendingDown },
    ],
    collector: [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
    ],
    employee: [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
    ],
};

const ROLE_LABELS = {
    superadmin: 'Super Admin',
    collector: 'Collector',
    employee: 'Employee',
};

export default function Sidebar() {
    const { user, role, logout } = useAuth();
    const navigate = useNavigate();

    const links = NAV[role] || NAV.employee;

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const initials = (user?.name || user?.email || 'U')
        .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    return (
        <aside className="sidebar">
            {/* Logo */}
            <div className="sidebar-logo">
                <div className="logo-mark">
                    <div className="logo-icon">
                        <Wallet size={20} />
                    </div>
                    <div className="logo-text">
                        <span className="logo-name">MoneyFlow</span>
                        <span className="logo-sub">ERP · SAR → AED → INR</span>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                <div className="nav-section-title">Main Menu</div>
                {links.map(({ label, path, icon: Icon }) => (
                    <NavLink
                        key={path}
                        to={path}
                        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                    >
                        <Icon size={18} className="nav-icon" />
                        {label}
                    </NavLink>
                ))}
            </nav>

            {/* User footer */}
            <div className="sidebar-footer">
                <div className="sidebar-user">
                    <div className="user-avatar">{initials}</div>
                    <div className="user-info">
                        <div className="user-name">{user?.name || user?.email}</div>
                        <div className="user-role">{ROLE_LABELS[role] || role}</div>
                    </div>
                    <button className="logout-btn" onClick={handleLogout} title="Logout">
                        <LogOut size={16} />
                    </button>
                </div>
            </div>
        </aside>
    );
}
