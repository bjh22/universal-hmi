import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { api } from '../lib/api';
import type { ProductionRun } from '../types';

export function ReportsPage() {
  const [runs, setRuns] = useState<ProductionRun[]>([]);

  useEffect(() => {
    api.getProductionRuns().then(setRuns).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-100 mb-4">Production Reports</h1>

      {runs.length > 0 ? (
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
                  <td className="px-4 py-3 text-slate-200">{run.job_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{new Date(run.start_time).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-300">{run.end_time ? new Date(run.end_time).toLocaleString() : 'In progress'}</td>
                  <td className="px-4 py-3 text-right text-green-400">{run.good_count}</td>
                  <td className="px-4 py-3 text-right text-red-400">{run.reject_count}</td>
                  <td className="px-4 py-3 text-right">
                    {run.oee != null ? (
                      <span className={`font-medium ${run.oee >= 0.85 ? 'text-green-400' : run.oee >= 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {(run.oee * 100).toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{run.shift || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center text-slate-500 py-20">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-50" />
          <p>No production runs recorded</p>
        </div>
      )}
    </div>
  );
}
