import { api } from '../../lib/api';
import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export function ToggleWidget({ title, tag, tagValues, titleStyle, valueStyle, chrome = 'full' }: Props) {
  const tv = tagValues[tag];
  const value = Boolean(tv?.value);

  const handleToggle = async () => {
    await api.writeTag(tag, !value);
  };

  const isNone = chrome === 'none';

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex ${isNone ? 'flex-row items-center gap-2' : 'flex-col justify-center items-center'}`}>
      {shouldShowTitle(chrome) && <div className={`${getTitleClasses(chrome)} ${isNone ? '' : 'mb-3'}`} style={textStyleToCSS(titleStyle)}>{title}</div>}
      <button
        onClick={handleToggle}
        className={`w-16 h-8 rounded-full transition-colors relative ${
          value ? 'bg-green-500' : 'bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform shadow-md ${
            value ? 'left-9' : 'left-1'
          }`}
        />
      </button>
      <div className={`text-sm font-medium ${value ? 'text-green-400' : 'text-slate-400'} ${isNone ? '' : 'mt-2'}`} style={textStyleToCSS(valueStyle)}>
        {value ? 'ON' : 'OFF'}
      </div>
    </div>
  );
}
