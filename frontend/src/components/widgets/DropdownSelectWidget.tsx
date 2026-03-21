import { memo } from 'react';
import { api } from '../../lib/api';
import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, shouldShowExtras, getTitleClasses } from '../../lib/widgetChrome';

interface SelectOption {
  label: string;
  value: unknown;
}

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  options?: SelectOption[];
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export const DropdownSelectWidget = memo(function DropdownSelectWidget({ title, tag, tagValues, options = [], titleStyle, valueStyle, chrome = 'full' }: Props) {
  const tv = tagValues[tag];
  const currentValue = tv?.value;

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = Number(e.target.value);
    if (idx >= 0 && idx < options.length) {
      await api.writeTag(tag, options[idx].value);
    }
  };

  const currentIdx = options.findIndex(o => String(o.value) === String(currentValue));

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col justify-center`}>
      {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>}
      <select
        value={currentIdx >= 0 ? currentIdx : ''}
        onChange={handleChange}
        className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 min-h-[44px] text-base text-white outline-none focus:border-blue-500"
        style={textStyleToCSS(valueStyle)}
      >
        {currentIdx < 0 && <option value="" disabled>{currentValue != null ? String(currentValue) : '—'}</option>}
        {options.map((opt, i) => (
          <option key={i} value={i}>{opt.label}</option>
        ))}
      </select>
      {shouldShowExtras(chrome) && options.length === 0 && (
        <div className="text-sm text-slate-500 mt-1">No options configured</div>
      )}
    </div>
  );
});
