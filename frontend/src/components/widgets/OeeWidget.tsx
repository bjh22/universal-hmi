import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';

interface Props {
  title: string;
  availabilityTag?: string;
  performanceTag?: string;
  qualityTag?: string;
  oeeTag?: string;
  tagValues: Record<string, TagValue>;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
}

export function OeeWidget({ title, availabilityTag, performanceTag, qualityTag, oeeTag, tagValues, titleStyle, valueStyle }: Props) {
  const getVal = (tag?: string) => {
    if (!tag) return null;
    const tv = tagValues[tag];
    return tv?.value != null ? Number(tv.value) : null;
  };

  const availability = getVal(availabilityTag);
  const performance = getVal(performanceTag);
  const quality = getVal(qualityTag);
  let oee = getVal(oeeTag);

  // Calculate OEE if not provided directly but components are
  if (oee == null && availability != null && performance != null && quality != null) {
    oee = (availability / 100) * (performance / 100) * (quality / 100) * 100;
  }

  const oeeColor = (val: number | null) => {
    if (val == null) return 'text-slate-500';
    if (val >= 85) return 'text-green-400';
    if (val >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const barColor = (val: number | null) => {
    if (val == null) return '#475569';
    if (val >= 85) return '#22c55e';
    if (val >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const formatVal = (val: number | null) => val != null ? `${val.toFixed(1)}%` : '\u2014';

  const metrics = [
    { label: 'A', value: availability, name: 'Availability' },
    { label: 'P', value: performance, name: 'Performance' },
    { label: 'Q', value: quality, name: 'Quality' },
  ];

  return (
    <div className="bg-slate-800 rounded-xl p-4 h-full flex flex-col border border-slate-700">
      <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider" style={textStyleToCSS(titleStyle)}>{title || 'OEE'}</div>
      <div className="flex-1 flex flex-col justify-center">
        {/* Main OEE value */}
        <div className="text-center mb-3">
          <div className={`text-3xl font-bold ${oeeColor(oee)}`} style={textStyleToCSS(valueStyle)}>
            {formatVal(oee)}
          </div>
          <div className="text-[10px] text-slate-500 uppercase">OEE</div>
        </div>

        {/* Component bars */}
        <div className="space-y-2">
          {metrics.map(m => (
            <div key={m.label} title={m.name}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-slate-500">{m.label}</span>
                <span className={oeeColor(m.value)}>{formatVal(m.value)}</span>
              </div>
              <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(0, m.value ?? 0))}%`,
                    backgroundColor: barColor(m.value),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
