/**
 * AppShell — the main application layout wrapper that provides the persistent
 * UI chrome around every page: sidebar navigation, top header bar, alarm banner,
 * and WebSocket connection status indicator.
 *
 * Every page except Login is rendered inside this shell. The `children` prop
 * receives the current page content (Dashboard, Alarms, Trends, etc.) and
 * renders it in the main content area.
 *
 * Key features:
 *   - Sidebar navigation with role-based filtering (operators see fewer pages)
 *   - Alarm banner: scrollable horizontal list of active alarms with color-coded
 *     severity and an "Acknowledge All" button
 *   - Data source connection indicators: per-source green/red dots showing equipment connectivity
 *   - Collapsible sidebar for more screen real estate
 */
import { useState, useCallback, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, TrendingUp, Bell, ClipboardList, BarChart3,
  Settings, User, Menu, X, FolderOpen, CheckCheck,
  AlertTriangle, AlertCircle, Info, Cog, LifeBuoy, Wrench,
  Circle,
} from 'lucide-react';
import type { UserData, AlarmData, DatasourceStatus } from '../../types';
import { api } from '../../lib/api';
import { SeverityIcon } from '../shared/SeverityIcon';

interface AppShellProps {
  children: React.ReactNode;
  user: UserData | null;
  wsConnected: boolean;
  alarms: AlarmData[];
  onLogout: () => void;
  navTitle?: string;
  activeJobName?: string | null;
  datasourceStatuses?: DatasourceStatus[];
  plcVersion?: string | null;
}

// Declarative navigation config — each item defines its URL path, icon, label,
// and which roles can see it. `roles: null` means everyone can see it.
// Items with a roles array (like 'engineer', 'designer') are hidden from users
// who don't have one of those roles. This keeps the nav clean for operators
// who don't need access to engineering tools.
const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: null },
  { to: '/trends', icon: TrendingUp, label: 'Trends', roles: null },
  { to: '/alarms', icon: Bell, label: 'Alarms', roles: null },
  { to: '/jobs', icon: ClipboardList, label: 'Jobs', roles: null },
  { to: '/reports', icon: BarChart3, label: 'Reports', roles: null },
  { to: '/projects', icon: FolderOpen, label: 'Projects', roles: ['engineer', 'designer'] as string[] },
  { to: '/settings', icon: Settings, label: 'Settings', roles: ['engineer', 'designer'] as string[] },
  { to: '/factory-config', icon: Cog, label: 'Factory Config', roles: ['engineer', 'designer'] as string[] },
  { to: '/service', icon: Wrench, label: 'Service', roles: ['engineer', 'designer'] as string[] },
  { to: '/support', icon: LifeBuoy, label: 'Support', roles: null },
];

// SeverityIcon is now imported from shared/SeverityIcon

