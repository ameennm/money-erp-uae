import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps a route and redirects to /login if not authenticated.
 * Optionally restricts to specific roles via the `roles` prop.
 */
export default function ProtectedRoute({ children, roles }) {
    const { user, role, loading } = useAuth();

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner" />
                <p>Loading…</p>
            </div>
        );
    }

    if (!user) return <Navigate to="/login" replace />;

    if (roles && !roles.includes(role)) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
}
