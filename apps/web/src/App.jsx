import { t, useLocale } from "./context/LocaleContext.jsx";
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppShell from './components/AppShell.jsx';
import Loading from './components/Loading.jsx';
const CounterPage = lazy(() => import('./pages/CounterPage.jsx'));
const DebtsPage = lazy(() => import('./pages/DebtsPage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const InventoryPage = lazy(() => import('./pages/InventoryPage.jsx'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage.jsx'));
const ForecastPage = lazy(() => import('./pages/ForecastPage.jsx'));
const ReorderPage = lazy(() => import('./pages/ReorderPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const ImportPage = lazy(() => import('./pages/ImportPage.jsx'));
const BackupsPage = lazy(() => import('./pages/BackupsPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const AccountPage = lazy(() => import('./pages/AccountPage.jsx'));
function Protected() {
  useLocale();
  const {
    session,
    loading
  } = useAuth();
  if (loading) return <Loading label={t("Checking secure session...")} />;
  return session ? <AppShell /> : <Navigate to="/login" replace />;
}
function RoleRoute({
  roles,
  children
}) {
  useLocale();
  const {
    profile
  } = useAuth();
  return roles.includes(profile?.role) ? children : <Navigate to="/" replace />;
}
export default function App() {
  useLocale();
  const {
    session,
    loading
  } = useAuth();
  return <Suspense fallback={<Loading label={t("Opening page…")} />}><Routes>
 <Route path="/login" element={loading ? <Loading /> : session ? <Navigate to="/" replace /> : <LoginPage />} />
 <Route element={<Protected />}>
  <Route index element={<DashboardPage />} />
  <Route path="counter" element={<CounterPage />} />
  <Route path="debts" element={<DebtsPage />} />
  <Route path="inventory" element={<InventoryPage />} />
  <Route path="transactions" element={<TransactionsPage />} />
  <Route path="forecast" element={<ForecastPage />} />
  <Route path="reorder" element={<ReorderPage />} />
  <Route path="reports" element={<ReportsPage />} />
  <Route path="account" element={<AccountPage />} />
  <Route path="imports" element={<RoleRoute roles={['owner', 'admin']}><ImportPage /></RoleRoute>} />
  <Route path="backups" element={<RoleRoute roles={['owner', 'admin']}><BackupsPage /></RoleRoute>} />
  <Route path="users" element={<RoleRoute roles={['owner']}><UsersPage /></RoleRoute>} />
  <Route path="settings" element={<RoleRoute roles={['owner']}><SettingsPage /></RoleRoute>} />
 </Route>
 <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
 </Routes></Suspense>;
}
