import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, TrendingUp, Bell, ClipboardList, BarChart3,
  Settings, User, Menu, X, Wifi, WifiOff, ChevronRight,
} from 'lucide-react';
import type { UserData, AlarmData } from '../../types';

interface AppShellProps {
  children: React.ReactNode;
  user: UserData | null;
  wsConnected: boolean;
  activeAlarmCount: number;
  onLogout: () => void;
}

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/trends', icon: TrendingUp, label: 'Trends' },
  { to: '/alarms', icon: Bell, label: 'Alarms' },
  { to: '/jobs', icon: ClipboardList, label: 'Jobs' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function AppShell({ children, user, wsConnected, activeAlarmCount, onLogout }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`bg-slate-900 border-r border-slate-700 flex flex-col transition-all duration-200 ${
          sidebarOpen ? 'w-56' : 'w-16'
        }`}
      >
        <div className="flex items-center gap-2 px-4 h-14 border-b border-slate-700">
          {sidebarOpen && <span className="font-bold text-blue-400 text-lg">HMI</span>}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto p-1.5 rounded-md hover:bg-slate-800 text-slate-400"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <nav className="flex-1 py-2">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.to ||
              (item.to !== '/' && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-colors ${
                  active
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <item.icon size={20} />
                {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
                {item.to === '/alarms' && activeAlarmCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {activeAlarmCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-slate-900 border-b border-slate-700 flex items-center px-4 gap-4 shrink-0">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            {wsConnected ? (
              <Wifi size={16} className="text-green-400" />
            ) : (
              <WifiOff size={16} className="text-red-400" />
            )}
            <span className={`text-xs ${wsConnected ? 'text-green-400' : 'text-red-400'}`}>
              {wsConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* Alarm badge */}
          {activeAlarmCount > 0 && (
            <Link to="/alarms" className="flex items-center gap-1.5 bg-red-500/20 text-red-400 px-2.5 py-1 rounded-md text-xs font-medium">
              <Bell size={14} />
              {activeAlarmCount} Active Alarm{activeAlarmCount !== 1 ? 's' : ''}
            </Link>
          )}

          <div className="flex-1" />

          {/* User info */}
          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium text-slate-200">{user.display_name}</div>
                <div className="text-xs text-slate-400 capitalize">{user.role}</div>
              </div>
              <button
                onClick={onLogout}
                className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-600 hover:border-slate-500"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
            >
              <User size={16} />
              Login
            </Link>
          )}
        </header>

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
