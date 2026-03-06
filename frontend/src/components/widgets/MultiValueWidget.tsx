import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';

interface TagEntry {
  tag: string;
  label: string;
  units?: string;
}

interface Props {
  title: string;
  tags: TagEntry[];
  tagValues: Record<string, TagValue>;
  decimalPlaces?: number;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
}

export function MultiValueWidget({ title, tags = [], tagValues, decimalPlaces = 1, titleStyle, valueStyle }: Props) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 h-full flex flex-col border border-slate-700">
      <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider" style={textStyleToCSS(titleStyle)}>{title}</div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <tbody>
            {tags.map((entry) => {
              const tv = tagValues[entry.tag];
              const val = tv?.value;
              const display = val != null ? (typeof val === 'number' ? val.toFixed(decimalPlaces) : String(val)) : '—';
              return (
                <tr key={entry.tag} className="border-b border-slate-700/50 last:border-0">
                  <td className="py-1 text-slate-400 pr-3">{entry.label}</td>
                  <td className="py-1 text-right font-medium text-slate-100" style={textStyleToCSS(valueStyle)}>
                    {display}
                    {entry.units && <span className="text-xs text-slate-500 ml-1">{entry.units}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {tags.length === 0 && (
          <div className="text-xs text-slate-500 text-center py-2">No tags configured</div>
        )}
      </div>
    </div>
  );
}
