import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { ReportBucket } from '../../types';
import { formatPeriodLabel } from './formatPeriod';

interface Props {
  data: ReportBucket[];
}

export function MachineStateChart({ data }: Props) {
  const chartData = data.map(d => ({
    period: d.period,
    uptime: +(d.uptime_seconds / 3600).toFixed(2),
    downtime: +(d.downtime_seconds / 3600).toFixed(2),
    idle: +(d.idle_seconds / 3600).toFixed(2),
  }));

  if (chartData.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Machine State</h3>
        <div className="text-center text-slate-500 py-12">No data available</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-300 mb-3">Machine State (hours)</h3>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={formatPeriodLabel} angle={-30} textAnchor="end" height={55} />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit="h" />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
            labelFormatter={(label) => formatPeriodLabel(String(label))}
            formatter={(value) => [`${value} hrs`]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="uptime" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} name="Uptime" />
          <Area type="monotone" dataKey="downtime" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Downtime" />
          <Area type="monotone" dataKey="idle" stackId="1" stroke="#64748b" fill="#64748b" fillOpacity={0.4} name="Idle" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
