import { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '../lib/appwrite';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null); // 'admin' | 'collector'
    const [loading, setLoading] = useState(true);

    const detectRole = (email) => {
        if (!email) return null;
        if (email.includes('admin')) return 'admin';
        if (email.includes('collector')) return 'collector';
        return 'admin'; // fallback
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

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
