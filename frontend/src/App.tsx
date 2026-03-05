import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useWebSocket } from './hooks/useWebSocket';
import { useAuthState } from './hooks/useAuth';
import { DashboardPage } from './pages/DashboardPage';
import { AlarmsPage } from './pages/AlarmsPage';
import { TrendsPage } from './pages/TrendsPage';
import { JobsPage } from './pages/JobsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';

export default function App() {
  const { tagValues, alarms, connected } = useWebSocket();
  const auth = useAuthState();

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={<LoginPage onLogin={auth.login} />}
        />
        <Route
          path="*"
          element={
            <AppShell
              user={auth.user}
              wsConnected={connected}
              activeAlarmCount={alarms.filter(a => a.state === 'active_unacked').length}
              onLogout={auth.logout}
            >
              <Routes>
                <Route path="/" element={<DashboardPage tagValues={tagValues} alarms={alarms} userRole={auth.user?.role} />} />
                <Route path="/screen/:slug" element={<DashboardPage tagValues={tagValues} alarms={alarms} userRole={auth.user?.role} />} />
                <Route path="/alarms" element={<AlarmsPage realtimeAlarms={alarms} />} />
                <Route path="/trends" element={<TrendsPage />} />
                <Route path="/jobs" element={<JobsPage user={auth.user} />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/settings" element={<SettingsPage user={auth.user} />} />
              </Routes>
            </AppShell>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
