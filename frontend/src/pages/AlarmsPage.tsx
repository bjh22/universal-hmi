import { useEffect, useState, useMemo, useCallback } from 'react';
import { Bell, Check, CheckCheck, AlertTriangle, Info, Download, Search, ArrowUpDown } from 'lucide-react';
import { api } from '../lib/api';
import type { AlarmData } from '../types';

interface Props {
  realtimeAlarms: AlarmData[];
}

type SortField = 'severity' | 'triggered_at' | 'tag_name' | 'message';
type SortDir = 'asc' | 'desc';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

const PAGE_SIZE = 100;

export function AlarmsPage({ realtimeAlarms }: Props) {
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [activeAlarms, setActiveAlarms] = useState<AlarmData[]>([]);
  const [historyAlarms, setHistoryAlarms] = useState<AlarmData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('triggered_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (tab === 'active') {
      api.getActiveAlarms().then(setActiveAlarms).catch(() => {});
    } else {
      api.getAlarmHistory().then(setHistoryAlarms).catch(() => {});
    }
  }, [tab]);

  // Merge realtime alarms and deduplicate by id
  const deduped = useMemo(() => {
    const rawAlarms = tab === 'active'
      ? [...realtimeAlarms.filter(a => a.state !== 'inactive'), ...activeAlarms.filter(a => a.state !== 'inactive')]
      : historyAlarms;
    const map = new Map<number, AlarmData>();
    for (const a of rawAlarms) {
      if (a.id) map.set(a.id, a);
    }
    return Array.from(map.values());
  }, [tab, realtimeAlarms, activeAlarms, historyAlarms]);

  // Filter
  const filtered = useMemo(() => {
    return deduped.filter(a => {
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (a.message?.toLowerCase().includes(q) ||
                a.tag_name?.toLowerCase().includes(q) ||
                a.tag_display_name?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [deduped, severityFilter, searchQuery]);

  // Sort
  const displayAlarms = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'severity':
          cmp = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
          break;
        case 'triggered_at':
          cmp = new Date(a.triggered_at).getTime() - new Date(b.triggered_at).getTime();
          break;
        case 'tag_name':
          cmp = (a.tag_display_name || a.tag_name || '').localeCompare(b.tag_display_name || b.tag_name || '');
          break;
        case 'message':
          cmp = (a.message || '').localeCompare(b.message || '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const handleAck = async (id: number) => {
    await api.acknowledgeAlarm(id);
    setActiveAlarms(prev => prev.reduce<AlarmData[]>((acc, a) => {
      if (a.id !== id) { acc.push(a); return acc; }
      // inactive_unacked → inactive: remove from active list entirely
      if (a.state === 'inactive_unacked') return acc;
      acc.push({ ...a, state: 'active_acked' as const });
      return acc;
    }, []));
  };

  const handleAckAll = useCallback(async () => {
    const unacked = displayAlarms.filter(a => (a.state === 'active_unacked' || a.state === 'inactive_unacked') && a.id);
    if (unacked.length === 0) return;
    if (!window.confirm(`Acknowledge all ${unacked.length} unacknowledged alarm(s)?`)) return;
    await Promise.all(unacked.map(a => api.acknowledgeAlarm(a.id)));
    setActiveAlarms(prev => prev.reduce<AlarmData[]>((acc, a) => {
      if (a.state === 'active_unacked') { acc.push({ ...a, state: 'active_acked' as const }); return acc; }
      if (a.state === 'inactive_unacked') return acc; // remove from active list
      acc.push(a);
      return acc;
    }, []));
  }, [displayAlarms]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const exportCsv = useCallback(() => {
    const header = 'Severity,State,Tag,Display Name,Message,Triggered At,Acknowledged At,Acknowledged By,Trigger Value';
    const rows = displayAlarms.map(a =>
      [a.severity, a.state, a.tag_name || '', a.tag_display_name || '', `"${(a.message || '').replace(/"/g, '""')}"`,
       a.triggered_at, a.acknowledged_at || '', a.acknowledged_by || '', a.trigger_value || ''].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `alarms_${tab}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [displayAlarms, tab]);

  const severityIcon = (sev: string) => {
    switch (sev) {
      case 'critical': return <AlertTriangle size={16} className="text-red-400" />;
      case 'warning': return <AlertTriangle size={16} className="text-yellow-400" />;
      default: return <Info size={16} className="text-blue-400" />;
    }
  };

  const severityBg = (sev: string) => {
    switch (sev) {
      case 'critical': return 'border-l-red-500 bg-red-500/5';
      case 'warning': return 'border-l-yellow-500 bg-yellow-500/5';
      default: return 'border-l-blue-500 bg-blue-500/5';
    }
  };

  const unackedCount = displayAlarms.filter(a => a.state === 'active_unacked' || a.state === 'inactive_unacked').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-100">Alarms</h1>
        <div className="flex gap-2">
          {tab === 'active' && unackedCount > 0 && (
            <button
              onClick={handleAckAll}
              className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded-lg text-sm font-medium"
            >
              <CheckCheck size={16} /> Acknowledge All ({unackedCount})
            </button>
          )}
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('active')}
          className={`px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
            tab === 'active' ? 'bg-[var(--hmi-accent)] text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
            tab === 'history' ? 'bg-[var(--hmi-accent)] text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          History
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search alarms..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:border-blue-500"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
      </div>

      {/* Sortable column headers */}
      <div className="flex gap-3 px-3 py-2 text-xs text-slate-500 font-medium uppercase mb-1">
        {([['severity', 'Severity'], ['triggered_at', 'Time'], ['tag_name', 'Source'], ['message', 'Message']] as [SortField, string][]).map(([field, label]) => (
          <button
            key={field}
            onClick={() => handleSort(field)}
            className={`flex items-center gap-1 hover:text-slate-300 ${field === 'message' ? 'flex-1' : ''} ${field === 'severity' ? 'w-24' : field === 'triggered_at' ? 'w-40' : field === 'tag_name' ? 'w-32' : ''}`}
          >
            {label}
            {sortField === field && <ArrowUpDown size={12} className="text-blue-400" />}
          </button>
        ))}
      </div>

      {/* Alarm list */}
      <div className="space-y-2">
        {displayAlarms.slice(0, visibleCount).map((alarm, i) => (
          <div
            key={alarm.id || i}
            className={`flex items-center gap-3 p-3 rounded-lg border-l-4 ${severityBg(alarm.severity)}`}
          >
            {severityIcon(alarm.severity)}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-200">{alarm.message}</div>
              <div className="text-xs text-slate-400">
                {new Date(alarm.triggered_at).toLocaleString()}
                {(alarm.tag_display_name || alarm.tag_name) && ` \u2022 ${alarm.tag_display_name || alarm.tag_name}`}
                {alarm.trigger_value && ` \u2022 Value: ${alarm.trigger_value}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(alarm.state === 'active_unacked' || alarm.state === 'inactive_unacked') && (
                <button
                  onClick={() => alarm.id && handleAck(alarm.id)}
                  className="flex items-center gap-1 px-4 py-2.5 min-h-[44px] bg-slate-700 hover:bg-slate-600 rounded-md text-xs text-slate-200"
                >
                  <Check size={14} /> Acknowledge
                </button>
              )}
              {alarm.state === 'inactive_unacked' && (
                <span className="text-xs text-orange-400">Cleared</span>
              )}
              {alarm.state === 'active_acked' && (
                <span className="text-xs text-green-400">Acknowledged</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded uppercase font-medium ${
                alarm.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                alarm.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {alarm.severity}
              </span>
            </div>
          </div>
        ))}
        {displayAlarms.length > visibleCount && (
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="w-full py-3 text-sm text-blue-400 hover:text-blue-300 bg-slate-800/50 rounded-lg"
          >
            Show more ({displayAlarms.length - visibleCount} remaining)
          </button>
        )}
        {displayAlarms.length === 0 && (
          <div className="text-center text-slate-500 py-12">
            <Bell size={32} className="mx-auto mb-2 opacity-50" />
            <p>No {tab} alarms{searchQuery || severityFilter !== 'all' ? ' matching filters' : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}
