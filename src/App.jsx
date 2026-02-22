import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import AgentsPage from './pages/AgentsPage';
import EmployeesPage from './pages/EmployeesPage';
import ExpensesPage from './pages/ExpensesPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#112240',
              color: '#e8f0fe',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px',
              fontSize: '14px',
            },
            success: { iconTheme: { primary: '#00c896', secondary: '#112240' } },
            error: { iconTheme: { primary: '#ff5470', secondary: '#112240' } },
          }}
        />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* All authenticated users */}
          <Route path="/dashboard" element={
            <ProtectedRoute><DashboardPage /></ProtectedRoute>
          } />
          <Route path="/transactions" element={
            <ProtectedRoute><TransactionsPage /></ProtectedRoute>
          } />

          {/* Super admin only */}
          <Route path="/agents" element={
            <ProtectedRoute roles={['superadmin']}><AgentsPage /></ProtectedRoute>
          } />
          <Route path="/employees" element={
            <ProtectedRoute roles={['superadmin']}><EmployeesPage /></ProtectedRoute>
          } />
          <Route path="/expenses" element={
            <ProtectedRoute roles={['superadmin']}><ExpensesPage /></ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
