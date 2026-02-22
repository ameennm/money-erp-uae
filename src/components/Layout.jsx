import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function Layout({ children, title = 'MoneyFlow ERP' }) {
    return (
        <div className="app-shell">
            <Sidebar />
            <div className="main-content">
                <Topbar title={title} />
                <main className="page-body fade-in">
                    {children}
                </main>
            </div>
        </div>
    );
}
