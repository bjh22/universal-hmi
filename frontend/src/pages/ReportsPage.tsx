import { useEffect, useState, useMemo, useCallback } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { api } from '../lib/api';
import type { ProductionRun } from '../types';

const OEE_COLORS = { good: '#22c55e', warning: '#f59e0b', bad: '#ef4444' };
type ViewMode = 'table' | 'charts';

export function ReportsPage() {
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  useEffect(() => {
    api.getProductionRuns().then(setRuns).catch(() => {});
  }, []);

  const chartData = useMemo(() => {
    return runs.slice(0, 20).map((run, i) => ({
      name: run.job_name || `Run ${i + 1}`,
      good: run.good_count,
      reject: run.reject_count,
      oee: run.oee != null ? +(run.oee * 100).toFixed(1) : 0,
      availability: run.availability != null ? +(run.availability * 100).toFixed(1) : 0,
      performance: run.performance != null ? +(run.performance * 100).toFixed(1) : 0,
      quality: run.quality != null ? +(run.quality * 100).toFixed(1) : 0,
    }));
  }, [runs]);

  const summaryData = useMemo(() => {
    if (runs.length === 0) return null;
    const totalGood = runs.reduce((s, r) => s + r.good_count, 0);
    const totalReject = runs.reduce((s, r) => s + r.reject_count, 0);
    const avgOee = runs.filter(r => r.oee != null).reduce((s, r) => s + (r.oee || 0), 0) / (runs.filter(r => r.oee != null).length || 1);
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

  const exportCsv = useCallback(() => {
    const header = 'Job,Start,End,Good,Reject,Availability,Performance,Quality,OEE,Shift';
    const rows = runs.map(r =>
      [r.job_name || '', r.start_time, r.end_time || '', r.good_count, r.reject_count,
       r.availability ?? '', r.performance ?? '', r.quality ?? '', r.oee ?? '', r.shift || ''].join(',')
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-100">Production Reports</h1>
        <div className="flex gap-2">
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode('charts')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${viewMode === 'charts' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              Charts
            </button>
          </div>
          <button
            onClick={exportCsv}
            disabled={runs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm disabled:opacity-50"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

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

      {runs.length > 0 ? (
        viewMode === 'charts' ? (
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
                        <Cell key={i} fill={entry.oee >= 85 ? OEE_COLORS.good : entry.oee >= 60 ? OEE_COLORS.warning : OEE_COLORS.bad} />
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
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">Job</th>
                  <th className="text-left px-4 py-3 font-medium">Start</th>
                  <th className="text-left px-4 py-3 font-medium">End</th>
                  <th className="text-right px-4 py-3 font-medium">Good</th>
                  <th className="text-right px-4 py-3 font-medium">Reject</th>
                  <th className="text-right px-4 py-3 font-medium">OEE</th>
                  <th className="text-left px-4 py-3 font-medium">Shift</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-4 py-3 text-slate-200">{run.job_name || '\u2014'}</td>
                    <td className="px-4 py-3 text-slate-300">{new Date(run.start_time).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-300">{run.end_time ? new Date(run.end_time).toLocaleString() : 'In progress'}</td>
                    <td className="px-4 py-3 text-right text-green-400">{run.good_count}</td>
                    <td className="px-4 py-3 text-right text-red-400">{run.reject_count}</td>
                    <td className="px-4 py-3 text-right">
                      {run.oee != null ? (
                        <span className={`font-medium ${run.oee >= 0.85 ? 'text-green-400' : run.oee >= 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {(run.oee * 100).toFixed(1)}%
                        </span>
                      ) : '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{run.shift || '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="text-center text-slate-500 py-20">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-50" />
          <p>No production runs recorded</p>
        </div>
      )}
    </div>
  );
}
