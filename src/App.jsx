import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import AgentsPage from './pages/AgentsPage';
import DistributorsPage from './pages/DistributorsPage';
import ExpensesPage from './pages/ExpensesPage';
import ConversionAgentsPage from './pages/ConversionAgentsPage';
import CreditsPage from './pages/CreditsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import ActivityLogsPage from './pages/ActivityLogsPage';

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

          {/* Collector + Admin */}
          <Route path="/conversion-agents" element={
            <ProtectedRoute roles={['admin', 'collector']}><ConversionAgentsPage /></ProtectedRoute>
          } />
          <Route path="/credits" element={
            <ProtectedRoute roles={['admin', 'collector']}><CreditsPage /></ProtectedRoute>
          } />

          {/* Admin + Collector — agent/employee management */}
          <Route path="/agents" element={
            <ProtectedRoute roles={['admin', 'collector']}><AgentsPage /></ProtectedRoute>
          } />
          <Route path="/distributors" element={
            <ProtectedRoute roles={['admin', 'collector']}><DistributorsPage /></ProtectedRoute>
          } />
          <Route path="/expenses" element={
            <ProtectedRoute roles={['admin', 'collector']}><ExpensesPage /></ProtectedRoute>
          } />
          <Route path="/activity-logs" element={
            <ProtectedRoute roles={['admin', 'collector']}><ActivityLogsPage /></ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute roles={['admin', 'collector']}><ReportsPage /></ProtectedRoute>
          } />

          {/* Admin only — Settings */}
          <Route path="/settings" element={
            <ProtectedRoute roles={['admin']}><SettingsPage /></ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
