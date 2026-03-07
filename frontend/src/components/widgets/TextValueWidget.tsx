import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, shouldShowExtras, getTitleClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  units?: string;
  format?: string; // 'decimal:N' e.g. 'decimal:2'
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

function formatValue(raw: unknown, format?: string): string {
  if (raw == null) return '—';
  if (typeof raw === 'number' && format?.startsWith('decimal:')) {
    const places = parseInt(format.split(':')[1], 10);
    return isNaN(places) ? String(raw) : raw.toFixed(places);
  }
  return String(raw);
}

export function TextValueWidget({ title, tag, tagValues, units, format, titleStyle, valueStyle, chrome = 'full' }: Props) {
  const tv = tagValues[tag];
  const display = formatValue(tv?.value, format);

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col justify-center`}>
      {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>}
      <div className="text-2xl font-bold text-slate-100" style={textStyleToCSS(valueStyle)}>
        {display}
        {units && <span className="text-sm font-normal text-slate-400 ml-1">{units}</span>}
      </div>
      {shouldShowExtras(chrome) && tv && <div className="text-xs text-slate-500 mt-1">{tv.description || tag}</div>}
    </div>
  );
}
