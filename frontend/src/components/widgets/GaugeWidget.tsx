import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';

export type GaugeDisplayMode = 'bar' | 'radial' | 'donut' | 'vertical' | 'numeric';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  min?: number;
  max?: number;
  units?: string;
  warning?: number;
  critical?: number;
  decimalPlaces?: number;
  displayMode?: GaugeDisplayMode;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
}

function getColor(value: number, warning?: number, critical?: number): string {
  if (critical != null && value >= critical) return '#ef4444';
  if (warning != null && value >= warning) return '#f59e0b';
  return '#3b82f6';
}

// ─── Horizontal bar (original) ───
function BarGauge({ value, pct, color, min, max, units, decimalPlaces, valueStyle }: {
  value: number; pct: number; color: string; min: number; max: number; units: string; decimalPlaces: number; valueStyle?: TextStyle;
}) {
  return (
    <>
      <div className="text-3xl font-bold mb-1" style={{ color, ...textStyleToCSS(valueStyle) }}>
        {value.toFixed(decimalPlaces)}
        <span className="text-sm font-normal text-slate-400 ml-1">{units}</span>
      </div>
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
    </>
  );
}

// ─── Radial / dial gauge ───
function RadialGauge({ value, pct, color, min, max, units, decimalPlaces, valueStyle }: {
  value: number; pct: number; color: string; min: number; max: number; units: string; decimalPlaces: number; valueStyle?: TextStyle;
}) {
  // 240-degree arc from bottom-left to bottom-right
  const ARC_DEG = 240;
  const START_DEG = 150;
  const R = 44;
  const CX = 50;
  const CY = 50;

  const startAngle = (START_DEG * Math.PI) / 180;
  const endAngle = ((START_DEG + ARC_DEG) * Math.PI) / 180;
  const needleAngle = ((START_DEG + ARC_DEG * (pct / 100)) * Math.PI) / 180;

  const arcPath = (cx: number, cy: number, r: number, start: number, end: number) => {
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  const needleX = CX + (R - 8) * Math.cos(needleAngle);
  const needleY = CY + (R - 8) * Math.sin(needleAngle);

  return (
    <div className="flex flex-col items-center justify-center flex-1">
      <svg viewBox="0 0 100 100" className="w-full max-w-[160px]">
        {/* Background arc */}
        <path d={arcPath(CX, CY, R, startAngle, endAngle)} fill="none" stroke="#334155" strokeWidth="6" strokeLinecap="round" />
        {/* Filled arc */}
        <path d={arcPath(CX, CY, R, startAngle, needleAngle)} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          className="transition-all duration-300" />
        {/* Needle dot */}
        <circle cx={needleX} cy={needleY} r="3" fill={color} className="transition-all duration-300" />
        {/* Center value */}
        <text x={CX} y={CY + 2} textAnchor="middle" fill={color} fontSize="14" fontWeight="bold" style={textStyleToCSS(valueStyle)}>
          {value.toFixed(decimalPlaces)}
        </text>
        <text x={CX} y={CY + 12} textAnchor="middle" fill="#64748b" fontSize="6">
          {units}
        </text>
        {/* Min/Max labels */}
        <text x={CX + R * Math.cos(startAngle) + 4} y={CY + R * Math.sin(startAngle) + 6} textAnchor="middle" fill="#475569" fontSize="5">{min}</text>
        <text x={CX + R * Math.cos(endAngle) - 4} y={CY + R * Math.sin(endAngle) + 6} textAnchor="middle" fill="#475569" fontSize="5">{max}</text>
      </svg>
    </div>
  );
}

// ─── Donut / ring gauge ───
function DonutGauge({ value, pct, color, units, decimalPlaces, valueStyle }: {
  value: number; pct: number; color: string; units: string; decimalPlaces: number; valueStyle?: TextStyle;
}) {
  const R = 40;
  const circumference = 2 * Math.PI * R;
  const offset = circumference - (circumference * pct) / 100;

  return (
    <div className="flex flex-col items-center justify-center flex-1">
      <svg viewBox="0 0 100 100" className="w-full max-w-[140px]">
        {/* Background ring */}
        <circle cx="50" cy="50" r={R} fill="none" stroke="#334155" strokeWidth="8" />
        {/* Filled ring */}
        <circle cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          className="transition-all duration-300" />
        {/* Center value */}
        <text x="50" y="48" textAnchor="middle" fill={color} fontSize="16" fontWeight="bold" style={textStyleToCSS(valueStyle)}>
          {value.toFixed(decimalPlaces)}
        </text>
        <text x="50" y="60" textAnchor="middle" fill="#64748b" fontSize="7">
          {units}
        </text>
      </svg>
    </div>
  );
}

// ─── Vertical bar gauge ───
function VerticalGauge({ value, pct, color, min, max, units, decimalPlaces, warning, critical, valueStyle }: {
  value: number; pct: number; color: string; min: number; max: number; units: string; decimalPlaces: number;
  warning?: number; critical?: number; valueStyle?: TextStyle;
}) {
  // Calculate threshold positions as percentages
  const range = max - min || 1;
  const warnPct = warning != null ? ((warning - min) / range) * 100 : null;
  const critPct = critical != null ? ((critical - min) / range) * 100 : null;

  return (
    <div className="flex items-end gap-3 flex-1">
      <div className="relative flex-1 flex flex-col items-center h-full">
        {/* Value on top */}
        <div className="text-2xl font-bold mb-2" style={{ color, ...textStyleToCSS(valueStyle) }}>
          {value.toFixed(decimalPlaces)}
          <span className="text-xs font-normal text-slate-400 ml-1">{units}</span>
        </div>
        {/* Vertical bar container */}
        <div className="relative w-8 flex-1 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-300"
            style={{ height: `${pct}%`, backgroundColor: color }}
          />
          {/* Threshold markers */}
          {warnPct != null && (
            <div className="absolute left-0 right-0 h-px bg-yellow-500/60" style={{ bottom: `${warnPct}%` }} />
          )}
          {critPct != null && (
            <div className="absolute left-0 right-0 h-px bg-red-500/60" style={{ bottom: `${critPct}%` }} />
          )}
        </div>
        {/* Min / Max labels */}
        <div className="flex justify-between w-full text-xs text-slate-500 mt-1 px-1">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Numeric-only card ───
function NumericGauge({ value, color, units, decimalPlaces, valueStyle }: {
  value: number; color: string; units: string; decimalPlaces: number; valueStyle?: TextStyle;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className="text-4xl font-bold" style={{ color, ...textStyleToCSS(valueStyle) }}>
        {value.toFixed(decimalPlaces)}
      </div>
      {units && (
        <div className="text-sm text-slate-400 mt-1">{units}</div>
      )}
    </div>
  );
}

// ─── Main component ───
export function GaugeWidget({
  title, tag, tagValues, min = 0, max = 100, units = '', warning, critical,
  decimalPlaces = 1, displayMode = 'bar', titleStyle, valueStyle,
}: Props) {
  const tv = tagValues[tag];
  const value = Number(tv?.value ?? 0);
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  const color = getColor(value, warning, critical);

  const shared = { value, pct, color, min, max, units, decimalPlaces, valueStyle };

  return (
    <div className="bg-slate-800 rounded-xl p-4 h-full flex flex-col border border-slate-700">
      <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider" style={textStyleToCSS(titleStyle)}>{title}</div>
      <div className="flex-1 flex flex-col justify-center">
        {displayMode === 'radial' && <RadialGauge {...shared} />}
        {displayMode === 'donut' && <DonutGauge {...shared} />}
        {displayMode === 'vertical' && <VerticalGauge {...shared} warning={warning} critical={critical} />}
        {displayMode === 'numeric' && <NumericGauge {...shared} />}
        {(displayMode === 'bar' || !displayMode) && <BarGauge {...shared} />}
      </div>
    </div>
  );
}
