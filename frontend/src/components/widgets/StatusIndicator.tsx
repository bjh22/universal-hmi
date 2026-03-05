import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  mapping?: Record<string, { label: string; color: string }>;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
}

export function StatusIndicator({ title, tag, tagValues, mapping = {}, titleStyle, valueStyle }: Props) {
  const tv = tagValues[tag];
  const value = tv?.value;
  const strVal = String(value ?? '');
  const mapped = mapping[strVal];

  return (
    <div className="bg-slate-800 rounded-xl p-4 h-full flex flex-col justify-center items-center border border-slate-700">
      <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider" style={textStyleToCSS(titleStyle)}>{title}</div>
      <div
        className="text-lg font-bold px-4 py-2 rounded-lg"
        style={{ backgroundColor: (mapped?.color || '#6b7280') + '20', color: mapped?.color || '#6b7280', ...textStyleToCSS(valueStyle) }}
      >
        {mapped?.label || strVal || '—'}
      </div>
      {tv && <div className="text-xs text-slate-500 mt-2">{tag}</div>}
    </div>
  );
}
