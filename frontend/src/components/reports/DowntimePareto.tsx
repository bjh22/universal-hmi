import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { DowntimeSummary } from '../../types';

interface Props {
  data: DowntimeSummary[];
}

export function DowntimePareto({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Downtime Pareto Analysis</h3>
        <div className="text-center text-slate-500 py-12">No downtime events recorded</div>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.total_duration, 0);
  const paretoData = data.reduce<{ reason_code: string; duration_minutes: number; cumulative_pct: number }[]>((acc, d) => {
    const prevCum = acc.length > 0 ? acc[acc.length - 1].cumulative_pct : 0;
    const thisDur = d.total_duration;
    const cumPct = total > 0 ? prevCum + (thisDur / total) * 100 : 0;
    acc.push({
      reason_code: d.reason_code,
      duration_minutes: +(thisDur / 60).toFixed(1),
      cumulative_pct: +cumPct.toFixed(1),
    });
    return acc;
  }, []);

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-300 mb-3">Downtime Pareto Analysis</h3>
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
    </div>
  );
}
