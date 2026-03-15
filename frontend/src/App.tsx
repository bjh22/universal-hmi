/**
 * App.tsx — Root component of the application.
 *
 * This is the top-level React component that wires together:
 *   - Client-side routing (URL → page mapping without full-page reloads)
 *   - Real-time data via WebSocket (live tag values and alarms)
 *   - Authentication state (who is logged in, what role they have)
 *   - The application shell (sidebar, header) that wraps every page
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { FaultHelpDialog } from './components/FaultHelpDialog';
import { useWebSocket } from './hooks/useWebSocket';
import { useAuthState } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { api } from './lib/api';
import { applyTheme } from './lib/theme';
import type { AlarmData } from './types';

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
const SupportPage = lazy(() => import('./pages/SupportPage').then(m => ({ default: m.SupportPage })));
const ServicePage = lazy(() => import('./pages/ServicePage').then(m => ({ default: m.ServicePage })));

// PageLoader is the "fallback" UI shown while a lazy-loaded page is being downloaded.
// React's <Suspense> component renders this automatically until the lazy component is ready.
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );
}

// StartupScreen is shown while waiting for the backend to become available.
// It polls /api/health and auto-dismisses once the server responds.
function StartupScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[var(--hmi-bg-base,#0f172a)]">
      <div className="flex flex-col items-center gap-6">
        <div className="w-10 h-10 border-3 border-[var(--hmi-text-muted,#475569)] border-t-[var(--hmi-accent,#3b82f6)] rounded-full animate-spin" />
        <p className="text-[var(--hmi-text-secondary,#94a3b8)] text-sm">Connecting to server...</p>
      </div>
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
  const { tagValues, alarms, connected, datasourceStatuses } = useWebSocket();

  // useAuthState manages login/logout and stores the current user (role, username, etc.)
  const auth = useAuthState();

  const [backendReady, setBackendReady] = useState(false);
  const [siteTitle, setSiteTitle] = useState('Industrial HMI');
  const [navTitle, setNavTitle] = useState('HMI');
  const activeJobRaw = tagValues['$ACTIVE_JOB']?.value;
  const activeJobName = activeJobRaw && activeJobRaw !== 'None' ? String(activeJobRaw) : null;
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Fault help dialog auto-popup state
  const [helpAlarm, setHelpAlarm] = useState<AlarmData | null>(null);
  const shownHelpIds = useRef<Set<number>>(new Set());

  // Auto-show fault help dialog when a new alarm triggers with help enabled
  useEffect(() => {
    if (helpAlarm) return; // already showing one
    // Find unshown help-enabled alarms, prioritize by severity
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    const candidates = alarms
      .filter(a =>
        a.state === 'active_unacked' &&
        a.help_enabled &&
        a.help_image &&
        !shownHelpIds.current.has(a.id)
      )
      .sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

    if (candidates.length > 0) {
      const alarm = candidates[0];
      shownHelpIds.current.add(alarm.id);
      setHelpAlarm(alarm);
    }

    // Clean up IDs for alarms that are no longer in the list
    const currentIds = new Set(alarms.map(a => a.id));
    for (const id of shownHelpIds.current) {
      if (!currentIds.has(id)) shownHelpIds.current.delete(id);
    }
  }, [alarms, helpAlarm]);

  const handleHelpDismiss = useCallback(() => setHelpAlarm(null), []);
  const handleHelpAcknowledge = useCallback(async () => {
    if (!helpAlarm) return;
    await api.acknowledgeAlarm(helpAlarm.id);
    setHelpAlarm(null);
  }, [helpAlarm]);

  // Poll /api/health until the backend responds, then load branding + active project.
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error();
      setBackendReady(true);
      api.getBranding().then((b) => {
        setSiteTitle(b.site_title);
        setNavTitle(b.nav_title);
        applyBranding(b);
      }).catch(() => {});
    } catch {
      timerRef.current = setTimeout(checkHealth, 1500);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    return () => clearTimeout(timerRef.current);
  }, [checkHealth]);

  // Show loading screen until backend is reachable.
  if (!backendReady) return <StartupScreen />;

  // BrowserRouter enables client-side routing: clicking links changes the URL and
  // renders different page components WITHOUT a full page reload from the server.
  // This makes navigation feel instant compared to traditional multi-page websites.
  return (
    <>
    {helpAlarm && (
      <FaultHelpDialog
        alarm={helpAlarm}
        onAcknowledge={handleHelpAcknowledge}
        onDismiss={handleHelpDismiss}
      />
    )}
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
              activeJobName={activeJobName}
              datasourceStatuses={datasourceStatuses}
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
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/projects" element={<ProjectsPage user={auth.user} />} />
                  <Route path="/settings" element={<SettingsPage user={auth.user} tagValues={tagValues} />} />
                  <Route path="/factory-config" element={<FactoryConfigPage user={auth.user} tagValues={tagValues} />} />
                  <Route path="/service" element={<ServicePage user={auth.user} tagValues={tagValues} />} />
                  <Route path="/support" element={<SupportPage user={auth.user} tagValues={tagValues} alarms={alarms} userRole={auth.user?.role} />} />
                </Routes>
              </Suspense>
            </AppShell>
          }
        />
      </Routes>
    </BrowserRouter>
    </>
  );
}
