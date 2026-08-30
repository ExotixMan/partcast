import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppShell from './components/AppShell.jsx';
import Loading from './components/Loading.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import TransactionsPage from './pages/TransactionsPage.jsx';
import ForecastPage from './pages/ForecastPage.jsx';
import ReorderPage from './pages/ReorderPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import ImportPage from './pages/ImportPage.jsx';
import BackupsPage from './pages/BackupsPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import AccountPage from './pages/AccountPage.jsx';

function Protected(){const {session,loading}=useAuth();if(loading)return <Loading label="Checking secure session..."/>;return session?<AppShell/>:<Navigate to="/login" replace/>;}
function RoleRoute({roles,children}){const {profile}=useAuth();return roles.includes(profile?.role)?children:<Navigate to="/" replace/>;}
export default function App(){const {session,loading}=useAuth();return <Routes>
 <Route path="/login" element={loading?<Loading/>:session?<Navigate to="/" replace/>:<LoginPage/>}/>
 <Route element={<Protected/>}>
  <Route index element={<DashboardPage/>}/>
  <Route path="inventory" element={<InventoryPage/>}/>
  <Route path="transactions" element={<TransactionsPage/>}/>
  <Route path="forecast" element={<ForecastPage/>}/>
  <Route path="reorder" element={<ReorderPage/>}/>
  <Route path="reports" element={<ReportsPage/>}/>
  <Route path="account" element={<AccountPage/>}/>
  <Route path="imports" element={<RoleRoute roles={['owner','admin']}><ImportPage/></RoleRoute>}/>
  <Route path="backups" element={<RoleRoute roles={['owner','admin']}><BackupsPage/></RoleRoute>}/>
  <Route path="users" element={<RoleRoute roles={['owner']}><UsersPage/></RoleRoute>}/>
  <Route path="settings" element={<RoleRoute roles={['owner']}><SettingsPage/></RoleRoute>}/>
 </Route>
 <Route path="*" element={<Navigate to={session?'/':'/login'} replace/>}/>
 </Routes>}
