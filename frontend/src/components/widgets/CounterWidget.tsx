import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  resetTag?: string;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
}

export function CounterWidget({ title, tag, tagValues, titleStyle, valueStyle }: Props) {
  const tv = tagValues[tag];
  const raw = tv?.value ?? 0;
  const value = typeof raw === 'number' ? Math.round(raw) : raw;

  return (
    <div className="bg-slate-800 rounded-xl p-4 h-full flex flex-col justify-center items-center border border-slate-700">
      <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider" style={textStyleToCSS(titleStyle)}>{title}</div>
      <div className="text-4xl font-bold text-slate-100" style={textStyleToCSS(valueStyle)}>{String(value)}</div>
    </div>
  );
}
