import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, shouldShowExtras, getTitleClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  mapping?: Record<string, { label: string; color: string }>;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export function StatusIndicator({ title, tag, tagValues, mapping = {}, titleStyle, valueStyle, chrome = 'full' }: Props) {
  const tv = tagValues[tag];
  const value = tv?.value;
  const strVal = String(value ?? '');
  const mapped = mapping[strVal];

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col justify-center items-center`}>
      {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>}
      <div
        className="text-xl font-bold px-4 py-2 rounded-lg"
        style={{ backgroundColor: (mapped?.color || '#6b7280') + '20', color: mapped?.color || '#6b7280', ...textStyleToCSS(valueStyle) }}
      >
        {mapped?.label || strVal || '—'}
      </div>
      {shouldShowExtras(chrome) && tv && <div className="text-sm text-slate-500 mt-2">{tv.display_name || tag}</div>}
    </div>
  );
}
