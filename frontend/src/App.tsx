import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useWebSocket } from './hooks/useWebSocket';
import { useAuthState } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { api } from './lib/api';
import { applyTheme } from './lib/theme';

// Lazy-load page components for code splitting
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const AlarmsPage = lazy(() => import('./pages/AlarmsPage').then(m => ({ default: m.AlarmsPage })));
const TrendsPage = lazy(() => import('./pages/TrendsPage').then(m => ({ default: m.TrendsPage })));
const JobsPage = lazy(() => import('./pages/JobsPage').then(m => ({ default: m.JobsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const FactoryConfigPage = lazy(() => import('./pages/FactoryConfigPage').then(m => ({ default: m.FactoryConfigPage })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );
}

function applyBranding(branding: { site_title: string; has_favicon: boolean; theme_accent: string; theme_preset: string }) {
  document.title = branding.site_title;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) {
    link.href = branding.has_favicon
      ? '/api/branding/favicon'
      : '/vite.svg';
  }
  applyTheme(branding.theme_accent, branding.theme_preset);
}

export default function App() {
  const { tagValues, alarms, connected } = useWebSocket();
  const auth = useAuthState();
  const [siteTitle, setSiteTitle] = useState('Industrial HMI');
  const [navTitle, setNavTitle] = useState('HMI');

  useEffect(() => {
    api.getBranding().then((b) => {
      setSiteTitle(b.site_title);
      setNavTitle(b.nav_title);
      applyBranding(b);
    }).catch(() => {});
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={<LoginPage onLogin={auth.login} siteTitle={siteTitle} />}
        />
        <Route
          path="*"
          element={
            <AppShell
              user={auth.user}
              wsConnected={connected}
              alarms={alarms}
              onLogout={auth.logout}
              navTitle={navTitle}
            >
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<DashboardPage tagValues={tagValues} alarms={alarms} userRole={auth.user?.role} />} />
                  <Route path="/screen/:slug" element={<DashboardPage tagValues={tagValues} alarms={alarms} userRole={auth.user?.role} />} />
                  <Route path="/alarms" element={<AlarmsPage realtimeAlarms={alarms} />} />
                  <Route path="/trends" element={<TrendsPage />} />
                  <Route path="/jobs" element={<JobsPage user={auth.user} />} />
                  <Route path="/reports" element={<ReportsPage user={auth.user} />} />
                  <Route path="/projects" element={<ProjectsPage user={auth.user} />} />
                  <Route path="/settings" element={<SettingsPage user={auth.user} tagValues={tagValues} />} />
                  <Route path="/factory-config" element={<FactoryConfigPage user={auth.user} tagValues={tagValues} />} />
                </Routes>
              </Suspense>
            </AppShell>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
