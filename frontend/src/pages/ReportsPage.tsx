import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  BarChart3, Download, Play, Square, Plus, Pencil, Trash2, Clock, ChevronLeft, AlertTriangle,
} from 'lucide-react';
import { api } from '../lib/api';
import { Dialog } from '../components/Dialog';
import { StartRunDialog } from '../components/reports/StartRunDialog';
import { StopRunDialog } from '../components/reports/StopRunDialog';
import { DowntimeDialog } from '../components/reports/DowntimeDialog';
import { OEETrendChart } from '../components/reports/OEETrendChart';
import { ProductionTrendChart } from '../components/reports/ProductionTrendChart';
import { DowntimePareto } from '../components/reports/DowntimePareto';
import type { ProductionRun, DowntimeEvent, DowntimeSummary, TimeSeriesPoint, ReasonCode, JobData, UserData, ProductionSettings } from '../types';

const OEE_COLORS = { good: '#22c55e', warning: '#f59e0b', bad: '#ef4444' };
function oeeColor(pct: number) { return pct >= 85 ? OEE_COLORS.good : pct >= 60 ? OEE_COLORS.warning : OEE_COLORS.bad; }

type Granularity = 'day' | 'week' | 'month';
type DisplayMode = 'count' | 'rate';

function computeRate(count: number, startTime: string, endTime: string | null): number {
  const endMs = endTime ? new Date(endTime).getTime() : Date.now();
  const hours = (endMs - new Date(startTime).getTime()) / 3600000;
  return hours > 0 ? Math.round(count / hours) : 0;
}

const DATE_PRESETS: { label: string; getRange: () => { start?: string; end?: string } }[] = [
  { label: 'Today', getRange: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return { start: d.toISOString() }; } },
  { label: 'This Week', getRange: () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); d.setHours(0, 0, 0, 0); return { start: d.toISOString() }; } },
  { label: 'Last 7 Days', getRange: () => { const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0); return { start: d.toISOString() }; } },
  { label: 'This Month', getRange: () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return { start: d.toISOString() }; } },
  { label: 'All', getRange: () => ({}) },
];

