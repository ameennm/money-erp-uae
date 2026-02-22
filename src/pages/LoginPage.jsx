import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Wallet, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email.trim(), password);
            toast.success('Welcome back!');
            navigate('/dashboard');
        } catch (err) {
            setError(err?.message || 'Invalid email or password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-box">
                {/* Logo */}
                <div className="login-logo">
                    <div className="icon-wrap">
                        <Wallet size={30} />
                    </div>
                    <h1>MoneyFlow ERP</h1>
                    <p>SAR → AED → INR Transfer Management</p>
                </div>

                {/* Error */}
                {error && <div className="login-error">{error}</div>}

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input
                            id="login-email"
                            className="form-input"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-group" style={{ position: 'relative' }}>
                        <label className="form-label">Password</label>
                        <input
                            id="login-password"
                            className="form-input"
                            type={showPw ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            style={{ paddingRight: '42px' }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPw(!showPw)}
                            style={{
                                position: 'absolute', right: '12px',
                                top: '50%', transform: 'translateY(8px)',
                                background: 'none', border: 'none',
                                color: 'var(--text-muted)', cursor: 'pointer',
                            }}
                        >
                            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>

                    <button
                        id="login-submit"
                        className="login-btn"
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? 'Signing in…' : 'Sign In'}
                    </button>
                </form>

                <p style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                    Contact your super admin for access credentials.
                </p>
            </div>
        </div>
    );
}
