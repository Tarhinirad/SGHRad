import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { api, setToken } from './api';
import { Layout } from './components/Layout';
import './index.css';
import { AuditPage } from './pages/AuditPage';
import { CallsPage } from './pages/CallsPage';
import { DayPage } from './pages/DayPage';
import { ImportExportPage } from './pages/ImportExportPage';
import { LoginPage } from './pages/LoginPage';
import { ResidentPage } from './pages/ResidentPage';
import { ResidentsPage } from './pages/ResidentsPage';
import { SettingsPage } from './pages/SettingsPage';
import { VacationsPage } from './pages/VacationsPage';
import { WarningsPage } from './pages/WarningsPage';
import { WeekPage } from './pages/WeekPage';
import { YearPage } from './pages/YearPage';
import { DataProvider } from './store';

interface Me {
  role: 'admin' | 'viewer';
  name: string;
  guest?: boolean;
  publicView?: boolean;
}

function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  const loadMe = () =>
    api<Me>('/api/me')
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setChecking(false));

  useEffect(() => {
    void loadMe();
    const onExpired = () => void loadMe();
    window.addEventListener('auth-expired', onExpired);
    return () => window.removeEventListener('auth-expired', onExpired);
  }, []);

  if (checking) return <div className="p-8 text-center text-muted">Loading…</div>;
  if (!me || showLogin)
    return (
      <LoginPage
        onCancel={me?.publicView ? () => setShowLogin(false) : undefined}
        onLogin={(token, role, name) => {
          setToken(token);
          setMe({ role, name, publicView: me?.publicView });
          setShowLogin(false);
        }}
      />
    );

  const logout = () => {
    setToken(null);
    setChecking(true);
    void loadMe();
  };

  return (
    <DataProvider role={me.role} name={me.name}>
      <Layout onLogout={logout} onLogin={() => setShowLogin(true)} guest={!!me.guest}>
        {me.role === 'admin' ? (
          <Routes>
            <Route path="/" element={<DayPage />} />
            <Route path="/day/:date" element={<DayPage />} />
            <Route path="/week" element={<WeekPage />} />
            <Route path="/week/:date" element={<WeekPage />} />
            <Route path="/year" element={<YearPage />} />
            <Route path="/calls" element={<CallsPage />} />
            <Route path="/vacations" element={<VacationsPage />} />
            <Route path="/residents" element={<ResidentsPage />} />
            <Route path="/residents/:id" element={<ResidentPage />} />
            <Route path="/warnings" element={<WarningsPage />} />
            <Route path="/import" element={<ImportExportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          // Read-only view. Signed-in residents (resident password) also get the year grid, calls and vacations;
          // public guests only see today, the week and the directory.
          <Routes>
            <Route path="/" element={<DayPage />} />
            <Route path="/day/:date" element={<DayPage />} />
            <Route path="/week" element={<WeekPage />} />
            <Route path="/week/:date" element={<WeekPage />} />
            {!me.guest && <Route path="/year" element={<YearPage />} />}
            {!me.guest && <Route path="/calls" element={<CallsPage />} />}
            {!me.guest && <Route path="/vacations" element={<VacationsPage />} />}
            <Route path="/residents" element={<ResidentsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </Layout>
    </DataProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