export function AppShell({ children, user, wsConnected, alarms, onLogout, navTitle = 'HMI', activeJobName, datasourceStatuses = [], plcVersion }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('hmi_sidebar_open');
    if (saved !== null) return saved === 'true';
    // Auto-collapse on small screens (8" panels and below)
    return window.innerWidth > 1280;
  });
  const [ackingAll, setAckingAll] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    api.getVersion().then(info => setAppVersion(info.version)).catch(() => {});
  }, []);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('hmi_sidebar_open', String(sidebarOpen));
  }, [sidebarOpen]);
  const location = useLocation();

  const activeAlarms = alarms.filter(a => a.state === 'active_unacked' || a.state === 'active_acked' || a.state === 'inactive_unacked');
  const unackedAlarms = alarms.filter(a => a.state === 'active_unacked' || a.state === 'inactive_unacked');
  const activeAlarmCount = unackedAlarms.length;
  const criticalCount = unackedAlarms.filter(a => a.severity === 'critical').length;
  const warningCount = unackedAlarms.filter(a => a.severity === 'warning').length;
  const infoCount = unackedAlarms.filter(a => a.severity === 'info').length;

  const handleAcknowledgeAll = useCallback(async () => {
    if (ackingAll || unackedAlarms.length === 0) return;
    setAckingAll(true);
    try {
      await Promise.all(unackedAlarms.map(a => api.acknowledgeAlarm(a.id)));
    } catch {
      // Errors are non-fatal — some may already be acked
    } finally {
      setAckingAll(false);
    }
  }, [ackingAll, unackedAlarms]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`bg-[var(--hmi-bg-surface)] border-r border-[var(--hmi-border)] flex flex-col transition-all duration-200 ${
          sidebarOpen ? 'w-56' : 'w-16'
        }`}
      >
        <div className="flex items-center gap-2 px-4 h-14 border-b border-[var(--hmi-border)]">
          {sidebarOpen && <span className="font-bold text-[var(--hmi-accent-text)] text-lg">{navTitle}</span>}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-[var(--hmi-bg-elevated)] text-[var(--hmi-text-secondary)]"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Role-based filtering: only show nav items the current user is allowed to see.
            If roles is null, everyone sees it. Otherwise, the user's role must be in the list. */}
        <nav className="flex-1 py-2">
          {NAV_ITEMS.filter(item => !item.roles || (user && item.roles.includes(user.role))).map((item) => {
            const active = location.pathname === item.to ||
              (item.to !== '/' && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors ${
                  active
                    ? 'bg-[var(--hmi-accent-bg)] text-[var(--hmi-accent-text)]'
                    : 'text-[var(--hmi-text-secondary)] hover:bg-[var(--hmi-bg-elevated)] hover:text-[var(--hmi-text-primary)]'
                }`}
              >
                <item.icon size={20} className="shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
                {item.to === '/alarms' && activeAlarmCount > 0 && (
                  <span className={`bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full ${
                    sidebarOpen ? 'ml-auto' : 'absolute -top-1 -right-1 min-w-[18px] text-center'
                  }`}>
                    {activeAlarmCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        {appVersion && (
          <div className="px-4 py-2 border-t border-[var(--hmi-border)]" title={`HMI: v${appVersion}${plcVersion ? `\nPLC: ${plcVersion}` : ''}`}>
            {sidebarOpen ? (
              <div className="space-y-0.5">
                <div className="text-xs text-[var(--hmi-text-muted)]">HMI: v{appVersion}</div>
                {plcVersion && <div className="text-xs text-[var(--hmi-text-muted)]">PLC: {plcVersion}</div>}
              </div>
            ) : (
              <div className="text-xs text-[var(--hmi-text-muted)] text-center">v</div>
            )}
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-[var(--hmi-bg-surface)] border-b border-[var(--hmi-border)] flex items-center px-4 gap-4 shrink-0">
          {/* Data source connection status */}
          {datasourceStatuses.length > 0 ? (
            <div className="flex items-center gap-2">
              {datasourceStatuses.map((ds) => (
                <div
                  key={ds.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded border border-[var(--hmi-border-subtle)]"
                  title={`${ds.name} (${ds.protocol}) — ${ds.connected ? 'Connected' : 'Disconnected'}`}
                >
                  <Circle
                    size={8}
                    className={ds.connected ? 'fill-green-400 text-green-400' : 'fill-red-400 text-red-400'}
                  />
                  <span className="text-xs text-[var(--hmi-text-secondary)]">{ds.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Circle size={8} className="fill-[var(--hmi-text-muted)] text-[var(--hmi-text-muted)]" />
              <span className="text-xs text-[var(--hmi-text-muted)]">No data sources</span>
            </div>
          )}

          {/* Alarm badges by severity */}
          {criticalCount > 0 && (
            <Link to="/alarms" className="flex items-center gap-1.5 bg-red-500/20 text-red-400 px-3 py-2 min-h-[44px] rounded-md text-xs font-medium">
              <AlertCircle size={16} />
              {criticalCount} Alarm{criticalCount !== 1 ? 's' : ''}
            </Link>
          )}
          {warningCount > 0 && (
            <Link to="/alarms" className="flex items-center gap-1.5 bg-yellow-500/20 text-yellow-400 px-3 py-2 min-h-[44px] rounded-md text-xs font-medium">
              <AlertTriangle size={16} />
              {warningCount} Warning{warningCount !== 1 ? 's' : ''}
            </Link>
          )}
          {infoCount > 0 && (
            <Link to="/alarms" className="flex items-center gap-1.5 bg-blue-500/20 text-blue-400 px-3 py-2 min-h-[44px] rounded-md text-xs font-medium">
              <Info size={16} />
              {infoCount} Info
            </Link>
          )}

          {/* Active job */}
          {activeJobName && (
            <Link
              to="/jobs"
              className="flex items-center gap-1.5 text-sm text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] px-3 py-2 min-h-[44px] rounded border border-[var(--hmi-border-subtle)] hover:border-[var(--hmi-text-muted)] transition-colors"
            >
              <ClipboardList size={14} />
              {activeJobName}
            </Link>
          )}

          <div className="flex-1" />

          {/* User info */}
          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium text-[var(--hmi-text-primary)]">{user.display_name}</div>
                <div className="text-xs text-[var(--hmi-text-secondary)] capitalize">{user.role}</div>
              </div>
              <button
                onClick={onLogout}
                className="text-xs text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] px-3 py-2 min-h-[44px] flex items-center rounded border border-[var(--hmi-border-subtle)] hover:border-[var(--hmi-text-muted)]"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1 text-sm text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] py-2 min-h-[44px]"
            >
              <User size={16} />
              Login
            </Link>
          )}
        </header>

        {/* Active alarm banner */}
        {activeAlarms.length > 0 && (
          <div className="bg-[var(--hmi-bg-surface)]/80 border-b border-red-500/30 flex items-center shrink-0">
            {/* Scrolling alarm list */}
            <div className="min-w-0 flex-1 overflow-x-auto flex items-center gap-2 px-3 py-1.5 scrollbar-thin">
              {activeAlarms.map((alarm) => (
                <Link
                  key={alarm.id}
                  to="/alarms"
                  className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                    alarm.state === 'active_unacked'
                      ? alarm.severity === 'critical'
                        ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                        : alarm.severity === 'warning'
                          ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'
                          : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                      : 'bg-[var(--hmi-bg-input)]/50 text-[var(--hmi-text-secondary)] hover:bg-[var(--hmi-bg-input)]/70'
                  }`}
                >
                  <SeverityIcon severity={alarm.severity} />
                  <span>{alarm.message}</span>
                  {alarm.state === 'active_acked' && (
                    <span className="text-xs opacity-60 ml-1">(Acked)</span>
                  )}
                  {alarm.state === 'inactive_unacked' && (
                    <span className="text-xs opacity-60 ml-1">(Cleared)</span>
                  )}
                </Link>
              ))}
            </div>

            {/* Acknowledge All button */}
            <div className="px-3 py-1.5 border-l border-[var(--hmi-border)]/50 shrink-0">
              <button
                onClick={handleAcknowledgeAll}
                disabled={ackingAll || unackedAlarms.length === 0}
                className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                <CheckCheck size={16} />
                {ackingAll ? 'Acknowledging...' : 'Ack All'}
              </button>
            </div>
          </div>
        )}

        {/* Connection lost banner */}
        {!wsConnected && (
          <div className="bg-red-500/20 border-b border-red-500/30 px-4 py-2 text-center text-red-300 text-sm font-medium">
            Connection Lost — Attempting to reconnect...
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
