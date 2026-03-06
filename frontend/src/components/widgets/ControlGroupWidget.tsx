import { useState } from 'react';
import { api } from '../../lib/api';
import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { NumericKeypad } from './TouchInput';

export type ControlItem =
  | { type: 'toggle'; tag: string; label: string }
  | { type: 'value'; tag: string; label: string; units?: string; decimalPlaces?: number }
  | { type: 'button'; tag: string; label: string; value: unknown; color?: string; confirm?: boolean; script?: string }
  | { type: 'input'; tag: string; label: string; min?: number; max?: number; step?: number; units?: string };

interface Props {
  title: string;
  controls: ControlItem[];
  tagValues: Record<string, TagValue>;
  columns?: number;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
}

// ─── Individual control renderers ───

function ToggleControl({ item, tagValues, valueStyle }: { item: ControlItem & { type: 'toggle' }; tagValues: Record<string, TagValue>; valueStyle?: TextStyle }) {
  const tv = tagValues[item.tag];
  const value = Boolean(tv?.value);

  const handleToggle = async () => {
    await api.writeTag(item.tag, !value);
  };

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-slate-300 truncate" style={textStyleToCSS(valueStyle)}>{item.label}</span>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-[10px] font-medium ${value ? 'text-green-400' : 'text-slate-500'}`}>
          {value ? 'ON' : 'OFF'}
        </span>
        <button
          onClick={handleToggle}
          className={`w-10 h-5 rounded-full transition-colors relative ${value ? 'bg-green-500' : 'bg-slate-600'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${value ? 'left-5.5' : 'left-0.5'}`}
            style={{ left: value ? '1.25rem' : '0.125rem' }}
          />
        </button>
      </div>
    </div>
  );
}

function ValueControl({ item, tagValues, valueStyle }: { item: ControlItem & { type: 'value' }; tagValues: Record<string, TagValue>; valueStyle?: TextStyle }) {
  const tv = tagValues[item.tag];
  const value = tv?.value;
  const dp = item.decimalPlaces ?? 1;
  const display = typeof value === 'number' ? value.toFixed(dp) : String(value ?? '—');

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-slate-300 truncate" style={textStyleToCSS(valueStyle)}>{item.label}</span>
      <span className="text-sm font-semibold text-slate-100 tabular-nums flex-shrink-0" style={textStyleToCSS(valueStyle)}>
        {display}
        {item.units && <span className="text-xs text-slate-500 font-normal ml-1">{item.units}</span>}
      </span>
    </div>
  );
}

function ButtonControl({ item }: { item: ControlItem & { type: 'button' } }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-600 hover:bg-blue-700',
    green: 'bg-green-600 hover:bg-green-700',
    red: 'bg-red-600 hover:bg-red-700',
    yellow: 'bg-yellow-600 hover:bg-yellow-700',
  };
  const cls = colorMap[item.color || 'blue'] || colorMap.blue;

  const handleClick = async () => {
    if (item.confirm && !window.confirm(`Execute "${item.label}"?`)) return;
    if (item.script) {
      await api.executeScript(item.script);
    } else if (item.tag) {
      await api.writeTag(item.tag, item.value);
    }
  };

  return (
    <div className="py-1">
      <button onClick={handleClick} className={`w-full px-3 py-1.5 rounded-md text-xs text-white font-medium ${cls}`}>
        {item.label}
      </button>
    </div>
  );
}

function InputControl({ item, tagValues, valueStyle }: { item: ControlItem & { type: 'input' }; tagValues: Record<string, TagValue>; valueStyle?: TextStyle }) {
  const tv = tagValues[item.tag];
  const currentValue = Number(tv?.value ?? 0);
  const [showKeypad, setShowKeypad] = useState(false);
  const min = item.min ?? 0;
  const max = item.max ?? 100;

  const handleSubmit = async (val: string) => {
    const num = Number(val);
    if (isNaN(num)) return;
    const clamped = Math.max(min, Math.min(max, num));
    await api.writeTag(item.tag, clamped);
    setShowKeypad(false);
  };

  return (
    <div className="py-1.5">
      <button onClick={() => setShowKeypad(true)} className="w-full text-left group">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-300 truncate" style={textStyleToCSS(valueStyle)}>{item.label}</span>
          <span className="text-sm font-semibold text-slate-100 tabular-nums flex-shrink-0 group-hover:text-blue-300 transition-colors" style={textStyleToCSS(valueStyle)}>
            {currentValue.toFixed(1)}
            {item.units && <span className="text-xs text-slate-500 font-normal ml-1">{item.units}</span>}
          </span>
        </div>
        <div className="text-[10px] text-blue-400 group-hover:text-blue-300 mt-0.5">Tap to change</div>
      </button>
      {showKeypad && (
        <NumericKeypad
          value={String(currentValue)}
          title={item.label}
          units={item.units}
          min={min}
          max={max}
          onSubmit={handleSubmit}
          onClose={() => setShowKeypad(false)}
        />
      )}
    </div>
  );
}

// ─── Main Component ───

export function ControlGroupWidget({ title, controls = [], tagValues, columns = 1, titleStyle, valueStyle }: Props) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 h-full flex flex-col border border-slate-700">
      <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider" style={textStyleToCSS(titleStyle)}>
        {title}
      </div>
      <div
        className="flex-1 overflow-auto"
        style={columns > 1 ? {
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: '0 0.75rem',
          alignContent: 'start',
        } : undefined}
      >
        {controls.map((ctrl, i) => (
          <div key={i} className="border-b border-slate-700/50 last:border-0">
            {ctrl.type === 'toggle' && <ToggleControl item={ctrl as ControlItem & { type: 'toggle' }} tagValues={tagValues} valueStyle={valueStyle} />}
            {ctrl.type === 'value' && <ValueControl item={ctrl as ControlItem & { type: 'value' }} tagValues={tagValues} valueStyle={valueStyle} />}
            {ctrl.type === 'button' && <ButtonControl item={ctrl as ControlItem & { type: 'button' }} />}
            {ctrl.type === 'input' && <InputControl item={ctrl as ControlItem & { type: 'input' }} tagValues={tagValues} valueStyle={valueStyle} />}
          </div>
        ))}
        {controls.length === 0 && (
          <div className="text-xs text-slate-600 italic text-center py-4">No controls configured</div>
        )}
      </div>
    </div>
  );
}
