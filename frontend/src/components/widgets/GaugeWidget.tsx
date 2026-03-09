import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';

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
  valueFontSize?: number;
  barThickness?: number;
  gaugeSize?: number;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

function getColor(value: number, warning?: number, critical?: number): string {
  if (critical != null && value >= critical) return '#ef4444';
  if (warning != null && value >= warning) return '#f59e0b';
  return '#3b82f6';
}

// ─── Horizontal bar ───
function BarGauge({ value, pct, color, min, max, units, decimalPlaces, valueFontSize, barThickness, valueStyle }: {
  value: number; pct: number; color: string; min: number; max: number; units: string; decimalPlaces: number;
  valueFontSize: number; barThickness: number; valueStyle?: TextStyle;
}) {
  const unitSize = Math.max(10, Math.round(valueFontSize * 0.45));
  const labelSize = Math.max(10, Math.round(valueFontSize * 0.4));

  return (
    <>
      <div className="font-bold mb-1" style={{ fontSize: `${valueFontSize}px`, color, ...textStyleToCSS(valueStyle) }}>
        {value.toFixed(decimalPlaces)}
        <span className="font-normal text-slate-400 ml-1" style={{ fontSize: `${unitSize}px` }}>{units}</span>
      </div>
      <div className="w-full bg-slate-700 rounded-full overflow-hidden mt-2" style={{ height: `${barThickness}px` }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-slate-500 mt-1" style={{ fontSize: `${labelSize}px` }}>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </>
  );
}

// ─── Radial / dial gauge ───
function RadialGauge({ value, pct, color, min, max, units, decimalPlaces, valueFontSize, barThickness, gaugeSize, valueStyle }: {
  value: number; pct: number; color: string; min: number; max: number; units: string; decimalPlaces: number;
  valueFontSize: number; barThickness: number; gaugeSize: number; valueStyle?: TextStyle;
}) {
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
  const unitSize = Math.max(4, Math.round(valueFontSize * 0.42));
  const labelSize = Math.max(4, Math.round(valueFontSize * 0.36));
  const dotR = Math.max(2, Math.round(barThickness * 0.5));

  return (
    <div className="flex-1 min-h-0 relative">
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 100 100" style={{ height: '100%', width: 'auto', maxWidth: `${gaugeSize}%`, display: 'block' }}>
          <path d={arcPath(CX, CY, R, startAngle, endAngle)} fill="none" stroke="#334155" strokeWidth={barThickness} strokeLinecap="round" />
          <path d={arcPath(CX, CY, R, startAngle, needleAngle)} fill="none" stroke={color} strokeWidth={barThickness} strokeLinecap="round"
            className="transition-all duration-300" />
          <circle cx={needleX} cy={needleY} r={dotR} fill={color} className="transition-all duration-300" />
          <text x={CX} y={CY + 2} textAnchor="middle" fill={color} fontSize={valueFontSize} fontWeight="bold" style={textStyleToCSS(valueStyle)}>
            {value.toFixed(decimalPlaces)}
          </text>
          <text x={CX} y={CY + 2 + valueFontSize * 0.75} textAnchor="middle" fill="#64748b" fontSize={unitSize}>
            {units}
          </text>
          <text x={CX + R * Math.cos(startAngle) + 4} y={CY + R * Math.sin(startAngle) + 6} textAnchor="middle" fill="#475569" fontSize={labelSize}>{min}</text>
          <text x={CX + R * Math.cos(endAngle) - 4} y={CY + R * Math.sin(endAngle) + 6} textAnchor="middle" fill="#475569" fontSize={labelSize}>{max}</text>
        </svg>
      </div>
    </div>
  );
}

// ─── Donut / ring gauge ───
function DonutGauge({ value, pct, color, units, decimalPlaces, valueFontSize, barThickness, gaugeSize, valueStyle }: {
  value: number; pct: number; color: string; units: string; decimalPlaces: number;
  valueFontSize: number; barThickness: number; gaugeSize: number; valueStyle?: TextStyle;
}) {
  const R = 40;
  const circumference = 2 * Math.PI * R;
  const offset = circumference - (circumference * pct) / 100;
  const unitSize = Math.max(4, Math.round(valueFontSize * 0.42));

  return (
    <div className="flex-1 min-h-0 relative">
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 100 100" style={{ height: '100%', width: 'auto', maxWidth: `${gaugeSize}%`, display: 'block' }}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="#334155" strokeWidth={barThickness} />
          <circle cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth={barThickness} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
            className="transition-all duration-300" />
          <text x="50" y="48" textAnchor="middle" fill={color} fontSize={valueFontSize} fontWeight="bold" style={textStyleToCSS(valueStyle)}>
            {value.toFixed(decimalPlaces)}
          </text>
          <text x="50" y={48 + valueFontSize * 0.75} textAnchor="middle" fill="#64748b" fontSize={unitSize}>
            {units}
          </text>
        </svg>
      </div>
    </div>
  );
}

// ─── Vertical bar gauge ───
function VerticalGauge({ value, pct, color, min, max, units, decimalPlaces, warning, critical, valueFontSize, barThickness, valueStyle }: {
  value: number; pct: number; color: string; min: number; max: number; units: string; decimalPlaces: number;
  warning?: number; critical?: number; valueFontSize: number; barThickness: number; valueStyle?: TextStyle;
}) {
  const range = max - min || 1;
  const warnPct = warning != null ? ((warning - min) / range) * 100 : null;
  const critPct = critical != null ? ((critical - min) / range) * 100 : null;
  const unitSize = Math.max(10, Math.round(valueFontSize * 0.5));
  const labelSize = Math.max(10, Math.round(valueFontSize * 0.5));

  return (
    <div className="flex items-end gap-3 flex-1">
      <div className="relative flex-1 flex flex-col items-center h-full">
        <div className="font-bold mb-2" style={{ fontSize: `${valueFontSize}px`, color, ...textStyleToCSS(valueStyle) }}>
          {value.toFixed(decimalPlaces)}
          <span className="font-normal text-slate-400 ml-1" style={{ fontSize: `${unitSize}px` }}>{units}</span>
        </div>
        <div className="relative flex-1 bg-slate-700 rounded-full overflow-hidden" style={{ width: `${barThickness}px` }}>
          <div
            className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-300"
            style={{ height: `${pct}%`, backgroundColor: color }}
          />
          {warnPct != null && (
            <div className="absolute left-0 right-0 h-px bg-yellow-500/60" style={{ bottom: `${warnPct}%` }} />
          )}
          {critPct != null && (
            <div className="absolute left-0 right-0 h-px bg-red-500/60" style={{ bottom: `${critPct}%` }} />
          )}
        </div>
        <div className="flex justify-between w-full text-slate-500 mt-1 px-1" style={{ fontSize: `${labelSize}px` }}>
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Numeric-only card ───
function NumericGauge({ value, color, units, decimalPlaces, valueFontSize, valueStyle }: {
  value: number; color: string; units: string; decimalPlaces: number; valueFontSize: number; valueStyle?: TextStyle;
}) {
  const unitSize = Math.max(10, Math.round(valueFontSize * 0.4));

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className="font-bold" style={{ fontSize: `${valueFontSize}px`, color, ...textStyleToCSS(valueStyle) }}>
        {value.toFixed(decimalPlaces)}
      </div>
      {units && (
        <div className="text-slate-400 mt-1" style={{ fontSize: `${unitSize}px` }}>{units}</div>
      )}
    </div>
  );
}

// ─── Default sizes per mode ───
const DEFAULTS: Record<GaugeDisplayMode, { valueFontSize: number; barThickness: number; gaugeSize: number }> = {
  bar:      { valueFontSize: 36, barThickness: 12, gaugeSize: 100 },
  radial:   { valueFontSize: 18, barThickness: 6,  gaugeSize: 100 },
  donut:    { valueFontSize: 20, barThickness: 8,  gaugeSize: 100 },
  vertical: { valueFontSize: 30, barThickness: 32, gaugeSize: 100 },
  numeric:  { valueFontSize: 42, barThickness: 12, gaugeSize: 100 },
};

// ─── Main component ───
export function GaugeWidget({
  title, tag, tagValues, min = 0, max = 100, units = '', warning, critical,
  decimalPlaces = 1, displayMode = 'bar', valueFontSize, barThickness, gaugeSize,
  titleStyle, valueStyle, chrome = 'full',
}: Props) {
  const tv = tagValues[tag];
  const value = Number(tv?.value ?? 0);
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  const color = getColor(value, warning, critical);

  const defaults = DEFAULTS[displayMode] || DEFAULTS.bar;
  const vfs = valueFontSize ?? defaults.valueFontSize;
  const bt = barThickness ?? defaults.barThickness;
  const gs = gaugeSize ?? defaults.gaugeSize;

  const shared = { value, pct, color, min, max, units, decimalPlaces, valueFontSize: vfs, barThickness: bt, gaugeSize: gs, valueStyle };

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col`}>
      {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>}
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

export { DEFAULTS as GAUGE_DEFAULTS };
