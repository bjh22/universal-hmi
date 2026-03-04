import { api } from '../../lib/api';
import type { TagValue } from '../../types';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
}

export function ToggleWidget({ title, tag, tagValues }: Props) {
  const tv = tagValues[tag];
  const value = Boolean(tv?.value);

  const handleToggle = async () => {
    await api.writeTag(tag, !value);
  };

  return (
    <div className="bg-slate-800 rounded-xl p-4 h-full flex flex-col justify-center items-center border border-slate-700">
      <div className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wider">{title}</div>
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
      <div className={`text-sm mt-2 font-medium ${value ? 'text-green-400' : 'text-slate-400'}`}>
        {value ? 'ON' : 'OFF'}
      </div>
    </div>
  );
}
