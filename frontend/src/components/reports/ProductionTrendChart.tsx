import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { ReportBucket } from '../../types';
import { formatPeriodLabel } from './formatPeriod';

interface Props {
  data: ReportBucket[];
}

export function ProductionTrendChart({ data }: Props) {
  const chartData = data.map(d => ({
    period: d.period,
    good: d.count,
    reject: d.reject_count,
    rate: d.rate,
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
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={formatPeriodLabel} angle={-30} textAnchor="end" height={55} />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
            labelFormatter={(label) => formatPeriodLabel(String(label))}
            formatter={(value) => [Number(value).toLocaleString()]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="good" fill="#22c55e" name="Good" stackId="a" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="reject" fill="#ef4444" name="Reject" stackId="a" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
