import type { TagValue } from '../../types';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  min?: number;
  max?: number;
  units?: string;
  warning?: number;
  critical?: number;
}

export function GaugeWidget({ title, tag, tagValues, min = 0, max = 100, units = '', warning, critical }: Props) {
  const tv = tagValues[tag];
  const value = Number(tv?.value ?? 0);
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  let color = '#3b82f6'; // blue
  if (critical && value >= critical) color = '#ef4444';
  else if (warning && value >= warning) color = '#f59e0b';

  return (
    <div className="bg-slate-800 rounded-xl p-4 h-full flex flex-col border border-slate-700">
      <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">{title}</div>
      <div className="flex-1 flex flex-col justify-center">
        <div className="text-3xl font-bold mb-1" style={{ color }}>
          {value.toFixed(1)}
          <span className="text-sm font-normal text-slate-400 ml-1">{units}</span>
        </div>
        {/* Bar gauge */}
        <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden mt-2">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
  );
}
