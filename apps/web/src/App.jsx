import { t, useLocale } from "./context/LocaleContext.jsx";
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import {staffRoles,managerRoles,ownerRoles,homeForRole,verifiedCacheMatches} from './lib/access.js';
import AppShell from './components/AppShell.jsx';
import Loading from './components/Loading.jsx';
const ITSettingsPage = lazy(() => import('./pages/ITSettingsPage.jsx'));
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
    profile,
    loading
  } = useAuth();
  if (loading) return <Loading label={t("Checking secure session...")} />;
  return verifiedCacheMatches(session,profile) ? <AppShell /> : <Navigate to="/login" replace />;
}
function RoleRoute({
  roles,
  children
}) {
  useLocale();
  const {
    profile
  } = useAuth();
  return roles.includes(profile?.role) ? children : <Navigate to={homeForRole(profile?.role)} replace />;
}
export default function App() {
  useLocale();
  const {
    session,
    profile,
    loading
  } = useAuth();
  return <Suspense fallback={<Loading label={t("Opening page…")} />}><Routes>
 <Route path="/login" element={loading ? <Loading /> : verifiedCacheMatches(session,profile) ? <Navigate to={homeForRole(profile.role)} replace /> : <LoginPage />} />
 <Route element={<Protected />}>
  <Route index element={profile?.role === 'cashier' ? <Navigate to="/counter" replace /> : <DashboardPage />} />
  <Route path="counter" element={<CounterPage />} />
  <Route path="debts" element={<RoleRoute roles={staffRoles}><DebtsPage /></RoleRoute>} />
  <Route path="inventory" element={<InventoryPage />} />
  <Route path="transactions" element={<RoleRoute roles={staffRoles}><TransactionsPage /></RoleRoute>} />
  <Route path="forecast" element={<RoleRoute roles={staffRoles}><ForecastPage /></RoleRoute>} />
  <Route path="reorder" element={<RoleRoute roles={staffRoles}><ReorderPage /></RoleRoute>} />
  <Route path="reports" element={<RoleRoute roles={staffRoles}><ReportsPage /></RoleRoute>} />
  <Route path="account" element={<AccountPage />} />
  <Route path="imports" element={<RoleRoute roles={managerRoles}><ImportPage /></RoleRoute>} />
  <Route path="backups" element={<RoleRoute roles={managerRoles}><BackupsPage /></RoleRoute>} />
  <Route path="users" element={<RoleRoute roles={ownerRoles}><UsersPage /></RoleRoute>} />
  <Route path="settings" element={<RoleRoute roles={ownerRoles}><SettingsPage /></RoleRoute>} />
  <Route path="it-settings" element={<RoleRoute roles={['super_admin']}><ITSettingsPage /></RoleRoute>} />
 </Route>
 <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
 </Routes></Suspense>;
}
