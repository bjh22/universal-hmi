import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Download, RefreshCw, Pencil, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '../lib/api';
import { SystemUpdateTab } from '../components/support/SystemUpdateTab';
import { SupportInfoTab } from '../components/support/SupportInfoTab';
import { ZplPreviewPage } from './ZplPreviewPage';
import { WidgetRenderer } from '../components/widgets/WidgetRenderer';
import { isTagVisible } from '../lib/tagVisibility';
import type { TagVisibilityMap } from '../lib/tagVisibility';
import type { ScreenData, Widget, TagValue, AlarmData, UserData, LogEntry } from '../types';

interface Props {
  user: UserData | null;
  tagValues: Record<string, TagValue>;
  alarms: AlarmData[];
  userRole?: string;
  tagVisibilityMap?: TagVisibilityMap;
}

type SupportTab = 'dashboard' | 'system-info' | 'logs' | 'update' | 'zpl-preview';

export function SupportPage({ user, tagValues, alarms, userRole, tagVisibilityMap = {} }: Props) {
  const [tab, setTab] = useState<SupportTab>('dashboard');
  const canManage = ['supervisor', 'engineer', 'designer'].includes(user?.role || '');

  const tabList: { key: SupportTab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'system-info', label: 'System Info' },
    { key: 'logs', label: 'Application Logs' },
    { key: 'update', label: 'Software Update' },
    { key: 'zpl-preview', label: 'ZPL Preview' },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--hmi-text-primary)] mb-4">Support</h1>

      <div className="flex gap-1 mb-4">
        {tabList.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-[var(--hmi-accent)] text-white' : 'bg-[var(--hmi-bg-elevated)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <SupportDashboard tagValues={tagValues} alarms={alarms} userRole={userRole} tagVisibilityMap={tagVisibilityMap} />
      )}
      {tab === 'system-info' && <SupportInfoTab />}
      {tab === 'logs' && <LogsTab />}
      {tab === 'update' && <SystemUpdateTab canManage={canManage} />}
      {tab === 'zpl-preview' && <ZplPreviewPage />}
    </div>
  );
}

// ─── Support Dashboard Tab ──────────────────────────────────────────────────

