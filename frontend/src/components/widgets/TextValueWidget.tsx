import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  units?: string;
  format?: string; // 'decimal:N' e.g. 'decimal:2'
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
}

function formatValue(raw: unknown, format?: string): string {
  if (raw == null) return '—';
  if (typeof raw === 'number' && format?.startsWith('decimal:')) {
    const places = parseInt(format.split(':')[1], 10);
    return isNaN(places) ? String(raw) : raw.toFixed(places);
  }
  return String(raw);
}

export function TextValueWidget({ title, tag, tagValues, units, format, titleStyle, valueStyle }: Props) {
  const tv = tagValues[tag];
  const display = formatValue(tv?.value, format);

  return (
    <div className="bg-slate-800 rounded-xl p-4 h-full flex flex-col justify-center border border-slate-700">
      <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider" style={textStyleToCSS(titleStyle)}>{title}</div>
      <div className="text-2xl font-bold text-slate-100" style={textStyleToCSS(valueStyle)}>
        {display}
        {units && <span className="text-sm font-normal text-slate-400 ml-1">{units}</span>}
      </div>
      {tv && <div className="text-xs text-slate-500 mt-1">{tag}</div>}
    </div>
  );
}
