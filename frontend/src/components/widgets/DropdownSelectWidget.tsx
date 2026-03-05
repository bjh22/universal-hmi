import { api } from '../../lib/api';
import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';

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
}

export function DropdownSelectWidget({ title, tag, tagValues, options = [], titleStyle, valueStyle }: Props) {
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
    <div className="bg-slate-800 rounded-xl p-4 h-full flex flex-col justify-center border border-slate-700">
      <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider" style={textStyleToCSS(titleStyle)}>{title}</div>
      <select
        value={currentIdx >= 0 ? currentIdx : ''}
        onChange={handleChange}
        className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        style={textStyleToCSS(valueStyle)}
      >
        {currentIdx < 0 && <option value="" disabled>{currentValue != null ? String(currentValue) : '—'}</option>}
        {options.map((opt, i) => (
          <option key={i} value={i}>{opt.label}</option>
        ))}
      </select>
      {options.length === 0 && (
        <div className="text-xs text-slate-500 mt-1">No options configured</div>
      )}
    </div>
  );
}
