/**
 * TimeBreakdownBar — a horizontal stacked bar chart showing how production time
 * is split between uptime (machine cycling), downtime (faulted), and idle (neither).
 *
 * Used on the Reports page to give operators and supervisors a quick visual summary
 * of machine utilization for a selected timeframe. The three segments are color-coded
 * green/red/gray and sized proportionally to their duration.
 */
interface Props {
  uptimeSeconds: number;
  downtimeSeconds: number;
  idleSeconds: number;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function TimeBreakdownBar({ uptimeSeconds, downtimeSeconds, idleSeconds }: Props) {
  const total = uptimeSeconds + downtimeSeconds + idleSeconds;
  if (total <= 0) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Time Breakdown</h3>
        <div className="text-center text-slate-500 py-4">No data available</div>
      </div>
    );
  }

  const uptimePct = (uptimeSeconds / total) * 100;
  const downtimePct = (downtimeSeconds / total) * 100;
  const idlePct = (idleSeconds / total) * 100;

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-300 mb-3">Time Breakdown</h3>
      <div className="flex h-8 rounded-lg overflow-hidden">
        {uptimePct > 0 && (
          <div
            className="bg-green-500 flex items-center justify-center text-xs font-medium text-white"
            style={{ width: `${uptimePct}%` }}
            title={`Uptime: ${formatDuration(uptimeSeconds)} (${uptimePct.toFixed(1)}%)`}
          >
            {uptimePct > 10 && `${uptimePct.toFixed(0)}%`}
          </div>
        )}
        {downtimePct > 0 && (
          <div
            className="bg-red-500 flex items-center justify-center text-xs font-medium text-white"
            style={{ width: `${downtimePct}%` }}
            title={`Downtime: ${formatDuration(downtimeSeconds)} (${downtimePct.toFixed(1)}%)`}
          >
            {downtimePct > 10 && `${downtimePct.toFixed(0)}%`}
          </div>
        )}
        {idlePct > 0 && (
          <div
            className="bg-slate-500 flex items-center justify-center text-xs font-medium text-white"
            style={{ width: `${idlePct}%` }}
            title={`Idle: ${formatDuration(idleSeconds)} (${idlePct.toFixed(1)}%)`}
          >
            {idlePct > 10 && `${idlePct.toFixed(0)}%`}
          </div>
        )}
      </div>
      <div className="flex gap-4 mt-2 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500" />
          Uptime: {formatDuration(uptimeSeconds)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
          Downtime: {formatDuration(downtimeSeconds)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-500" />
          Idle: {formatDuration(idleSeconds)}
        </span>
      </div>
    </div>
  );
}
