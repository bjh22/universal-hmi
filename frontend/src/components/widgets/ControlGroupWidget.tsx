import { memo, useState } from 'react';
import { api } from '../../lib/api';
import { isTagVisible } from '../../lib/tagVisibility';
import type { TagVisibilityMap } from '../../lib/tagVisibility';
import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { NumericKeypad } from './TouchInput';
import { InlineInfoButton } from './InfoButton';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';

export type ControlItem =
  | { type: 'toggle'; tag: string; label: string }
  | { type: 'value'; tag: string; label: string; units?: string; decimalPlaces?: number }
  | { type: 'button'; tag: string; label: string; value: unknown; color?: string; confirm?: boolean; script?: string }
  | { type: 'input'; tag: string; label: string; min?: number; max?: number; step?: number; units?: string; decimalPlaces?: number }
  | { type: 'dropdown'; tag: string; label: string; options?: Array<{ label: string; value: unknown }> };

interface Props {
  title: string;
  controls: ControlItem[];
  tagValues: Record<string, TagValue>;
  tagVisibilityMap?: TagVisibilityMap;
  columns?: number;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

/** Parse a display_format string like "0.00" into decimal places (2). */
function parseDecimalPlaces(format: string | undefined): number | undefined {
  if (!format) return undefined;
  const dot = format.indexOf('.');
  if (dot < 0) return 0;
  return format.length - dot - 1;
}

/** Resolve the label to show — prefer explicit, fall back to tag display_name, then tag name. */
function resolveLabel(itemLabel: string, tv: TagValue | undefined, tagName: string): string {
  if (itemLabel) return itemLabel;
  return tv?.display_name || tagName || '—';
}

/** Resolve units — prefer explicit, fall back to tag engineering_units. */
function resolveUnits(itemUnits: string | undefined, tv: TagValue | undefined): string | undefined {
  if (itemUnits) return itemUnits;
  return tv?.engineering_units;
}

/** Resolve decimal places — prefer explicit, fall back to tag display_format. */
function resolveDecimalPlaces(itemDp: number | undefined, tv: TagValue | undefined, fallback: number): number {
  if (itemDp != null) return itemDp;
  const fromFormat = parseDecimalPlaces(tv?.display_format);
  if (fromFormat != null) return fromFormat;
  return fallback;
}

// ─── Individual control renderers ───

function ToggleControl({ item, tagValues, valueStyle }: { item: ControlItem & { type: 'toggle' }; tagValues: Record<string, TagValue>; valueStyle?: TextStyle }) {
  const tv = tagValues[item.tag];
  const value = Boolean(tv?.value);

  const handleToggle = async () => {
    await api.writeTag(item.tag, !value);
  };

  const longDesc = tv?.description;
  const label = resolveLabel(item.label, tv, item.tag);

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex items-center gap-1 min-w-0">
        {longDesc && <InlineInfoButton description={longDesc} title={label} />}
        <span className="text-sm text-slate-300 truncate" style={textStyleToCSS(valueStyle)}>{label}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-xs font-medium ${value ? 'text-green-400' : 'text-slate-500'}`}>
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
  const longDesc = tv?.description;
  const label = resolveLabel(item.label, tv, item.tag);
  const units = resolveUnits(item.units, tv);
  const dp = resolveDecimalPlaces(item.decimalPlaces, tv, 1);
  const display = typeof value === 'number' ? value.toFixed(dp) : String(value ?? '—');

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex items-center gap-1 min-w-0">
        {longDesc && <InlineInfoButton description={longDesc} title={label} />}
        <span className="text-sm text-slate-300 truncate" style={textStyleToCSS(valueStyle)}>{label}</span>
      </div>
      <span className="text-base font-semibold text-slate-100 tabular-nums flex-shrink-0" style={textStyleToCSS(valueStyle)}>
        {display}
        {units && <span className="text-sm text-slate-500 font-normal ml-1">{units}</span>}
      </span>
    </div>
  );
}

function ButtonControl({ item, tagValues }: { item: ControlItem & { type: 'button' }; tagValues: Record<string, TagValue> }) {
  const tv = tagValues[item.tag];
  const longDesc = tv?.description;
  const label = resolveLabel(item.label, tv, item.tag);
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-600 hover:bg-blue-700',
    green: 'bg-green-600 hover:bg-green-700',
    red: 'bg-red-600 hover:bg-red-700',
    yellow: 'bg-yellow-600 hover:bg-yellow-700',
  };
  const cls = colorMap[item.color || 'blue'] || colorMap.blue;

  const handleClick = async () => {
    if (item.confirm && !window.confirm(`Execute "${label}"?`)) return;
    if (item.script) {
      await api.executeScript(item.script);
    } else if (item.tag) {
      await api.writeTag(item.tag, item.value);
    }
  };

  return (
    <div className="py-1">
      <div className="flex items-center gap-1">
        {longDesc && <InlineInfoButton description={longDesc} title={label} />}
        <button onClick={handleClick} className={`flex-1 px-3 py-1.5 rounded-md text-sm text-white font-medium ${cls}`}>
          {label}
        </button>
      </div>
    </div>
  );
}

function InputControl({ item, tagValues, valueStyle }: { item: ControlItem & { type: 'input' }; tagValues: Record<string, TagValue>; valueStyle?: TextStyle }) {
  const tv = tagValues[item.tag];
  const currentValue = Number(tv?.value ?? 0);
  const [showKeypad, setShowKeypad] = useState(false);
  const min = item.min ?? 0;
  const max = item.max ?? 100;
  const label = resolveLabel(item.label, tv, item.tag);
  const units = resolveUnits(item.units, tv);
  const dp = resolveDecimalPlaces(item.decimalPlaces, tv, 1);

  const handleSubmit = async (val: string) => {
    const num = Number(val);
    if (isNaN(num)) return;
    const clamped = Math.max(min, Math.min(max, num));
    await api.writeTag(item.tag, clamped);
    setShowKeypad(false);
  };

  const longDesc = tv?.description;

  return (
    <div className="py-1.5">
      <button onClick={() => setShowKeypad(true)} className="w-full text-left group">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            {longDesc && <InlineInfoButton description={longDesc} title={label} />}
            <span className="text-sm text-slate-300 truncate" style={textStyleToCSS(valueStyle)}>{label}</span>
          </div>
          <span className="text-base font-semibold text-slate-100 tabular-nums flex-shrink-0 group-hover:text-blue-300 transition-colors" style={textStyleToCSS(valueStyle)}>
            {currentValue.toFixed(dp)}
            {units && <span className="text-sm text-slate-500 font-normal ml-1">{units}</span>}
          </span>
        </div>
        <div className="text-xs text-blue-400 group-hover:text-blue-300 mt-0.5">Tap to change</div>
      </button>
      {showKeypad && (
        <NumericKeypad
          value={currentValue.toFixed(dp)}
          title={label}
          units={units}
          min={min}
          max={max}
          decimalPlaces={dp}
          onSubmit={handleSubmit}
          onClose={() => setShowKeypad(false)}
        />
      )}
    </div>
  );
}

function DropdownControl({ item, tagValues, valueStyle }: { item: ControlItem & { type: 'dropdown' }; tagValues: Record<string, TagValue>; valueStyle?: TextStyle }) {
  const tv = tagValues[item.tag];
  const currentValue = tv?.value;
  const longDesc = tv?.description;
  const label = resolveLabel(item.label, tv, item.tag);
  const options = item.options || [];

  const currentIdx = options.findIndex(o => String(o.value) === String(currentValue));

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = Number(e.target.value);
    if (idx >= 0 && idx < options.length) {
      await api.writeTag(item.tag, options[idx].value);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex items-center gap-1 min-w-0">
        {longDesc && <InlineInfoButton description={longDesc} title={label} />}
        <span className="text-sm text-slate-300 truncate" style={textStyleToCSS(valueStyle)}>{label}</span>
      </div>
      <select
        value={currentIdx >= 0 ? currentIdx : ''}
        onChange={handleChange}
        className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500 max-w-[50%] flex-shrink-0"
      >
        {currentIdx < 0 && <option value="" disabled>{currentValue != null ? String(currentValue) : '—'}</option>}
        {options.map((opt, i) => (
          <option key={i} value={i}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Main Component ───

export const ControlGroupWidget = memo(function ControlGroupWidget({ title, controls = [], tagValues, tagVisibilityMap = {}, columns = 1, titleStyle, valueStyle, chrome = 'full' }: Props) {
  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col`}>
      {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>
        {title}
      </div>}
      <div
        className="flex-1 overflow-auto"
        style={columns > 1 ? {
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: '0 0.75rem',
          alignContent: 'start',
        } : undefined}
      >
        {controls.map((ctrl, i) => {
          // Skip controls whose tag has failing visibility conditions
          if (ctrl.tag && !isTagVisible(ctrl.tag, tagVisibilityMap, tagValues)) return null;
          return (
            <div key={i} className="border-b border-slate-700/50 last:border-0">
              {ctrl.type === 'toggle' && <ToggleControl item={ctrl as ControlItem & { type: 'toggle' }} tagValues={tagValues} valueStyle={valueStyle} />}
              {ctrl.type === 'value' && <ValueControl item={ctrl as ControlItem & { type: 'value' }} tagValues={tagValues} valueStyle={valueStyle} />}
              {ctrl.type === 'button' && <ButtonControl item={ctrl as ControlItem & { type: 'button' }} tagValues={tagValues} />}
              {ctrl.type === 'input' && <InputControl item={ctrl as ControlItem & { type: 'input' }} tagValues={tagValues} valueStyle={valueStyle} />}
              {ctrl.type === 'dropdown' && <DropdownControl item={ctrl as ControlItem & { type: 'dropdown' }} tagValues={tagValues} valueStyle={valueStyle} />}
            </div>
          );
        })}
        {controls.length === 0 && (
          <div className="text-sm text-slate-600 italic text-center py-4">No controls configured</div>
        )}
      </div>
    </div>
  );
});
