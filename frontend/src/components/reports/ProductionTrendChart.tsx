import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { TimeSeriesPoint } from '../../types';

interface Props {
  data: TimeSeriesPoint[];
}

export function ProductionTrendChart({ data }: Props) {
  const chartData = data.map(d => ({
    period: d.period,
    good: d.total_good,
    reject: d.total_reject,
  }));

  if (chartData.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Production Volume</h3>
        <div className="text-center text-slate-500 py-12">No data available</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-300 mb-3">Production Volume</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
          <Legend />
          <Bar dataKey="good" fill="#22c55e" name="Good" stackId="a" />
          <Bar dataKey="reject" fill="#ef4444" name="Reject" stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
