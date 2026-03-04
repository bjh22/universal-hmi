import { useState } from 'react';
import { api } from '../../lib/api';
import type { TagValue } from '../../types';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  min?: number;
  max?: number;
  step?: number;
  units?: string;
}

export function ParameterInput({ title, tag, tagValues, min = 0, max = 100, step = 1, units = '' }: Props) {
  const tv = tagValues[tag];
  const currentValue = Number(tv?.value ?? 0);
  const [inputValue, setInputValue] = useState('');
  const [editing, setEditing] = useState(false);

  const handleSubmit = async () => {
    const val = Number(inputValue);
    if (isNaN(val)) return;
    const clamped = Math.max(min, Math.min(max, val));
    await api.writeTag(tag, clamped);
    setEditing(false);
    setInputValue('');
  };

  return (
    <div className="bg-slate-800 rounded-xl p-4 h-full flex flex-col border border-slate-700">
      <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">{title}</div>
      <div className="flex-1 flex flex-col justify-center gap-2">
        <div className="text-2xl font-bold text-slate-100">
          {currentValue.toFixed(1)}
          <span className="text-sm font-normal text-slate-400 ml-1">{units}</span>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <input
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              min={min}
              max={max}
              step={step}
              className="flex-1 bg-slate-700 border border-slate-600 rounded-md px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setEditing(false); }}
            />
            <button onClick={handleSubmit} className="px-3 py-1 bg-blue-600 rounded-md text-sm text-white hover:bg-blue-700">
              Set
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setInputValue(String(currentValue)); setEditing(true); }}
            className="text-xs text-blue-400 hover:text-blue-300 self-start"
          >
            Change value
          </button>
        )}
        <div className="text-xs text-slate-500">Range: {min} – {max} {units}</div>
      </div>
    </div>
  );
}
