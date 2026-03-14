import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { TimeSeriesPoint } from '../../types';

interface Props {
  data: TimeSeriesPoint[];
  displayMode?: 'count' | 'rate';
}

export function ProductionTrendChart({ data, displayMode = 'count' }: Props) {
  const isRate = displayMode === 'rate';
  const chartData = data.map(d => {
    if (isRate && d.total_duration_seconds > 0) {
      const hours = d.total_duration_seconds / 3600;
      return { period: d.period, good: Math.round(d.total_good / hours), reject: Math.round(d.total_reject / hours) };
    }
    return { period: d.period, good: d.total_good, reject: d.total_reject };
  });

  const title = isRate ? 'Production Rate (packs/hr)' : 'Production Volume';

  if (chartData.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-3">{title}</h3>
        <div className="text-center text-slate-500 py-12">No data available</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-300 mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
          <Legend />
          <Bar dataKey="good" fill="#22c55e" name={isRate ? 'Good (packs/hr)' : 'Good'} stackId="a" />
          <Bar dataKey="reject" fill="#ef4444" name={isRate ? 'Reject (packs/hr)' : 'Reject'} stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