function SupportDashboard({ tagValues, alarms, userRole, tagVisibilityMap = {} }: {
  tagValues: Record<string, TagValue>;
  alarms: AlarmData[];
  userRole?: string;
  tagVisibilityMap?: TagVisibilityMap;
}) {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<ScreenData | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [creating, setCreating] = useState(false);
  const isDesigner = userRole === 'designer';

  useEffect(() => {
    api.getScreenBySlug('support')
      .then(s => {
        setScreen(s);
        setWidgets(JSON.parse(s.layout || '[]'));
      })
      .catch(() => setNotFound(true));
  }, []);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      await api.createScreen({
        name: 'Support',
        slug: 'support',
        layout: [],
        layout_mode: 'grid',
        is_default: false,
        sort_order: 999,
      });
      const s = await api.getScreenBySlug('support');
      setScreen(s);
      setWidgets(JSON.parse(s.layout || '[]'));
      setNotFound(false);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }, []);

  if (notFound) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--hmi-text-secondary)] mb-4">No support dashboard has been created yet.</p>
        {isDesigner && (
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 mx-auto px-4 py-2.5 bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            <Plus size={16} />
            {creating ? 'Creating...' : 'Create Support Dashboard'}
          </button>
        )}
      </div>
    );
  }

  if (!screen) {
    return <div className="text-sm text-[var(--hmi-text-muted)] py-4">Loading...</div>;
  }

  const topLevelWidgets = widgets.filter(w => !w.parentId);

  return (
    <div>
      {isDesigner && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => navigate('/screen/support')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--hmi-bg-elevated)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] border border-[var(--hmi-border-subtle)] transition-colors"
          >
            <Pencil size={14} />
            Edit Dashboard
          </button>
        </div>
      )}

      {topLevelWidgets.length === 0 ? (
        <div className="text-center text-[var(--hmi-text-muted)] mt-20">
          <p className="text-lg">No widgets configured</p>
          <p className="text-sm mt-1">
            {isDesigner ? 'Click "Edit Dashboard" to design this screen' : 'No widgets have been added yet'}
          </p>
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: '80px' }}
        >
          {topLevelWidgets.map((w) => {
            const visibleByProp = w.visible !== false;
            const visibleByTag = w.visibleTag ? !!tagValues[w.visibleTag]?.value : true;
            const visibleByRole = !w.visibleRoles || w.visibleRoles.length === 0 || (userRole && w.visibleRoles.includes(userRole));
            const primaryTag = (w.props as Record<string, unknown>).tag as string | undefined;
            const visibleByTagConfig = primaryTag ? isTagVisible(primaryTag, tagVisibilityMap, tagValues) : true;
            if (!visibleByProp || !visibleByTag || !visibleByRole || !visibleByTagConfig) return null;

            const enabledByProp = w.enabled !== false;
            const enabledByTag = w.enabledTag ? !!tagValues[w.enabledTag]?.value : true;
            const enabledByRole = !w.enabledRoles || w.enabledRoles.length === 0 || (userRole && w.enabledRoles.includes(userRole));
            const isEnabled = enabledByProp && enabledByTag && enabledByRole;

            return (
              <div
                key={w.id}
                style={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}
                className={isEnabled ? '' : 'opacity-50 pointer-events-none'}
              >
                <WidgetRenderer widget={w} tagValues={tagValues} alarms={alarms} tagVisibilityMap={tagVisibilityMap} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Application Logs Tab ───────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'text-slate-400 bg-slate-500/10',
  INFO: 'text-blue-400 bg-blue-500/10',
  WARNING: 'text-yellow-400 bg-yellow-500/10',
  ERROR: 'text-red-400 bg-red-500/10',
  CRITICAL: 'text-red-500 bg-red-500/15 font-bold',
};

function LogsTab() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [level, setLevel] = useState('');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async (lvl?: string, srch?: string) => {
    try {
      const params: { level?: string; search?: string; limit?: number } = { limit: 1000 };
      const l = lvl ?? level;
      const s = srch ?? search;
      if (l) params.level = l;
      if (s) params.search = s;
      const result = await api.getLogs(params);
      setEntries(result.entries);
      setTotal(result.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [level, search]);

  // Fetch on mount and whenever filters change
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchLogs(), 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const handleLevelChange = useCallback((newLevel: string) => {
    setLevel(newLevel);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleExport = useCallback(async () => {
    const params: { level?: string; search?: string } = {};
    if (level) params.level = level;
    if (search) params.search = search;
    await api.exportLogsCsv(params);
  }, [level, search]);

  const formatTimestamp = useCallback((iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hmi-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search logs..."
            className="w-full pl-9 pr-3 py-2 bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] text-[var(--hmi-text-primary)] rounded-lg text-sm placeholder:text-[var(--hmi-text-muted)]"
          />
        </div>

        {/* Level filter */}
        <select
          value={level}
          onChange={e => handleLevelChange(e.target.value)}
          className="px-3 py-2 bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] text-[var(--hmi-text-primary)] rounded-lg text-sm"
        >
          <option value="">All Levels</option>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>

        {/* Auto-refresh toggle */}
        <button
          onClick={() => setAutoRefresh(a => !a)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            autoRefresh
              ? 'bg-[var(--hmi-accent)]/10 border-[var(--hmi-accent)]/30 text-[var(--hmi-accent)]'
              : 'bg-[var(--hmi-bg-input)] border-[var(--hmi-border-subtle)] text-[var(--hmi-text-secondary)]'
          }`}
          title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh (5s)'}
        >
          {autoRefresh ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          Auto
        </button>

        {/* Manual refresh */}
        <button
          onClick={() => fetchLogs()}
          className="flex items-center gap-1.5 px-3 py-2 bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] rounded-lg text-sm transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>

        {/* Export */}
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] rounded-lg text-sm transition-colors"
          title="Export CSV"
        >
          <Download size={14} />
          Export
        </button>

        <span className="text-xs text-[var(--hmi-text-muted)] ml-auto">
          {total} entries
        </span>
      </div>

      {/* Log table */}
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[var(--hmi-bg-elevated)] border-b border-[var(--hmi-border)]">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--hmi-text-muted)] uppercase tracking-wider w-44">Time</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--hmi-text-muted)] uppercase tracking-wider w-24">Level</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--hmi-text-muted)] uppercase tracking-wider w-48">Logger</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--hmi-text-muted)] uppercase tracking-wider">Message</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[var(--hmi-text-muted)]">Loading...</td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[var(--hmi-text-muted)]">No log entries found</td>
                </tr>
              ) : entries.map((entry, i) => (
                <tr key={i} className="border-b border-[var(--hmi-border)]/50 hover:bg-[var(--hmi-bg-base)]/50">
                  <td className="px-4 py-1.5 text-xs text-[var(--hmi-text-muted)] font-mono whitespace-nowrap">
                    {formatTimestamp(entry.timestamp)}
                  </td>
                  <td className="px-4 py-1.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[entry.level] || 'text-[var(--hmi-text-secondary)]'}`}>
                      {entry.level}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-xs text-[var(--hmi-text-secondary)] font-mono truncate max-w-[200px]" title={entry.logger_name}>
                    {entry.logger_name}
                  </td>
                  <td className="px-4 py-1.5 text-xs text-[var(--hmi-text-primary)] font-mono break-all">
                    {entry.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
