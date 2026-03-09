/**
 * App.tsx — Root component of the application.
 *
 * This is the top-level React component that wires together:
 *   - Client-side routing (URL → page mapping without full-page reloads)
 *   - Real-time data via WebSocket (live tag values and alarms)
 *   - Authentication state (who is logged in, what role they have)
 *   - The application shell (sidebar, header) that wraps every page
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useWebSocket } from './hooks/useWebSocket';
import { useAuthState } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { api } from './lib/api';
import { applyTheme } from './lib/theme';

// lazy() enables "code splitting" — instead of bundling every page into one large
// JavaScript file, each page is downloaded only when the user navigates to it.
// This makes the initial page load much faster, especially on slow connections.
// The .then() wrapper is needed because these pages use named exports, but
// React.lazy() expects a default export.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const AlarmsPage = lazy(() => import('./pages/AlarmsPage').then(m => ({ default: m.AlarmsPage })));
const TrendsPage = lazy(() => import('./pages/TrendsPage').then(m => ({ default: m.TrendsPage })));
const JobsPage = lazy(() => import('./pages/JobsPage').then(m => ({ default: m.JobsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const FactoryConfigPage = lazy(() => import('./pages/FactoryConfigPage').then(m => ({ default: m.FactoryConfigPage })));

// PageLoader is the "fallback" UI shown while a lazy-loaded page is being downloaded.
// React's <Suspense> component renders this automatically until the lazy component is ready.
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );
}

// applyBranding modifies the actual HTML document directly (outside of React's control).
// document.title sets the browser tab title, and querySelector finds the <link rel="icon">
// element to swap the favicon. This is one of the few places where we reach outside React
// to manipulate the DOM, because these elements live in <head>, not inside our React app.
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
  // useWebSocket opens a persistent connection to the server, receiving live tag values
  // and alarm updates in real time (instead of polling the server repeatedly).
  const { tagValues, alarms, connected } = useWebSocket();

  // useAuthState manages login/logout and stores the current user (role, username, etc.)
  const auth = useAuthState();

  const [siteTitle, setSiteTitle] = useState('Industrial HMI');
  const [navTitle, setNavTitle] = useState('HMI');
  const [activeProjectName, setActiveProjectName] = useState<string | null>(null);

  // useEffect with an empty dependency array [] runs exactly once when the component
  // first mounts (appears on screen). This is the standard pattern for "do something
  // once on startup" — here we fetch branding and the active project from the backend.
  // The .catch(() => {}) silently ignores errors (e.g., if the server is unreachable).
  useEffect(() => {
    api.getBranding().then((b) => {
      setSiteTitle(b.site_title);
      setNavTitle(b.nav_title);
      applyBranding(b);
    }).catch(() => {});
    api.getActiveProject().then(p => setActiveProjectName(p.name)).catch(() => {});
  }, []);

  // BrowserRouter enables client-side routing: clicking links changes the URL and
  // renders different page components WITHOUT a full page reload from the server.
  // This makes navigation feel instant compared to traditional multi-page websites.
  return (
    <BrowserRouter>
      <Routes>
        {/* Login page is outside AppShell so it renders without sidebar/header */}
        <Route
          path="/login"
          element={<LoginPage onLogin={auth.login} siteTitle={siteTitle} />}
        />
        {/* path="*" is a catch-all — any URL not matching "/login" falls through here.
            This lets the nested Routes below handle all authenticated pages. */}
        <Route
          path="*"
          element={
            <AppShell
              user={auth.user}
              wsConnected={connected}
              alarms={alarms}
              onLogout={auth.logout}
              navTitle={navTitle}
              activeProjectName={activeProjectName}
            >
              {/* Suspense wraps lazy-loaded pages. While a page's code is downloading,
                  React shows the <PageLoader /> fallback instead of a blank screen. */}
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
