/**
 * AppShell — the main application layout wrapper that provides the persistent
 * UI chrome around every page: sidebar navigation, top header bar with inline
 * alarm display, and WebSocket connection status indicator.
 *
 * Every page except Login is rendered inside this shell. The `children` prop
 * receives the current page content (Dashboard, Alarms, Trends, etc.) and
 * renders it in the main content area.
 *
 * Key features:
 *   - Sidebar navigation with role-based filtering (operators see fewer pages)
 *   - Inline alarm display in header: scrollable alarm pills with "Ack All"
 *   - User info and system controls in sidebar footer
 *   - Collapsible sidebar for more screen real estate
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, TrendingUp, Bell, ClipboardList, BarChart3,
  Settings, User, Menu, X, FolderOpen, CheckCheck,
  Cog, LifeBuoy, Wrench,
  Minus, Power, LogOut, LogIn,
  Play, RotateCcw, Activity,
} from 'lucide-react';
import type { UserData, AlarmData, DatasourceStatus, TagValue, ProductionSettings } from '../../types';
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
  tagValues?: Record<string, TagValue>;
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

/** Auto-scrolling alarm marquee — duplicates the list so it loops seamlessly.
 *  Pauses on hover/touch so users can tap an alarm to navigate. */
function AlarmMarquee({ alarms }: { alarms: AlarmData[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = useState(false);
  const [paused, setPaused] = useState(false);

  // Check if content overflows the container
  useEffect(() => {
    const check = () => {
      if (containerRef.current && innerRef.current) {
        setNeedsScroll(innerRef.current.scrollWidth > containerRef.current.clientWidth);
      }
    };
    check();
    // Re-check when alarms change
    const timer = setTimeout(check, 100);
    return () => clearTimeout(timer);
  }, [alarms]);

  const alarmPill = (alarm: AlarmData, keySuffix: string) => (
    <Link
      key={`${alarm.id}-${keySuffix}`}
      to="/alarms"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-base font-medium whitespace-nowrap shrink-0 transition-colors ${
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
        <span className="text-xs opacity-60 ml-0.5">(Acked)</span>
      )}
      {alarm.state === 'inactive_unacked' && (
        <span className="text-xs opacity-60 ml-0.5">(Cleared)</span>
      )}
    </Link>
  );

  return (
    <div
      ref={containerRef}
      className="min-w-0 flex-1 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <div
        ref={innerRef}
        className={`flex items-center gap-1.5 ${needsScroll ? 'alarm-marquee' : ''}`}
        style={needsScroll ? { animationPlayState: paused ? 'paused' : 'running' } : undefined}
      >
        {alarms.map(a => alarmPill(a, 'a'))}
        {/* Duplicate for seamless loop */}
        {needsScroll && alarms.map(a => alarmPill(a, 'b'))}
      </div>
    </div>
  );
}

/** Machine status color mapping — maps common PLC state strings/values to colors. */
function getStatusStyle(value: unknown): { bg: string; text: string; label: string } {
  const s = String(value).toLowerCase().trim();
  if (['running', 'cycling', 'auto', '1', 'true'].includes(s))
    return { bg: 'bg-green-500/20', text: 'text-green-300', label: String(value) };
  if (['faulted', 'fault', 'error', 'alarm'].includes(s))
    return { bg: 'bg-red-500/20', text: 'text-red-300', label: String(value) };
  if (['idle', 'standby', 'waiting'].includes(s))
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-300', label: String(value) };
  if (['stopped', 'off', '0', 'false'].includes(s))
    return { bg: 'bg-slate-500/20', text: 'text-slate-300', label: String(value) };
  return { bg: 'bg-slate-500/20', text: 'text-slate-300', label: String(value) };
}

/** Top bar controls — machine status indicator + cycle start / reset buttons.
 *  Shown when no alarms are active. Fetches production settings on mount to
 *  determine which tags to display. */
function TopBarControls({ tagValues }: { tagValues?: Record<string, TagValue> }) {
  const [settings, setSettings] = useState<ProductionSettings | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    api.getProductionSettings().then(setSettings).catch(() => {});
  }, []);

  const handleWrite = useCallback(async (tagName: string) => {
    if (pending) return;
    setPending(tagName);
    try {
      await api.writeTag(tagName, true);
    } catch {
      // Write errors are non-fatal
    } finally {
      setPending(null);
    }
  }, [pending]);

  if (!settings) return <div className="flex-1" />;

  const { machine_status_tag, cycle_start_tag, reset_tag } = settings;
  const hasAny = machine_status_tag || cycle_start_tag || reset_tag;
  if (!hasAny) return <div className="flex-1" />;

  const statusValue = machine_status_tag && tagValues?.[machine_status_tag]?.value;
  const statusStyle = statusValue != null ? getStatusStyle(statusValue) : null;

  return (
    <div className="flex-1 flex items-center gap-3">
      {/* Machine status pill */}
      {machine_status_tag && (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium ${
          statusStyle ? `${statusStyle.bg} ${statusStyle.text}` : 'bg-slate-500/20 text-slate-400'
        }`}>
          <Activity size={14} />
          <span>{statusStyle ? statusStyle.label : '---'}</span>
        </div>
      )}

      {/* Spacer to push buttons right */}
      <div className="flex-1" />

      {/* Cycle Start button */}
      {cycle_start_tag && (
        <button
          onClick={() => handleWrite(cycle_start_tag)}
          disabled={pending === cycle_start_tag}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-green-500/40 text-green-400 hover:bg-green-500/15 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors shrink-0"
        >
          <Play size={14} />
          Cycle Start
        </button>
      )}

      {/* Reset button */}
      {reset_tag && (
        <button
          onClick={() => handleWrite(reset_tag)}
          disabled={pending === reset_tag}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-blue-500/40 text-blue-400 hover:bg-blue-500/15 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors shrink-0"
        >
          <RotateCcw size={14} />
          Reset
        </button>
      )}
    </div>
  );
}

export function AppShell({ children, user, wsConnected, alarms, onLogout, navTitle = 'HMI', activeJobName, datasourceStatuses: _ds = [], plcVersion, tagValues }: AppShellProps) {
  void _ds; // Datasource statuses are now shown on the Support page, but prop kept for API compat
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

  // Screen tint: red for unacked critical, yellow for unacked warning
  const hasUnackedCritical = alarms.some(a => a.state === 'active_unacked' && a.severity === 'critical');
  const hasUnackedWarning = alarms.some(a => a.state === 'active_unacked' && a.severity === 'warning');
  const tintClass = hasUnackedCritical
    ? 'bg-red-500/10'
    : hasUnackedWarning
      ? 'bg-amber-500/10'
      : null;

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

  const canManageSystem = user && (user.role === 'engineer' || user.role === 'designer');

  const handleMinimize = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    window.blur();
  }, []);

  const handleClose = useCallback(async () => {
    const confirmed = window.confirm(
      'Are you sure you want to shut down the HMI application?\n\nThis will stop the server and close the browser window.'
    );
    if (!confirmed) return;
    try {
      await api.shutdownSystem();
    } catch {
      // Server may already be terminating
    }
    window.close();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`bg-[var(--hmi-bg-surface)] border-r border-[var(--hmi-border)] flex flex-col transition-all duration-200 ${
          sidebarOpen ? 'w-56' : 'w-20'
        }`}
      >
        <div className={`flex items-center ${sidebarOpen ? 'gap-2 px-4' : 'justify-center px-2'} h-14 border-b border-[var(--hmi-border)]`}>
          {sidebarOpen && <span className="font-bold text-[var(--hmi-accent-text)] text-lg">{navTitle}</span>}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`${sidebarOpen ? 'ml-auto' : ''} p-2.5 min-w-[48px] min-h-[48px] flex items-center justify-center rounded-md hover:bg-[var(--hmi-bg-elevated)] text-[var(--hmi-text-secondary)]`}
          >
            {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Role-based filtering: only show nav items the current user is allowed to see.
            If roles is null, everyone sees it. Otherwise, the user's role must be in the list. */}
        <nav className="flex-1 py-2 overflow-y-auto min-h-0">
          {NAV_ITEMS.filter(item => !item.roles || (user && item.roles.includes(user.role))).map((item) => {
            const active = location.pathname === item.to ||
              (item.to !== '/' && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative flex items-center rounded-lg transition-colors ${
                  sidebarOpen
                    ? 'gap-3 px-4 py-3 mx-2'
                    : 'justify-center mx-auto w-[64px] h-[64px]'
                } ${
                  active
                    ? 'bg-[var(--hmi-accent-bg)] text-[var(--hmi-accent-text)]'
                    : 'text-[var(--hmi-text-secondary)] hover:bg-[var(--hmi-bg-elevated)] hover:text-[var(--hmi-text-primary)]'
                }`}
              >
                <item.icon size={sidebarOpen ? 20 : 28} className="shrink-0" />
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

        {/* User info / Login — sidebar bottom */}
        <div className="border-t border-[var(--hmi-border)] px-2 py-2">
          {user ? (
            sidebarOpen ? (
              <div className="px-2">
                <div className="flex items-center gap-2 mb-2">
                  <User size={16} className="text-[var(--hmi-text-secondary)] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--hmi-text-primary)] truncate">{user.display_name}</div>
                    <div className="text-xs text-[var(--hmi-text-secondary)] capitalize">{user.role}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={onLogout}
                    title="Logout"
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 min-h-[40px] rounded text-xs text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border-subtle)]"
                  >
                    <LogOut size={14} />
                    Logout
                  </button>
                  {canManageSystem && (
                    <>
                      <button
                        onClick={handleMinimize}
                        title="Minimize"
                        className="flex items-center justify-center min-w-[40px] min-h-[40px] rounded text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border-subtle)]"
                      >
                        <Minus size={14} />
                      </button>
                      <button
                        onClick={handleClose}
                        title="Shut Down"
                        className="flex items-center justify-center min-w-[40px] min-h-[40px] rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30"
                      >
                        <Power size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-xs text-[var(--hmi-text-muted)] truncate text-center" title={`${user.display_name} (${user.role})`}>
                  <User size={16} className="mx-auto text-[var(--hmi-text-secondary)]" />
                </div>
                <button
                  onClick={onLogout}
                  title={`Logout (${user.display_name})`}
                  className="flex items-center justify-center w-[48px] h-[48px] rounded text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-bg-elevated)]"
                >
                  <LogOut size={20} />
                </button>
                {canManageSystem && (
                  <>
                    <button
                      onClick={handleMinimize}
                      title="Minimize"
                      className="flex items-center justify-center w-[48px] h-[48px] rounded text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-bg-elevated)]"
                    >
                      <Minus size={20} />
                    </button>
                    <button
                      onClick={handleClose}
                      title="Shut Down"
                      className="flex items-center justify-center w-[48px] h-[48px] rounded text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Power size={20} />
                    </button>
                  </>
                )}
              </div>
            )
          ) : (
            /* Not logged in — show Login button */
            sidebarOpen ? (
              <Link
                to="/login"
                className="flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded text-sm font-medium text-[var(--hmi-accent-text)] bg-[var(--hmi-accent-bg)] hover:bg-[var(--hmi-accent-bg-hover)] transition-colors mx-1"
              >
                <LogIn size={18} />
                Login
              </Link>
            ) : (
              <Link
                to="/login"
                title="Login"
                className="flex items-center justify-center w-[56px] h-[56px] mx-auto rounded text-[var(--hmi-accent-text)] bg-[var(--hmi-accent-bg)] hover:bg-[var(--hmi-accent-bg-hover)] transition-colors"
              >
                <LogIn size={24} />
              </Link>
            )
          )}
        </div>

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
        {/* Top bar — compact header with inline alarm display */}
        <header className="h-14 bg-[var(--hmi-bg-surface)] border-b border-[var(--hmi-border)] flex items-center px-3 gap-2 shrink-0">
          {/* Active job */}
          {activeJobName && (
            <Link
              to="/jobs"
              className="flex items-center gap-1.5 text-sm text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] px-2 py-1.5 rounded border border-[var(--hmi-border-subtle)] hover:border-[var(--hmi-text-muted)] transition-colors shrink-0"
            >
              <ClipboardList size={14} />
              {activeJobName}
            </Link>
          )}

          {/* Inline alarm display — auto-scrolling marquee that loops when overflowing */}
          {activeAlarms.length > 0 ? (
            <AlarmMarquee alarms={activeAlarms} />
          ) : (
            <TopBarControls tagValues={tagValues} />
          )}

          {/* Acknowledge All button — only when unacked alarms exist */}
          {unackedAlarms.length > 0 && (
            <button
              onClick={handleAcknowledgeAll}
              disabled={ackingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shrink-0"
            >
              <CheckCheck size={14} />
              {ackingAll ? 'Acking...' : 'Ack All'}
            </button>
          )}
        </header>

        {/* Connection lost banner */}
        {!wsConnected && (
          <div className="bg-red-500/20 border-b border-red-500/30 px-4 py-2 text-center text-red-300 text-sm font-medium">
            Connection Lost — Attempting to reconnect...
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4" style={{ touchAction: 'pan-y pinch-zoom' }}>
          {children}
        </main>
      </div>

      {/* Alarm severity tint — full-screen color wash for at-a-glance awareness */}
      {tintClass && (
        <div className={`fixed inset-0 z-40 pointer-events-none transition-colors duration-500 ${tintClass}`} />
      )}
    </div>
  );
}
