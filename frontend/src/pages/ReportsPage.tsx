import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  BarChart3, Download, Play, Square, Plus, Pencil, Trash2, X, Clock, ChevronLeft,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
  ComposedChart, Line,
} from 'recharts';
import { api } from '../lib/api';
import { Dialog } from '../components/Dialog';
import type { ProductionRun, DowntimeEvent, DowntimeSummary, JobData, UserData } from '../types';

const OEE_COLORS = { good: '#22c55e', warning: '#f59e0b', bad: '#ef4444' };
function oeeColor(pct: number) { return pct >= 85 ? OEE_COLORS.good : pct >= 60 ? OEE_COLORS.warning : OEE_COLORS.bad; }

type ViewMode = 'table' | 'charts';

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

function fmtPct(v: number | null): string {
  return v != null ? `${(v * 100).toFixed(1)}%` : '\u2014';
}

interface Props {
  user: UserData | null;
}

export function ReportsPage({ user }: Props) {
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Date filtering
  const [dateStart, setDateStart] = useState<string | undefined>();
  const [dateEnd, setDateEnd] = useState<string | undefined>();
  const [activePreset, setActivePreset] = useState('All');

  // Selection & detail
  const [selectedRun, setSelectedRun] = useState<ProductionRun | null>(null);
  const [downtimeEvents, setDowntimeEvents] = useState<DowntimeEvent[]>([]);

  // Dialogs
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showStopDialog, setShowStopDialog] = useState(false);
  const [showDowntimeDialog, setShowDowntimeDialog] = useState(false);
  const [editingDowntime, setEditingDowntime] = useState<DowntimeEvent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Jobs for start dialog
  const [jobs, setJobs] = useState<JobData[]>([]);

  // Pareto data
  const [downtimeSummary, setDowntimeSummary] = useState<DowntimeSummary[]>([]);

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

  useEffect(() => { loadRuns(); }, [loadRuns]);

  useEffect(() => {
    api.getJobs().then(setJobs).catch(() => {});
  }, []);

  useEffect(() => {
    if (viewMode === 'charts') {
      api.getDowntimeSummary({ start: dateStart, end: dateEnd })
        .then(setDowntimeSummary)
        .catch(() => {});
    }
  }, [viewMode, dateStart, dateEnd]);

  useEffect(() => {
    if (selectedRun) {
      api.getDowntimeEvents(selectedRun.id).then(setDowntimeEvents).catch(() => {});
    } else {
      setDowntimeEvents([]);
    }
  }, [selectedRun]);

  // Keep selectedRun fresh when runs reload
  useEffect(() => {
    if (selectedRun) {
      const fresh = runs.find(r => r.id === selectedRun.id);
      if (fresh) setSelectedRun(fresh);
      else setSelectedRun(null);
    }
  }, [runs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Computed ----
  const chartData = useMemo(() => {
    return runs.slice(0, 20).map((run, i) => ({
      name: run.job_name || `Run ${i + 1}`,
      good: run.good_count,
      reject: run.reject_count,
      oee: run.oee != null ? +(run.oee * 100).toFixed(1) : 0,
    }));
  }, [runs]);

  const summaryData = useMemo(() => {
    if (runs.length === 0) return null;
    const totalGood = runs.reduce((s, r) => s + r.good_count, 0);
    const totalReject = runs.reduce((s, r) => s + r.reject_count, 0);
    const withOee = runs.filter(r => r.oee != null);
    const avgOee = withOee.length > 0 ? withOee.reduce((s, r) => s + (r.oee || 0), 0) / withOee.length : 0;
    return {
      totalRuns: runs.length,
      totalGood,
      totalReject,
      avgOee: +(avgOee * 100).toFixed(1),
      yieldRate: totalGood + totalReject > 0 ? +((totalGood / (totalGood + totalReject)) * 100).toFixed(1) : 0,
    };
  }, [runs]);

  const shiftData = useMemo(() => {
    const byShift: Record<string, { good: number; reject: number; count: number; oeeSum: number }> = {};
    runs.forEach(r => {
      const shift = r.shift || 'Unassigned';
      if (!byShift[shift]) byShift[shift] = { good: 0, reject: 0, count: 0, oeeSum: 0 };
      byShift[shift].good += r.good_count;
      byShift[shift].reject += r.reject_count;
      byShift[shift].count += 1;
      byShift[shift].oeeSum += r.oee || 0;
    });
    return Object.entries(byShift).map(([shift, d]) => ({
      name: shift,
      good: d.good,
      reject: d.reject,
      avgOee: +(d.oeeSum / d.count * 100).toFixed(1),
    }));
  }, [runs]);

  const paretoData = useMemo(() => {
    if (!downtimeSummary.length) return [];
    const total = downtimeSummary.reduce((s, d) => s + d.total_duration, 0);
    let cumulative = 0;
    return downtimeSummary.map(d => {
      cumulative += d.total_duration;
      return {
        reason_code: d.reason_code,
        duration_minutes: +(d.total_duration / 60).toFixed(1),
        cumulative_pct: total > 0 ? +((cumulative / total) * 100).toFixed(1) : 0,
      };
    });
  }, [downtimeSummary]);

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
    const header = 'Job,Start,End,Good,Reject,Target,Availability,Performance,Quality,OEE,Shift';
    const rows = runs.map(r =>
      [r.job_name || '', r.start_time, r.end_time || '', r.good_count, r.reject_count,
       r.target_count ?? '', r.availability ?? '', r.performance ?? '', r.quality ?? '', r.oee ?? '', r.shift || ''].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `production_report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [runs]);

  const handleDeleteRun = useCallback(async (id: number) => {
    await api.deleteProductionRun(id);
    setConfirmDelete(null);
    if (selectedRun?.id === id) setSelectedRun(null);
    loadRuns();
  }, [selectedRun, loadRuns]);

  // ---- Date filter bar ----
  const dateFilterBar = (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      {DATE_PRESETS.map(p => (
        <button
          key={p.label}
          onClick={() => handlePreset(p.label)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium ${activePreset === p.label ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1.5 ml-2">
        <input
          type="datetime-local"
          value={dateStart ? dateStart.slice(0, 16) : ''}
          onChange={e => { setActivePreset(''); setDateStart(e.target.value ? new Date(e.target.value).toISOString() : undefined); }}
          className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-300"
        />
        <span className="text-slate-500 text-sm">to</span>
        <input
          type="datetime-local"
          value={dateEnd ? dateEnd.slice(0, 16) : ''}
          onChange={e => { setActivePreset(''); setDateEnd(e.target.value ? new Date(e.target.value).toISOString() : undefined); }}
          className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-300"
        />
      </div>
    </div>
  );

  // ---- OEE metric card ----
  const oeeCard = (label: string, value: number | null) => {
    const pct = value != null ? +(value * 100).toFixed(1) : null;
    return (
      <div className="bg-slate-700/50 rounded-lg p-3">
        <div className="text-xs text-slate-400 uppercase font-medium">{label}</div>
        <div className={`text-xl font-bold mt-1 ${pct != null ? oeeColor(pct).replace('#22c55e', 'text-green-400').replace('#f59e0b', 'text-yellow-400').replace('#ef4444', 'text-red-400') : 'text-slate-500'}`}
          style={pct != null ? { color: oeeColor(pct) } : undefined}
        >
          {pct != null ? `${pct}%` : '\u2014'}
        </div>
      </div>
    );
  };

  // ---- Detail panel ----
  const detailPanel = selectedRun && (
    <div className="w-[420px] flex-shrink-0 bg-slate-800 rounded-xl border border-slate-700 p-4 overflow-y-auto max-h-[calc(100vh-180px)]">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setSelectedRun(null)} className="text-slate-400 hover:text-white">
          <ChevronLeft size={18} />
        </button>
        <h3 className="text-sm font-bold text-white flex-1 ml-2">Run Details</h3>
        {canStartStop && !selectedRun.end_time && (
          <button
            onClick={() => setShowStopDialog(true)}
            className="flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-medium"
          >
            <Square size={12} /> Stop
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
      <h4 className="text-xs text-slate-400 uppercase font-medium mb-2">Production Counts</h4>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400">Good</div>
          <div className="text-lg font-bold text-green-400">{selectedRun.good_count.toLocaleString()}</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400">Reject</div>
          <div className="text-lg font-bold text-red-400">{selectedRun.reject_count.toLocaleString()}</div>
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
            className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs"
          >
            <Plus size={12} /> Add
          </button>
        )}
      </div>
      {downtimeEvents.length === 0 ? (
        <div className="text-xs text-slate-500 py-4 text-center">No downtime events</div>
      ) : (
        <div className="space-y-2">
          {downtimeEvents.map(evt => (
            <div key={evt.id} className="bg-slate-700/50 rounded-lg p-2.5 text-xs">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-slate-200 font-medium">{evt.reason_code || 'Unknown'}</div>
                  {evt.reason_text && <div className="text-slate-400 mt-0.5">{evt.reason_text}</div>}
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingDowntime(evt); setShowDowntimeDialog(true); }} className="text-slate-400 hover:text-white p-0.5">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => api.deleteDowntimeEvent(evt.id).then(() => api.getDowntimeEvents(selectedRun.id).then(setDowntimeEvents))} className="text-slate-400 hover:text-red-400 p-0.5">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-1.5 text-slate-400">
                <span>{new Date(evt.start_time).toLocaleString()}</span>
                {evt.duration_seconds != null && <span>{Math.round(evt.duration_seconds / 60)}m</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ---- Table view ----
  const tableView = (
    <div className={`flex gap-4 ${selectedRun ? '' : ''}`}>
      <div className={`${selectedRun ? 'flex-1 min-w-0' : 'w-full'}`}>
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-left px-4 py-3 font-medium">Job</th>
                <th className="text-left px-4 py-3 font-medium">Start</th>
                <th className="text-left px-4 py-3 font-medium">Duration</th>
                <th className="text-right px-4 py-3 font-medium">Good</th>
                <th className="text-right px-4 py-3 font-medium">Reject</th>
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
                  className={`border-b border-slate-700/50 cursor-pointer ${selectedRun?.id === run.id ? 'bg-slate-700/50' : 'hover:bg-slate-700/30'}`}
                >
                  <td className="px-4 py-3 text-slate-200">{run.job_name || '\u2014'}</td>
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{new Date(run.start_time).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-300">
                    <span className="flex items-center gap-1">
                      {!run.end_time && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
                      {formatDuration(run.start_time, run.end_time)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-green-400">{run.good_count}</td>
                  <td className="px-4 py-3 text-right text-red-400">{run.reject_count}</td>
                  <td className="px-4 py-3 text-right">
                    {run.oee != null ? (
                      <span className="font-medium" style={{ color: oeeColor(run.oee * 100) }}>
                        {(run.oee * 100).toFixed(1)}%
                      </span>
                    ) : '\u2014'}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{run.shift || '\u2014'}</td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {canStartStop && !run.end_time && (
                        <button onClick={() => { setSelectedRun(run); setShowStopDialog(true); }} className="p-1 text-slate-400 hover:text-red-400" title="Stop">
                          <Square size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setConfirmDelete(run.id)} className="p-1 text-slate-400 hover:text-red-400" title="Delete">
                          <Trash2 size={14} />
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
  );

  // ---- Charts view ----
  const chartsView = (
    <div className="space-y-4">
      {/* Production by run */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Production Counts by Run</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            <Legend />
            <Bar dataKey="good" fill="#22c55e" name="Good" />
            <Bar dataKey="reject" fill="#ef4444" name="Reject" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* OEE by run */}
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h3 className="text-sm font-medium text-slate-300 mb-3">OEE by Run (%)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
              <Bar dataKey="oee" name="OEE %">
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={oeeColor(entry.oee)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By shift */}
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Production by Shift</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={shiftData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
              <Legend />
              <Bar dataKey="good" fill="#22c55e" name="Good" />
              <Bar dataKey="reject" fill="#ef4444" name="Reject" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Downtime Pareto */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Downtime Pareto Analysis</h3>
        {paretoData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={paretoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="reason_code" stroke="#64748b" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
              <YAxis yAxisId="duration" stroke="#64748b" tick={{ fontSize: 11 }} label={{ value: 'Minutes', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontSize: 11 } }} />
              <YAxis yAxisId="cumPct" orientation="right" stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 100]} label={{ value: '%', angle: 90, position: 'insideRight', style: { fill: '#64748b', fontSize: 11 } }} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
              <Legend />
              <Bar yAxisId="duration" dataKey="duration_minutes" fill="#f59e0b" name="Duration (min)" />
              <Line yAxisId="cumPct" dataKey="cumulative_pct" stroke="#3b82f6" name="Cumulative %" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center text-slate-500 py-12">No downtime events recorded</div>
        )}
      </div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-100">Production Reports</h1>
        <div className="flex gap-2">
          {canStartStop && (
            <button
              onClick={() => setShowStartDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium"
            >
              <Play size={16} /> Start Run
            </button>
          )}
          <div className="flex gap-1">
            <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>Table</button>
            <button onClick={() => setViewMode('charts')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${viewMode === 'charts' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>Charts</button>
          </div>
          <button onClick={exportCsv} disabled={runs.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm disabled:opacity-50">
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Date filter */}
      {dateFilterBar}

      {/* Summary cards */}
      {summaryData && (
        <div className="grid grid-cols-5 gap-3 mb-4">
          {[
            { label: 'Total Runs', value: summaryData.totalRuns, color: 'text-blue-400' },
            { label: 'Good Count', value: summaryData.totalGood.toLocaleString(), color: 'text-green-400' },
            { label: 'Reject Count', value: summaryData.totalReject.toLocaleString(), color: 'text-red-400' },
            { label: 'Avg OEE', value: `${summaryData.avgOee}%`, color: summaryData.avgOee >= 85 ? 'text-green-400' : summaryData.avgOee >= 60 ? 'text-yellow-400' : 'text-red-400' },
            { label: 'Yield Rate', value: `${summaryData.yieldRate}%`, color: 'text-blue-400' },
          ].map(card => (
            <div key={card.label} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="text-xs text-slate-400 uppercase font-medium">{card.label}</div>
              <div className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      {runs.length > 0 ? (
        viewMode === 'charts' ? chartsView : tableView
      ) : (
        <div className="text-center text-slate-500 py-20">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-50" />
          <p>No production runs recorded</p>
          {canStartStop && (
            <button onClick={() => setShowStartDialog(true)} className="mt-3 text-blue-400 hover:text-blue-300 text-sm">
              Start your first run
            </button>
          )}
        </div>
      )}

      {/* ---- Dialogs ---- */}

      {/* Start Run Dialog */}
      {showStartDialog && (
        <StartRunDialog
          jobs={jobs}
          onClose={() => setShowStartDialog(false)}
          onStarted={() => { setShowStartDialog(false); loadRuns(); }}
        />
      )}

      {/* Stop Run Dialog */}
      {showStopDialog && selectedRun && (
        <StopRunDialog
          run={selectedRun}
          onClose={() => setShowStopDialog(false)}
          onStopped={() => { setShowStopDialog(false); loadRuns(); }}
        />
      )}

      {/* Downtime Dialog */}
      {showDowntimeDialog && selectedRun && (
        <DowntimeDialog
          runId={selectedRun.id}
          existing={editingDowntime}
          runStart={selectedRun.start_time}
          onClose={() => { setShowDowntimeDialog(false); setEditingDowntime(null); }}
          onSaved={() => {
            setShowDowntimeDialog(false);
            setEditingDowntime(null);
            api.getDowntimeEvents(selectedRun.id).then(setDowntimeEvents);
          }}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete != null && (
        <Dialog title="Delete Production Run" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-slate-300 mb-4">Are you sure you want to delete this production run? This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancel</button>
            <button onClick={() => handleDeleteRun(confirmDelete)} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm">Delete</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}


// ---- Sub-dialogs ----

function StartRunDialog({ jobs, onClose, onStarted }: { jobs: JobData[]; onClose: () => void; onStarted: () => void }) {
  const [jobName, setJobName] = useState('');
  const [shift, setShift] = useState('');
  const [targetCount, setTargetCount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await api.startProductionRun({
        job_name: jobName || undefined,
        shift: shift || undefined,
        target_count: targetCount ? parseInt(targetCount, 10) : undefined,
      });
      onStarted();
    } catch {
      setSubmitting(false);
    }
  }, [jobName, shift, targetCount, onStarted]);

  return (
    <Dialog title="Start Production Run" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Job</label>
          <select
            value={jobName}
            onChange={e => setJobName(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            <option value="">No job selected</option>
            {jobs.map(j => <option key={j.id} value={j.name}>{j.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Shift</label>
          <input
            type="text"
            value={shift}
            onChange={e => setShift(e.target.value)}
            placeholder="e.g. Day, Night, A, B, C"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Target Count (optional)</label>
          <input
            type="number"
            value={targetCount}
            onChange={e => setTargetCount(e.target.value)}
            placeholder="0"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancel</button>
        <button onClick={handleSubmit} disabled={submitting} className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm disabled:opacity-50">
          {submitting ? 'Starting...' : 'Start Run'}
        </button>
      </div>
    </Dialog>
  );
}

function StopRunDialog({ run, onClose, onStopped }: { run: ProductionRun; onClose: () => void; onStopped: () => void }) {
  const [goodCount, setGoodCount] = useState(String(run.good_count));
  const [rejectCount, setRejectCount] = useState(String(run.reject_count));
  const [targetCount, setTargetCount] = useState(run.target_count != null ? String(run.target_count) : '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await api.stopProductionRun(run.id, {
        good_count: parseInt(goodCount, 10) || 0,
        reject_count: parseInt(rejectCount, 10) || 0,
        target_count: targetCount ? parseInt(targetCount, 10) : undefined,
      });
      onStopped();
    } catch {
      setSubmitting(false);
    }
  }, [run.id, goodCount, rejectCount, targetCount, onStopped]);

  return (
    <Dialog title="Stop Production Run" onClose={onClose}>
      <p className="text-xs text-slate-400 mb-3">Finalize counts for: {run.job_name || `Run #${run.id}`}</p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Good Count</label>
          <input type="number" value={goodCount} onChange={e => setGoodCount(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Reject Count</label>
          <input type="number" value={rejectCount} onChange={e => setRejectCount(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Target Count (optional)</label>
          <input type="number" value={targetCount} onChange={e => setTargetCount(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancel</button>
        <button onClick={handleSubmit} disabled={submitting} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm disabled:opacity-50">
          {submitting ? 'Stopping...' : 'Stop Run'}
        </button>
      </div>
    </Dialog>
  );
}

function DowntimeDialog({ runId, existing, runStart, onClose, onSaved }: {
  runId: number;
  existing: DowntimeEvent | null;
  runStart: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultStart = existing?.start_time
    ? new Date(existing.start_time).toISOString().slice(0, 16)
    : new Date(runStart).toISOString().slice(0, 16);
  const defaultEnd = existing?.end_time
    ? new Date(existing.end_time).toISOString().slice(0, 16)
    : '';

  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const [reasonCode, setReasonCode] = useState(existing?.reason_code || '');
  const [reasonText, setReasonText] = useState(existing?.reason_text || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      if (existing) {
        await api.updateDowntimeEvent(existing.id, {
          start_time: new Date(startTime).toISOString(),
          end_time: endTime ? new Date(endTime).toISOString() : undefined,
          reason_code: reasonCode,
          reason_text: reasonText,
        });
      } else {
        await api.createDowntimeEvent({
          production_run_id: runId,
          start_time: new Date(startTime).toISOString(),
          end_time: endTime ? new Date(endTime).toISOString() : undefined,
          reason_code: reasonCode || undefined,
          reason_text: reasonText || undefined,
        });
      }
      onSaved();
    } catch {
      setSubmitting(false);
    }
  }, [existing, runId, startTime, endTime, reasonCode, reasonText, onSaved]);

  return (
    <Dialog title={existing ? 'Edit Downtime Event' : 'Add Downtime Event'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Start Time</label>
          <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">End Time</label>
          <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Reason Code</label>
          <input type="text" value={reasonCode} onChange={e => setReasonCode(e.target.value)} placeholder="e.g. MECH_FAIL, MATERIAL, CHANGEOVER" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Reason Text</label>
          <textarea value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="Description of downtime reason" rows={2} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancel</button>
        <button onClick={handleSubmit} disabled={submitting} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm disabled:opacity-50">
          {submitting ? 'Saving...' : existing ? 'Update' : 'Add'}
        </button>
      </div>
    </Dialog>
  );
}
