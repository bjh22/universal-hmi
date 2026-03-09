import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  resetTag?: string;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export function CounterWidget({ title, tag, tagValues, titleStyle, valueStyle, chrome = 'full' }: Props) {
  const tv = tagValues[tag];
  const raw = tv?.value ?? 0;
  const value = typeof raw === 'number' ? Math.round(raw) : raw;

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col justify-center items-center`}>
      {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>}
      <div className="text-5xl font-bold text-slate-100" style={textStyleToCSS(valueStyle)}>{String(value)}</div>
    </div>
  );
}
