import { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '../lib/appwrite';

const AuthContext = createContext(null);

// Super-admin email
const SUPER_ADMIN_EMAIL = 'admin@moneytransfer.com';
const COLLECTOR_EMAIL_SUFFIX = '@collector.moneytransfer.com';
const DISTRIBUTOR_EMAIL_SUFFIX = '@distributor.moneytransfer.com';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null); // 'superadmin' | 'collector' | 'employee' | 'distributor'
    const [loading, setLoading] = useState(true);

    const detectRole = (email) => {
        if (!email) return null;
        if (email === SUPER_ADMIN_EMAIL) return 'superadmin';
        if (email.endsWith(COLLECTOR_EMAIL_SUFFIX)) return 'collector';
        if (email.endsWith(DISTRIBUTOR_EMAIL_SUFFIX)) return 'distributor';
        return 'employee';
    };

    useEffect(() => {
        authService.getCurrentUser().then((u) => {
            setUser(u);
            setRole(detectRole(u?.email));
            setLoading(false);
        });
    }, []);

    const login = async (email, password) => {
        await authService.login(email, password);
        const u = await authService.getCurrentUser();
        setUser(u);
        setRole(detectRole(u?.email));
        return u;
    };

    const logout = async () => {
        await authService.logout();
        setUser(null);
        setRole(null);
    };

    return (
        <AuthContext.Provider value={{ user, role, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
