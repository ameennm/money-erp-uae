import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function Layout({ children, title = 'MoneyFlow ERP' }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="app-shell">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
            )}
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <div className="main-content">
                <Topbar title={title} onMenuToggle={() => setSidebarOpen(v => !v)} />
                <main className="page-body fade-in">
                    {children}
                </main>
            </div>
        </div>
    );
}
