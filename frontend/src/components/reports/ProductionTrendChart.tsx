import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { TimeSeriesPoint } from '../../types';
import { formatPeriodLabel } from './formatPeriod';

interface Props {
  data: TimeSeriesPoint[];
  displayMode?: 'count' | 'rate';
}

export function ProductionTrendChart({ data, displayMode = 'count' }: Props) {
  const isRate = displayMode === 'rate';
  const chartData = data.map(d => {
    if (isRate) {
      const hours = d.total_duration_seconds > 0 ? d.total_duration_seconds / 3600 : 0;
      return {
        period: d.period,
        good: hours > 0 ? Math.round(d.total_good / hours) : 0,
        reject: hours > 0 ? Math.round(d.total_reject / hours) : 0,
      };
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

  const sharedXAxis = (
    <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={formatPeriodLabel} angle={-30} textAnchor="end" height={55} />
  );
  const sharedYAxis = <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />;
  const sharedGrid = <CartesianGrid strokeDasharray="3 3" stroke="#334155" />;
  const sharedTooltip = (
    <Tooltip
      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
      labelFormatter={formatPeriodLabel}
      formatter={(value: number, name: string) => [value.toLocaleString(), name]}
    />
  );
  const sharedLegend = <Legend wrapperStyle={{ fontSize: 11 }} />;

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-300 mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={320}>
        {isRate ? (
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            {sharedGrid}
            {sharedXAxis}
            {sharedYAxis}
            {sharedTooltip}
            {sharedLegend}
            <Line type="monotone" dataKey="good" stroke="#22c55e" strokeWidth={2} name="Good (packs/hr)" dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="reject" stroke="#ef4444" strokeWidth={2} name="Reject (packs/hr)" dot={{ r: 3 }} connectNulls />
          </LineChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            {sharedGrid}
            {sharedXAxis}
            {sharedYAxis}
            {sharedTooltip}
            {sharedLegend}
            <Bar dataKey="good" fill="#22c55e" name="Good" stackId="a" radius={[2, 2, 0, 0]} />
            <Bar dataKey="reject" fill="#ef4444" name="Reject" stackId="a" radius={[2, 2, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
