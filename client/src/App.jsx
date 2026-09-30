import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import AuthPage from './pages/AuthPage';
import { LoadingState } from './components/ui';
import ErrorBoundary from './components/ui/ErrorBoundary';

// Route-level code splitting for fast initial load
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const AccountsPage = lazy(() => import('./pages/AccountsPage'));
const BudgetsPage = lazy(() => import('./pages/BudgetsPage'));
const GoalsPage = lazy(() => import('./pages/GoalsPage'));
const BillsPage = lazy(() => import('./pages/BillsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const NetWorthPage = lazy(() => import('./pages/NetWorthPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-[#090A0F] flex items-center justify-center">
        <LoadingState label="Restoring session..." />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingState label="Loading view..." />}>
            <Routes>
              <Route
                path="/login"
                element={
                  <PublicOnlyRoute>
                    <AuthPage />
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="/register"
                element={
                  <PublicOnlyRoute>
                    <AuthPage />
                  </PublicOnlyRoute>
                }
              />

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="transactions" element={<TransactionsPage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="budgets" element={<BudgetsPage />} />
                <Route path="goals" element={<GoalsPage />} />
                <Route path="bills" element={<BillsPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="net-worth" element={<NetWorthPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
