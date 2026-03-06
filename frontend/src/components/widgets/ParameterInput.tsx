import { useState } from 'react';
import { api } from '../../lib/api';
import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { NumericKeypad } from './TouchInput';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  min?: number;
  max?: number;
  step?: number;
  units?: string;
  decimalPlaces?: number;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
}

export function ParameterInput({ title, tag, tagValues, min = 0, max = 100, step = 1, units = '', decimalPlaces = 1, titleStyle, valueStyle }: Props) {
  const tv = tagValues[tag];
  const currentValue = Number(tv?.value ?? 0);
  const [showKeypad, setShowKeypad] = useState(false);

  const handleSubmit = async (val: string) => {
    const num = Number(val);
    if (isNaN(num)) return;
    const clamped = Math.max(min, Math.min(max, num));
    await api.writeTag(tag, clamped);
    setShowKeypad(false);
  };

  return (
    <div className="bg-slate-800 rounded-xl p-4 h-full flex flex-col border border-slate-700">
      <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider" style={textStyleToCSS(titleStyle)}>{title}</div>
      <div className="flex-1 flex flex-col justify-center gap-2">
        <button
          onClick={() => setShowKeypad(true)}
          className="text-left group"
        >
          <div className="text-2xl font-bold text-slate-100 group-hover:text-blue-300 transition-colors" style={textStyleToCSS(valueStyle)}>
            {currentValue.toFixed(decimalPlaces)}
            <span className="text-sm font-normal text-slate-400 ml-1">{units}</span>
          </div>
          <div className="text-xs text-blue-400 group-hover:text-blue-300 mt-1">Tap to change</div>
        </button>
        <div className="text-xs text-slate-500">Range: {min} – {max} {units}</div>
      </div>
      {showKeypad && (
        <NumericKeypad
          value={String(currentValue)}
          title={title}
          units={units}
          min={min}
          max={max}
          onSubmit={handleSubmit}
          onClose={() => setShowKeypad(false)}
        />
      )}
    </div>
  );
}
