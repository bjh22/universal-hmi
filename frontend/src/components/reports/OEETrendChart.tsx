import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { TimeSeriesPoint } from '../../types';

interface Props {
  data: TimeSeriesPoint[];
}

export function OEETrendChart({ data }: Props) {
  const chartData = data.map(d => ({
    period: d.period,
    oee: d.avg_oee != null ? +(d.avg_oee * 100).toFixed(1) : null,
    availability: d.avg_availability != null ? +(d.avg_availability * 100).toFixed(1) : null,
    performance: d.avg_performance != null ? +(d.avg_performance * 100).toFixed(1) : null,
    quality: d.avg_quality != null ? +(d.avg_quality * 100).toFixed(1) : null,
  }));

  if (chartData.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-3">OEE Trend</h3>
        <div className="text-center text-slate-500 py-12">No data available</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-300 mb-3">OEE Trend (%)</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 100]} />
          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
          <ReferenceLine y={85} stroke="#22c55e" strokeDasharray="3 3" label={{ value: '85%', position: 'right', fill: '#22c55e', fontSize: 10 }} />
          <Line type="monotone" dataKey="oee" stroke="#3b82f6" strokeWidth={2} name="OEE" dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="availability" stroke="#22c55e" strokeWidth={1.5} name="Availability" dot={false} connectNulls strokeDasharray="4 2" />
          <Line type="monotone" dataKey="performance" stroke="#f59e0b" strokeWidth={1.5} name="Performance" dot={false} connectNulls strokeDasharray="4 2" />
          <Line type="monotone" dataKey="quality" stroke="#8b5cf6" strokeWidth={1.5} name="Quality" dot={false} connectNulls strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