function formatDuration(start: string, end: string | null): string {
  if (!end) return 'Running';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Props {
  user: UserData | null;
}

export function ReportsPage({ user }: Props) {
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('count');

  // Date filtering
  const [dateStart, setDateStart] = useState<string | undefined>();
  const [dateEnd, setDateEnd] = useState<string | undefined>();
  const [activePreset, setActivePreset] = useState('All');

  // Selection & detail
  const [selectedRun, setSelectedRun] = useState<ProductionRun | null>(null);
  const [downtimeEvents, setDowntimeEvents] = useState<DowntimeEvent[]>([]);

  // Analytics data
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [downtimeSummary, setDowntimeSummary] = useState<DowntimeSummary[]>([]);

  // Reference data
  const [reasonCodes, setReasonCodes] = useState<ReasonCode[]>([]);
  const [jobs, setJobs] = useState<JobData[]>([]);

  // Shift mode
  const [shiftMode, setShiftMode] = useState<ProductionSettings['shift_mode']>('manual');

  // Dialogs
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showStopDialog, setShowStopDialog] = useState(false);
  const [showDowntimeDialog, setShowDowntimeDialog] = useState(false);
  const [downtimeRunOverride, setDowntimeRunOverride] = useState<ProductionRun | null>(null);
  const [editingDowntime, setEditingDowntime] = useState<DowntimeEvent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Roles
  const userRole = user?.role || '';
  const canStartStop = ['operator', 'supervisor', 'engineer', 'designer'].includes(userRole);
  const canEdit = ['supervisor', 'engineer', 'designer'].includes(userRole);
  const canDelete = ['engineer', 'designer'].includes(userRole);

  // ---- Data loading ----
  const loadRuns = useCallback(() => {
    api.getProductionRuns({ start: dateStart, end: dateEnd })
      .then(setRuns)
      .catch(() => {});
  }, [dateStart, dateEnd]);

  const loadAnalytics = useCallback(() => {
    api.getProductionTimeSeries({ start: dateStart, end: dateEnd, granularity })
      .then(setTimeSeries)
      .catch(() => {});
    api.getDowntimeSummary({ start: dateStart, end: dateEnd })
      .then(setDowntimeSummary)
      .catch(() => {});
  }, [dateStart, dateEnd, granularity]);

  useEffect(() => { loadRuns(); loadAnalytics(); }, [loadRuns, loadAnalytics]);

  // Auto-refresh while page is open
  useEffect(() => {
    const id = setInterval(() => { loadRuns(); loadAnalytics(); }, 5000);
    return () => clearInterval(id);
  }, [loadRuns, loadAnalytics]);

  useEffect(() => {
    api.getJobs().then(setJobs).catch(() => {});
    api.getReasonCodes(true).then(setReasonCodes).catch(() => {});
    api.getProductionSettings().then(s => setShiftMode(s.shift_mode)).catch(() => {});
  }, []);

  const loadDowntime = useCallback(() => {
    if (selectedRun) {
      api.getDowntimeEvents(selectedRun.id).then(setDowntimeEvents).catch(() => {});
    } else {
      setDowntimeEvents([]);
    }
  }, [selectedRun]);

  useEffect(() => { loadDowntime(); }, [loadDowntime]);

  // Auto-refresh downtime events for selected run
  useEffect(() => {
    if (!selectedRun) return;
    const id = setInterval(loadDowntime, 5000);
    return () => clearInterval(id);
  }, [selectedRun, loadDowntime]);

  // Keep selectedRun fresh when runs reload
  useEffect(() => {
    if (selectedRun) {
      const fresh = runs.find(r => r.id === selectedRun.id);
      if (fresh) setSelectedRun(fresh);
      else setSelectedRun(null);
    }
  }, [runs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Computed ----
  const activeRun = useMemo(() => runs.find(r => !r.end_time) ?? null, [runs]);

  // The run to use for the downtime dialog — prefer override (header button), else selected run
  const downtimeTargetRun = downtimeRunOverride || selectedRun;

  const summaryData = useMemo(() => {
    if (runs.length === 0) return null;
    const totalGood = runs.reduce((s, r) => s + r.good_count, 0);
    const totalReject = runs.reduce((s, r) => s + r.reject_count, 0);
    const withOee = runs.filter(r => r.oee != null);
    const avgOee = withOee.length > 0 ? withOee.reduce((s, r) => s + (r.oee || 0), 0) / withOee.length : 0;
    const totalDowntime = downtimeSummary.reduce((s, d) => s + d.total_duration, 0);
    const totalDurationHours = runs.reduce((s, r) => {
      const endMs = r.end_time ? new Date(r.end_time).getTime() : Date.now();
      return s + (endMs - new Date(r.start_time).getTime()) / 3600000;
    }, 0);
    const avgGoodRate = totalDurationHours > 0 ? Math.round(totalGood / totalDurationHours) : 0;
    const avgRejectRate = totalDurationHours > 0 ? Math.round(totalReject / totalDurationHours) : 0;
    return {
      totalRuns: runs.length,
      totalGood,
      totalReject,
      avgGoodRate,
      avgRejectRate,
      avgOee: +(avgOee * 100).toFixed(1),
      yieldRate: totalGood + totalReject > 0 ? +((totalGood / (totalGood + totalReject)) * 100).toFixed(1) : 0,
      totalDowntime: Math.round(totalDowntime / 60),
    };
  }, [runs, downtimeSummary]);

  // ---- Handlers ----
  const handlePreset = useCallback((label: string) => {
    setActivePreset(label);
    const preset = DATE_PRESETS.find(p => p.label === label);
    if (preset) {
      const range = preset.getRange();
      setDateStart(range.start);
      setDateEnd(range.end);
    }
  }, []);

  const exportCsv = useCallback(() => {
    const isRate = displayMode === 'rate';
    const header = isRate
      ? 'Job,Start,End,Good (packs/hr),Reject (packs/hr),Target,Availability,Performance,Quality,OEE,Shift'
      : 'Job,Start,End,Good,Reject,Target,Availability,Performance,Quality,OEE,Shift';
    const rows = runs.map(r => {
      const good = isRate ? computeRate(r.good_count, r.start_time, r.end_time) : r.good_count;
      const reject = isRate ? computeRate(r.reject_count, r.start_time, r.end_time) : r.reject_count;
      return [r.job_name || '', r.start_time, r.end_time || '', good, reject,
       r.target_count ?? '', r.availability ?? '', r.performance ?? '', r.quality ?? '', r.oee ?? '', r.shift || ''].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `production_report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [runs, displayMode]);

  const handleDeleteRun = useCallback(async (id: number) => {
    await api.deleteProductionRun(id);
    setConfirmDelete(null);
    if (selectedRun?.id === id) setSelectedRun(null);
    loadRuns();
    loadAnalytics();
  }, [selectedRun, loadRuns, loadAnalytics]);

  const refreshAll = useCallback(() => {
    loadRuns();
    loadAnalytics();
  }, [loadRuns, loadAnalytics]);

  // ---- OEE metric card ----
  const oeeCard = useCallback((label: string, value: number | null) => {
    const pct = value != null ? +(value * 100).toFixed(1) : null;
    return (
      <div className="bg-slate-700/50 rounded-lg p-3">
        <div className="text-xs text-slate-400 uppercase font-medium">{label}</div>
        <div className="text-xl font-bold mt-1" style={pct != null ? { color: oeeColor(pct) } : undefined}>
          {pct != null ? `${pct}%` : '\u2014'}
        </div>
      </div>
    );
  }, []);

  // ---- Detail panel ----
  const detailPanel = selectedRun && (
    <div className="w-[420px] flex-shrink-0 bg-slate-800 rounded-xl border border-slate-700 p-4 overflow-y-auto max-h-[calc(100vh-180px)]">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setSelectedRun(null)} className="text-slate-400 hover:text-white active:text-white p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ChevronLeft size={20} />
        </button>
        <h3 className="text-sm font-bold text-white flex-1 ml-1">Run Details</h3>
        {canStartStop && !selectedRun.end_time && (
          <button
            onClick={() => setShowStopDialog(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-lg text-sm font-medium min-h-[44px]"
          >
            <Square size={14} /> Stop
          </button>
        )}
      </div>

      {/* Header info */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Job</span>
          <span className="text-slate-200">{selectedRun.job_name || '\u2014'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Shift</span>
          <span className="text-slate-200">{selectedRun.shift || '\u2014'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Status</span>
          <span className={`font-medium ${selectedRun.end_time ? 'text-slate-300' : 'text-green-400'}`}>
            {selectedRun.end_time ? 'Completed' : 'Running'}
          </span>
        </div>
        {selectedRun.good_count_tag && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Count Tag</span>
            <span className="text-slate-200 font-mono text-xs">{selectedRun.good_count_tag}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Start</span>
          <span className="text-slate-200">{new Date(selectedRun.start_time).toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">End</span>
          <span className="text-slate-200">{selectedRun.end_time ? new Date(selectedRun.end_time).toLocaleString() : '\u2014'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Duration</span>
          <span className="text-slate-200 flex items-center gap-1">
            <Clock size={13} className="text-slate-500" />
            {formatDuration(selectedRun.start_time, selectedRun.end_time)}
          </span>
        </div>
      </div>

      {/* OEE Breakdown */}
      <h4 className="text-xs text-slate-400 uppercase font-medium mb-2">OEE Breakdown</h4>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {oeeCard('Availability', selectedRun.availability)}
        {oeeCard('Performance', selectedRun.performance)}
        {oeeCard('Quality', selectedRun.quality)}
        {oeeCard('OEE', selectedRun.oee)}
      </div>

      {/* Production counts */}
      <h4 className="text-xs text-slate-400 uppercase font-medium mb-2">{displayMode === 'rate' ? 'Production Rates' : 'Production Counts'}</h4>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400">{displayMode === 'rate' ? 'Good Rate' : 'Good'}</div>
          <div className="text-lg font-bold text-green-400">
            {displayMode === 'rate'
              ? `${computeRate(selectedRun.good_count, selectedRun.start_time, selectedRun.end_time)} packs/hr`
              : selectedRun.good_count.toLocaleString()}
          </div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400">{displayMode === 'rate' ? 'Reject Rate' : 'Reject'}</div>
          <div className="text-lg font-bold text-red-400">
            {displayMode === 'rate'
              ? `${computeRate(selectedRun.reject_count, selectedRun.start_time, selectedRun.end_time)} packs/hr`
              : selectedRun.reject_count.toLocaleString()}
          </div>
        </div>
        {selectedRun.target_count != null && (
          <>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <div className="text-xs text-slate-400">Target</div>
              <div className="text-lg font-bold text-blue-400">{selectedRun.target_count.toLocaleString()}</div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <div className="text-xs text-slate-400">Yield</div>
              <div className="text-lg font-bold text-slate-200">
                {selectedRun.good_count + selectedRun.reject_count > 0
                  ? ((selectedRun.good_count / (selectedRun.good_count + selectedRun.reject_count)) * 100).toFixed(1)
                  : '0'}%
              </div>
            </div>
          </>
        )}
      </div>

      {/* Target vs Actual bar */}
      {selectedRun.target_count != null && selectedRun.target_count > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Actual vs Target</span>
            <span>{selectedRun.good_count + selectedRun.reject_count} / {selectedRun.target_count}</span>
          </div>
          <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${Math.min(((selectedRun.good_count + selectedRun.reject_count) / selectedRun.target_count) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Downtime events */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs text-slate-400 uppercase font-medium">Downtime Events</h4>
        {canStartStop && (
          <button
            onClick={() => { setEditingDowntime(null); setShowDowntimeDialog(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white rounded-lg text-sm font-medium min-h-[44px]"
          >
            <Plus size={16} /> Add Downtime
          </button>
        )}
      </div>
      {downtimeEvents.length === 0 ? (
        <div className="text-sm text-slate-500 py-4 text-center">No downtime events</div>
      ) : (
        <div className="space-y-2">
          {downtimeEvents.map(evt => (
            <div key={evt.id} className="bg-slate-700/50 rounded-lg p-3 text-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-slate-200 font-medium">{evt.reason_code || 'Unknown'}</div>
                  {evt.reason_text && <div className="text-slate-400 text-xs mt-0.5">{evt.reason_text}</div>}
                </div>
                {canEdit && (
                  <div className="flex gap-0.5">
                    <button onClick={() => { setEditingDowntime(evt); setShowDowntimeDialog(true); }} className="text-slate-400 hover:text-white active:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => api.deleteDowntimeEvent(evt.id).then(() => api.getDowntimeEvents(selectedRun.id).then(setDowntimeEvents))} className="text-slate-400 hover:text-red-400 active:text-red-300 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-1.5 text-slate-400 text-xs">
                <span>{new Date(evt.start_time).toLocaleString()}</span>
                {evt.duration_seconds != null && <span>{Math.round(evt.duration_seconds / 60)}m</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ---- Empty state ----
  if (runs.length === 0 && timeSeries.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">Production Reports</h1>
            {shiftMode === 'automatic' && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-600/20 border border-blue-500/30 rounded-full text-xs font-medium text-blue-400">
                <Clock size={12} /> Auto Shifts
              </span>
            )}
          </div>
          {canStartStop && shiftMode !== 'automatic' && (
            <button
              onClick={() => setShowStartDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium"
            >
              <Play size={16} /> Start Run
            </button>
          )}
        </div>
        <div className="text-center text-slate-500 py-20">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-50" />
          <p>{shiftMode === 'automatic' ? 'No production runs yet — the scheduler will start one at the next shift boundary' : 'No production runs recorded'}</p>
          {canStartStop && shiftMode !== 'automatic' && (
            <button onClick={() => setShowStartDialog(true)} className="mt-3 text-blue-400 hover:text-blue-300 text-sm">
              Start your first run
            </button>
          )}
        </div>
        {showStartDialog && (
          <StartRunDialog jobs={jobs} onClose={() => setShowStartDialog(false)} onStarted={() => { setShowStartDialog(false); refreshAll(); }} />
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-100">Production Reports</h1>
          {shiftMode === 'automatic' && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-600/20 border border-blue-500/30 rounded-full text-xs font-medium text-blue-400">
              <Clock size={12} /> Auto Shifts
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {canStartStop && shiftMode !== 'automatic' && (
            <button
              onClick={() => setShowStartDialog(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 hover:bg-green-500 active:bg-green-700 text-white rounded-lg text-sm font-medium min-h-[44px]"
            >
              <Play size={18} /> Start Run
            </button>
          )}
          {canStartStop && activeRun && (
            <button
              onClick={() => { setDowntimeRunOverride(activeRun); setEditingDowntime(null); setShowDowntimeDialog(true); }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white rounded-lg text-sm font-medium min-h-[44px]"
            >
              <AlertTriangle size={18} /> Log Downtime
            </button>
          )}
          <div className="flex gap-1">
            {(['count', 'rate'] as DisplayMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setDisplayMode(mode)}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium min-h-[44px] ${displayMode === mode ? 'bg-[var(--hmi-accent)] text-white' : 'bg-slate-800 text-slate-400 hover:text-white active:bg-slate-600'}`}
              >
                {mode === 'count' ? 'Count' : 'Rate'}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(['day', 'week', 'month'] as Granularity[]).map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium capitalize min-h-[44px] ${granularity === g ? 'bg-[var(--hmi-accent)] text-white' : 'bg-slate-800 text-slate-400 hover:text-white active:bg-slate-600'}`}
              >
                {g}
              </button>
            ))}
          </div>
          <button onClick={exportCsv} disabled={runs.length === 0} className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-300 rounded-lg text-sm disabled:opacity-50 min-h-[44px]">
            <Download size={18} /> Export CSV
          </button>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {DATE_PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => handlePreset(p.label)}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium min-h-[44px] ${activePreset === p.label ? 'bg-[var(--hmi-accent)] text-white' : 'bg-slate-800 text-slate-400 hover:text-white active:bg-slate-600'}`}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <input
            type="datetime-local"
            value={dateStart ? toLocalInput(dateStart) : ''}
            onChange={e => { setActivePreset(''); setDateStart(e.target.value ? new Date(e.target.value).toISOString() : undefined); }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 min-h-[44px]"
          />
          <span className="text-slate-500 text-sm">to</span>
          <input
            type="datetime-local"
            value={dateEnd ? toLocalInput(dateEnd) : ''}
            onChange={e => { setActivePreset(''); setDateEnd(e.target.value ? new Date(e.target.value).toISOString() : undefined); }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 min-h-[44px]"
          />
        </div>
      </div>

      {/* Summary cards */}
      {summaryData && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          {[
            { label: 'Total Runs', value: summaryData.totalRuns, color: 'text-blue-400' },
            { label: displayMode === 'rate' ? 'Good Rate' : 'Good Count', value: displayMode === 'rate' ? `${summaryData.avgGoodRate.toLocaleString()} packs/hr` : summaryData.totalGood.toLocaleString(), color: 'text-green-400' },
            { label: displayMode === 'rate' ? 'Reject Rate' : 'Reject Count', value: displayMode === 'rate' ? `${summaryData.avgRejectRate.toLocaleString()} packs/hr` : summaryData.totalReject.toLocaleString(), color: 'text-red-400' },
            { label: 'Avg OEE', value: `${summaryData.avgOee}%`, color: summaryData.avgOee >= 85 ? 'text-green-400' : summaryData.avgOee >= 60 ? 'text-yellow-400' : 'text-red-400' },
            { label: 'Yield Rate', value: `${summaryData.yieldRate}%`, color: 'text-blue-400' },
            { label: 'Downtime', value: `${summaryData.totalDowntime}m`, color: 'text-orange-400' },
          ].map(card => (
            <div key={card.label} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="text-xs text-slate-400 uppercase font-medium">{card.label}</div>
              <div className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Time-series charts */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <OEETrendChart data={timeSeries} />
        <ProductionTrendChart data={timeSeries} displayMode={displayMode} />
      </div>

      {/* Downtime Pareto */}
      <div className="mb-4">
        <DowntimePareto data={downtimeSummary} />
      </div>

      {/* Production runs table */}
      <div className="flex gap-4">
        <div className={`${selectedRun ? 'flex-1 min-w-0' : 'w-full'}`}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">Job</th>
                  <th className="text-left px-4 py-3 font-medium">Start</th>
                  <th className="text-left px-4 py-3 font-medium">Duration</th>
                  <th className="text-right px-4 py-3 font-medium">{displayMode === 'rate' ? 'Good (packs/hr)' : 'Good'}</th>
                  <th className="text-right px-4 py-3 font-medium">{displayMode === 'rate' ? 'Reject (packs/hr)' : 'Reject'}</th>
                  <th className="text-right px-4 py-3 font-medium">OEE</th>
                  <th className="text-left px-4 py-3 font-medium">Shift</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => (
                  <tr
                    key={run.id}
                    onClick={() => setSelectedRun(run)}
                    className={`border-b border-slate-700/50 cursor-pointer ${selectedRun?.id === run.id ? 'bg-slate-700/50' : 'hover:bg-slate-700/30 active:bg-slate-700/50'}`}
                  >
                    <td className="px-4 py-4 text-slate-200">{run.job_name || '\u2014'}</td>
                    <td className="px-4 py-4 text-slate-300 whitespace-nowrap">{new Date(run.start_time).toLocaleString()}</td>
                    <td className="px-4 py-4 text-slate-300">
                      <span className="flex items-center gap-1">
                        {!run.end_time && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
                        {formatDuration(run.start_time, run.end_time)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-green-400">
                      {displayMode === 'rate' ? computeRate(run.good_count, run.start_time, run.end_time) : run.good_count}
                    </td>
                    <td className="px-4 py-4 text-right text-red-400">
                      {displayMode === 'rate' ? computeRate(run.reject_count, run.start_time, run.end_time) : run.reject_count}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {run.oee != null ? (
                        <span className="font-medium" style={{ color: oeeColor(run.oee * 100) }}>
                          {(run.oee * 100).toFixed(1)}%
                        </span>
                      ) : '\u2014'}
                    </td>
                    <td className="px-4 py-4 text-slate-300">{run.shift || '\u2014'}</td>
                    <td className="px-4 py-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {canStartStop && !run.end_time && (
                          <button onClick={() => { setSelectedRun(run); setShowStopDialog(true); }} className="p-2.5 text-slate-400 hover:text-red-400 active:text-red-300 min-w-[44px] min-h-[44px] flex items-center justify-center" title="Stop">
                            <Square size={16} />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setConfirmDelete(run.id)} className="p-2.5 text-slate-400 hover:text-red-400 active:text-red-300 min-w-[44px] min-h-[44px] flex items-center justify-center" title="Delete">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {detailPanel}
      </div>

      {/* ---- Dialogs ---- */}

      {showStartDialog && (
        <StartRunDialog
          jobs={jobs}
          onClose={() => setShowStartDialog(false)}
          onStarted={() => { setShowStartDialog(false); refreshAll(); }}
        />
      )}

      {showStopDialog && selectedRun && (
        <StopRunDialog
          run={selectedRun}
          onClose={() => setShowStopDialog(false)}
          onStopped={() => { setShowStopDialog(false); refreshAll(); }}
        />
      )}

      {showDowntimeDialog && downtimeTargetRun && (
        <DowntimeDialog
          runId={downtimeTargetRun.id}
          existing={editingDowntime}
          runStart={downtimeTargetRun.start_time}
          reasonCodes={reasonCodes}
          onClose={() => { setShowDowntimeDialog(false); setEditingDowntime(null); setDowntimeRunOverride(null); }}
          onSaved={() => {
            setShowDowntimeDialog(false);
            setEditingDowntime(null);
            setDowntimeRunOverride(null);
            if (selectedRun) api.getDowntimeEvents(selectedRun.id).then(setDowntimeEvents);
            loadAnalytics();
          }}
        />
      )}

      {confirmDelete != null && (
        <Dialog title="Delete Production Run" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-slate-300 mb-4">Are you sure you want to delete this production run? This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-300 rounded-lg text-sm min-h-[44px]">Cancel</button>
            <button onClick={() => handleDeleteRun(confirmDelete)} className="px-4 py-2.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-lg text-sm min-h-[44px]">Delete</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
