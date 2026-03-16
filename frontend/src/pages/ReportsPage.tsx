import { useEffect, useState, useCallback, useRef } from 'react';
import {
  BarChart3, Download, Clock, Activity, AlertTriangle, Gauge, Package, Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { OEETrendChart } from '../components/reports/OEETrendChart';
import { ProductionTrendChart } from '../components/reports/ProductionTrendChart';
import { DowntimePareto } from '../components/reports/DowntimePareto';
import { TimeBreakdownBar } from '../components/reports/TimeBreakdownBar';
import { MachineStateChart } from '../components/reports/MachineStateChart';
import { DowntimePeriodsTable } from '../components/reports/DowntimePeriodsTable';
import type { ReportSummary, DowntimePeriod, DowntimeSummary, ReportBucket, ReasonCode } from '../types';

const OEE_COLORS = { good: '#22c55e', warning: '#f59e0b', bad: '#ef4444' };
function oeeColor(pct: number) { return pct >= 85 ? OEE_COLORS.good : pct >= 60 ? OEE_COLORS.warning : OEE_COLORS.bad; }

type Granularity = 'day' | 'week' | 'month';
type Tab = 'live' | 'historical';

function formatDurationHM(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const DATE_PRESETS: { label: string; getRange: () => { start: string; end?: string } }[] = [
  { label: 'Today', getRange: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return { start: d.toISOString() }; } },
  { label: 'Yesterday', getRange: () => { const s = new Date(); s.setDate(s.getDate() - 1); s.setHours(0, 0, 0, 0); const e = new Date(); e.setHours(0, 0, 0, 0); return { start: s.toISOString(), end: e.toISOString() }; } },
  { label: 'Last 7 Days', getRange: () => { const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0); return { start: d.toISOString() }; } },
  { label: 'This Week', getRange: () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); d.setHours(0, 0, 0, 0); return { start: d.toISOString() }; } },
  { label: 'This Month', getRange: () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return { start: d.toISOString() }; } },
];

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('live');

  // Live tab state
  const [liveSummary, setLiveSummary] = useState<ReportSummary | null>(null);
  const [liveDowntime, setLiveDowntime] = useState<DowntimePeriod[]>([]);

  // Historical tab state
  const [histSummary, setHistSummary] = useState<ReportSummary | null>(null);
  const [histTimeSeries, setHistTimeSeries] = useState<ReportBucket[]>([]);
  const [histDowntime, setHistDowntime] = useState<DowntimePeriod[]>([]);
  const [histDowntimeSummary, setHistDowntimeSummary] = useState<DowntimeSummary[]>([]);
  const [granularity, setGranularity] = useState<Granularity>('day');

  // Historical date range
  const [dateStart, setDateStart] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0);
    return d.toISOString();
  });
  const [dateEnd, setDateEnd] = useState<string | undefined>();

  // Shared
  const [reasonCodes, setReasonCodes] = useState<ReasonCode[]>([]);

  // Guards against overlapping fetch calls. If the API takes longer than the
  // polling interval (5s), requests pile up — each pending Promise holds response
  // data in memory, causing unbounded growth on slow backends.
  const liveFetchingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Load reason codes once
  useEffect(() => {
    api.getReasonCodes(true).then(setReasonCodes).catch(() => {});
  }, []);

  // Live tab: auto-refresh every 5 seconds
  const fetchLive = useCallback(async () => {
    // Skip if a previous fetch is still in-flight
    if (liveFetchingRef.current) return;
    liveFetchingRef.current = true;
    try {
      const [summary, periods] = await Promise.all([
        api.getReportSummary(),
        api.getDowntimePeriods(),
      ]);
      setLiveSummary(summary);
      setLiveDowntime(periods);
    } catch {
      // silently ignore
    } finally {
      liveFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (tab !== 'live') return;
    fetchLive(); // eslint-disable-line react-hooks/set-state-in-effect
    const id = setInterval(fetchLive, 5000);
    return () => clearInterval(id);
  }, [tab, fetchLive]);

  // Historical tab: fetch on range/granularity change
  const fetchHistorical = useCallback(async () => {
    // Abort any previous in-flight historical fetch to prevent accumulation
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const params = { start: dateStart, end: dateEnd };
      const [summary, timeSeries, periods, dtSummary] = await Promise.all([
        api.getReportSummary(params),
        api.getReportTimeSeries({ ...params, granularity }),
        api.getDowntimePeriods(params),
        api.getDowntimeSummary(params),
      ]);
      if (controller.signal.aborted) return;
      setHistSummary(summary);
      setHistTimeSeries(timeSeries);
      setHistDowntime(periods);
      setHistDowntimeSummary(dtSummary);
    } catch {
      // silently ignore (including abort errors)
    }
  }, [dateStart, dateEnd, granularity]);

  useEffect(() => {
    if (tab !== 'historical') return;
    fetchHistorical(); // eslint-disable-line react-hooks/set-state-in-effect
    return () => { abortRef.current?.abort(); };
  }, [tab, fetchHistorical]);

  const handlePreset = useCallback((getRange: () => { start: string; end?: string }) => {
    const range = getRange();
    setDateStart(range.start);
    setDateEnd(range.end);
  }, []);

  const handleAnnotated = useCallback(() => {
    if (tab === 'live') fetchLive();
    else fetchHistorical();
  }, [tab, fetchLive, fetchHistorical]);

  const exportCsv = useCallback(() => {
    const summary = tab === 'live' ? liveSummary : histSummary;
    const periods = tab === 'live' ? liveDowntime : histDowntime;
    if (!summary) return;

    const lines = [
      'Metric,Value',
      `Count,${summary.count}`,
      `Reject Count,${summary.reject_count}`,
      `Rate (bags/hr),${summary.rate ?? 'N/A'}`,
      `Target Rate,${summary.target_rate ?? 'N/A'}`,
      `Uptime,${formatDurationHM(summary.uptime_seconds)}`,
      `Downtime,${formatDurationHM(summary.downtime_seconds)}`,
      `Idle,${formatDurationHM(summary.idle_seconds)}`,
      `Availability,${summary.availability != null ? (summary.availability * 100).toFixed(1) + '%' : 'N/A'}`,
      `Performance,${summary.performance != null ? (summary.performance * 100).toFixed(1) + '%' : 'N/A'}`,
      `Quality,${summary.quality != null ? (summary.quality * 100).toFixed(1) + '%' : 'N/A'}`,
      `OEE,${summary.oee != null ? (summary.oee * 100).toFixed(1) + '%' : 'N/A'}`,
      '',
      'Downtime Periods',
      'Faults,Start,End,Duration,Capped Duration,Reason Code',
      ...periods.map(p => {
        const faultNames = p.faults.map(f => f.tag_display_name || f.tag_name).join('; ');
        return `"${faultNames}","${p.start_time}","${p.end_time || 'Ongoing'}",${p.duration_seconds},${p.capped_duration_seconds},"${p.reason_code || ''}"`;
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [tab, liveSummary, histSummary, liveDowntime, histDowntime]);

  const summary = tab === 'live' ? liveSummary : histSummary;
  const downtimePeriods = tab === 'live' ? liveDowntime : histDowntime;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="px-3 sm:px-4 lg:px-6 py-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <h1 className="text-lg font-semibold">Reports</h1>
          </div>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          <button
            onClick={() => setTab('live')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'live' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Live (Last 8 Hours)
          </button>
          <button
            onClick={() => setTab('historical')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'historical' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Historical
          </button>
        </div>
      </div>

      <div className="p-3 sm:p-4 lg:p-6 space-y-4">
        {/* Historical date controls */}
        {tab === 'historical' && (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1">
                {DATE_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => handlePreset(p.getRange)}
                    className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded-md text-slate-300"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="datetime-local"
                  value={toLocalInput(dateStart)}
                  onChange={e => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) setDateStart(d.toISOString()); }}
                  className="bg-slate-700 border border-slate-600 rounded-md px-2 py-1 text-sm text-slate-200"
                />
                <span className="text-slate-500">to</span>
                <input
                  type="datetime-local"
                  value={dateEnd ? toLocalInput(dateEnd) : ''}
                  onChange={e => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) setDateEnd(d.toISOString()); else setDateEnd(undefined); }}
                  className="bg-slate-700 border border-slate-600 rounded-md px-2 py-1 text-sm text-slate-200"
                  placeholder="Now"
                />
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-xs text-slate-500 mr-1">Granularity:</span>
                {(['day', 'week', 'month'] as Granularity[]).map(g => (
                  <button
                    key={g}
                    onClick={() => setGranularity(g)}
                    className={`px-2.5 py-1 text-xs rounded-md ${
                      granularity === g ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard icon={<Package className="w-4 h-4 text-blue-400" />} label="Count" value={summary.count.toLocaleString()} />
            <SummaryCard
              icon={<Zap className="w-4 h-4 text-amber-400" />}
              label="Rate"
              value={summary.rate != null ? `${summary.rate}` : 'N/A'}
              unit={summary.rate != null ? 'bags/hr' : undefined}
              sub={summary.target_rate ? `Target: ${summary.target_rate}` : undefined}
            />
            <SummaryCard icon={<Activity className="w-4 h-4 text-green-400" />} label="Uptime" value={formatDurationHM(summary.uptime_seconds)} />
            <SummaryCard icon={<AlertTriangle className="w-4 h-4 text-red-400" />} label="Downtime" value={formatDurationHM(summary.downtime_seconds)} />
            <SummaryCard icon={<Clock className="w-4 h-4 text-slate-400" />} label="Idle" value={formatDurationHM(summary.idle_seconds)} />
            <SummaryCard
              icon={<Gauge className="w-4 h-4" style={{ color: summary.oee != null ? oeeColor(summary.oee * 100) : '#64748b' }} />}
              label="OEE"
              value={summary.oee != null ? `${(summary.oee * 100).toFixed(1)}%` : 'N/A'}
              valueColor={summary.oee != null ? oeeColor(summary.oee * 100) : undefined}
            />
          </div>
        )}

        {/* OEE breakdown */}
        {summary && (summary.availability != null || summary.performance != null || summary.quality != null) && (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <h3 className="text-sm font-medium text-slate-300 mb-2">OEE Breakdown</h3>
            <div className="flex items-center gap-3 text-sm">
              <OeeMetric label="Availability" value={summary.availability} />
              <span className="text-slate-600">×</span>
              <OeeMetric label="Performance" value={summary.performance} />
              <span className="text-slate-600">×</span>
              <OeeMetric label="Quality" value={summary.quality} />
              <span className="text-slate-600">=</span>
              <OeeMetric label="OEE" value={summary.oee} bold />
            </div>
          </div>
        )}

        {/* Time breakdown bar */}
        {summary && (
          <TimeBreakdownBar
            uptimeSeconds={summary.uptime_seconds}
            downtimeSeconds={summary.downtime_seconds}
            idleSeconds={summary.idle_seconds}
          />
        )}

        {/* Charts (historical only) */}
        {tab === 'historical' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OEETrendChart data={histTimeSeries} />
            <ProductionTrendChart data={histTimeSeries} />
            <MachineStateChart data={histTimeSeries} />
            <DowntimePareto data={histDowntimeSummary} />
          </div>
        )}

        {/* Downtime periods table */}
        <DowntimePeriodsTable
          periods={downtimePeriods}
          reasonCodes={reasonCodes}
          onAnnotated={handleAnnotated}
        />
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, unit, sub, valueColor }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
        {icon}
        {label}
      </div>
      <div className="text-lg font-semibold" style={valueColor ? { color: valueColor } : undefined}>
        {value}
        {unit && <span className="text-xs text-slate-400 ml-1 font-normal">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function OeeMetric({ label, value, bold }: { label: string; value: number | null; bold?: boolean }) {
  const pct = value != null ? (value * 100).toFixed(1) : 'N/A';
  const color = value != null ? oeeColor(value * 100) : '#64748b';
  return (
    <div className="text-center">
      <div className={`text-base ${bold ? 'font-bold' : 'font-medium'}`} style={{ color }}>
        {pct}{value != null ? '%' : ''}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
