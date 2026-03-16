import { useState, useEffect, useCallback } from 'react';
import type { Tag } from '../../types';
import { api } from '../../lib/api';
import { TagPicker } from './TagPickerField';

export interface TagOrderEditorProps {
  labelName: string;
  order: string[];
  onChange: (order: string[]) => void;
}

export function TagOrderEditor({ labelName, order, onChange }: TagOrderEditorProps) {
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    if (!labelName) {
      // Reset when label is removed — this is a prop-driven state sync, not a
      // cascading render, so the lint suppression is intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTags([]);
      return;
    }
    api.getTags().then(all => {
      setTags(all.filter(t => t.labels?.some(l => l.name === labelName)));
    }).catch(() => {});
  }, [labelName]);

  // Build sorted list: ordered tags first, then unordered (alphabetical)
  const sorted = (() => {
    const byName = new Map(tags.map(t => [t.name, t]));
    const result: Tag[] = [];
    for (const name of order) {
      const t = byName.get(name);
      if (t) { result.push(t); byName.delete(name); }
    }
    const remaining = [...byName.values()].sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name));
    return [...result, ...remaining];
  })();

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const names = sorted.map(t => t.name);
    [names[idx - 1], names[idx]] = [names[idx], names[idx - 1]];
    onChange(names);
  };
  const moveDown = (idx: number) => {
    if (idx >= sorted.length - 1) return;
    const names = sorted.map(t => t.name);
    [names[idx], names[idx + 1]] = [names[idx + 1], names[idx]];
    onChange(names);
  };

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-[10px] text-slate-500 font-medium">Tag Order</div>
      {sorted.map((t, i) => (
        <div key={t.name} className="flex items-center gap-1 px-2 py-1 bg-slate-800 rounded border border-slate-700 text-xs text-slate-300">
          <span className="flex-1 truncate">{t.display_name || t.name}</span>
          <button onClick={() => moveUp(i)} className="text-slate-500 hover:text-slate-300 text-[10px] px-1" title="Move up">&uarr;</button>
          <button onClick={() => moveDown(i)} className="text-slate-500 hover:text-slate-300 text-[10px] px-1" title="Move down">&darr;</button>
        </div>
      ))}
    </div>
  );
}

const CONTROL_TYPES = [
  { value: 'toggle', label: 'Toggle Switch' },
  { value: 'value', label: 'Value Display' },
  { value: 'button', label: 'Button' },
  { value: 'input', label: 'Parameter Input' },
  { value: 'dropdown', label: 'Dropdown' },
];

export interface ControlGroupEditorProps {
  controls: Array<{ type: string; tag: string; label: string; [k: string]: unknown }>;
  onChange: (ctrls: Array<{ type: string; tag: string; label: string; [k: string]: unknown }>) => void;
}

export function ControlGroupEditor({ controls, onChange }: ControlGroupEditorProps) {
  const addControl = (type: string) => {
    const base: Record<string, unknown> = { type, tag: '', label: '' };
    if (type === 'button') { base.value = null; base.color = 'blue'; }
    if (type === 'input') { base.min = 0; base.max = 100; base.step = 1; base.decimalPlaces = 1; }
    if (type === 'value') { base.decimalPlaces = 1; }
    if (type === 'dropdown') { base.options = []; }
    onChange([...controls, base as { type: string; tag: string; label: string; [k: string]: unknown }]);
  };
  const removeControl = (idx: number) => onChange(controls.filter((_, i) => i !== idx));
  const updateControl = (idx: number, patch: Record<string, unknown>) =>
    onChange(controls.map((c, i) => i === idx ? { ...c, ...patch } : c));
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const copy = [...controls];
    [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
    onChange(copy);
  };
  const moveDown = (idx: number) => {
    if (idx >= controls.length - 1) return;
    const copy = [...controls];
    [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
    onChange(copy);
  };

  return (
    <div className="space-y-2">
      {controls.map((ctrl, i) => (
        <div key={i} className="p-2 bg-slate-800 rounded border border-slate-700 space-y-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-medium text-slate-500 uppercase w-12 flex-shrink-0">{ctrl.type}</span>
            <div className="flex gap-0.5 ml-auto">
              <button onClick={() => moveUp(i)} className="text-slate-500 hover:text-slate-300 text-[10px] px-1" title="Move up">&uarr;</button>
              <button onClick={() => moveDown(i)} className="text-slate-500 hover:text-slate-300 text-[10px] px-1" title="Move down">&darr;</button>
              <button onClick={() => removeControl(i)} className="text-red-400 hover:text-red-300 text-xs px-1">&times;</button>
            </div>
          </div>
          <input type="text" value={ctrl.label} onChange={e => updateControl(i, { label: e.target.value })}
            placeholder="Label" className="w-full bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
          <TagPicker value={ctrl.tag} onChange={v => updateControl(i, { tag: v })} />

          {ctrl.type === 'button' && (
            <div className="flex gap-1">
              <select value={(ctrl.color as string) || 'blue'} onChange={e => updateControl(i, { color: e.target.value })}
                className="flex-1 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white">
                <option value="blue">Blue</option>
                <option value="green">Green</option>
                <option value="red">Red</option>
                <option value="yellow">Yellow</option>
              </select>
              <input type="text" value={String(ctrl.value ?? '')} onChange={e => {
                const v = e.target.value;
                updateControl(i, { value: v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v) });
              }}
                placeholder="Value" className="w-16 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
              <label className="flex items-center gap-1 text-[10px] text-slate-400">
                <input type="checkbox" checked={!!ctrl.confirm} onChange={e => updateControl(i, { confirm: e.target.checked })}
                  className="rounded bg-slate-700 border-slate-600" />
                Confirm
              </label>
            </div>
          )}

          {ctrl.type === 'input' && (
            <div className="space-y-1">
              <div className="flex gap-1">
                <div className="flex-1">
                  <label className="text-[9px] text-slate-500 block">Min</label>
                  <input type="number" value={ctrl.min as number ?? 0} onChange={e => updateControl(i, { min: Number(e.target.value) })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] text-slate-500 block">Max</label>
                  <input type="number" value={ctrl.max as number ?? 100} onChange={e => updateControl(i, { max: Number(e.target.value) })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] text-slate-500 block">Step</label>
                  <input type="number" value={ctrl.step as number ?? 1} onChange={e => updateControl(i, { step: Number(e.target.value) })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
                </div>
              </div>
              <div className="flex gap-1">
                <div className="flex-1">
                  <label className="text-[9px] text-slate-500 block">Units</label>
                  <input type="text" value={(ctrl.units as string) || ''} onChange={e => updateControl(i, { units: e.target.value })}
                    placeholder="—" className="w-full bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] text-slate-500 block">Decimals</label>
                  <input type="number" value={ctrl.decimalPlaces as number ?? 1} onChange={e => updateControl(i, { decimalPlaces: Number(e.target.value) })}
                    min={0} max={6} className="w-full bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
                </div>
              </div>
            </div>
          )}

          {ctrl.type === 'value' && (
            <div className="flex gap-1">
              <div className="flex-1">
                <label className="text-[9px] text-slate-500 block">Units</label>
                <input type="text" value={(ctrl.units as string) || ''} onChange={e => updateControl(i, { units: e.target.value })}
                  placeholder="—" className="w-full bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
              </div>
              <div className="w-12">
                <label className="text-[9px] text-slate-500 block">Decimals</label>
                <input type="number" value={ctrl.decimalPlaces as number ?? 1} onChange={e => updateControl(i, { decimalPlaces: Number(e.target.value) })}
                  min={0} max={6} className="w-full bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
              </div>
            </div>
          )}

          {ctrl.type === 'dropdown' && (
            <DropdownOptionsEditor
              options={(ctrl.options as Array<{ label: string; value: unknown }>) || []}
              onChange={opts => updateControl(i, { options: opts })}
              tagName={ctrl.tag}
            />
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        {CONTROL_TYPES.map(ct => (
          <button key={ct.value} onClick={() => addControl(ct.value)}
            className="text-[10px] px-2 py-1 bg-slate-800 border border-slate-700 rounded text-blue-400 hover:text-blue-300 hover:border-slate-600">
            + {ct.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface DropdownOptionsEditorProps {
  options: Array<{ label: string; value: unknown }>;
  onChange: (opts: Array<{ label: string; value: unknown }>) => void;
  tagName?: string;
}

export function DropdownOptionsEditor({ options, onChange, tagName }: DropdownOptionsEditorProps) {
  const addOption = () => onChange([...options, { label: '', value: '' }]);
  const removeOption = (idx: number) => onChange(options.filter((_, i) => i !== idx));
  const updateOption = (idx: number, patch: Partial<{ label: string; value: unknown }>) =>
    onChange(options.map((o, i) => i === idx ? { ...o, ...patch } : o));

  const populateFromEnum = useCallback(async () => {
    if (!tagName) return;
    try {
      const tag = await api.getTagByName(tagName);
      if (!tag?.enum_mapping) return;
      const mapping = typeof tag.enum_mapping === 'string' ? JSON.parse(tag.enum_mapping) : tag.enum_mapping;
      const opts = Object.entries(mapping as Record<string, string>)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([value, label]) => ({ label: label as string, value: Number(value) }));
      onChange(opts);
    } catch { /* ignore */ }
  }, [tagName, onChange]);

  return (
    <div className="space-y-1.5">
      {tagName && (
        <button onClick={populateFromEnum} className="text-xs text-emerald-400 hover:text-emerald-300 mb-1">
          Populate from tag enum mapping
        </button>
      )}
      {options.map((opt, i) => (
        <div key={i} className="flex gap-1 items-center">
          <input type="text" value={opt.label} onChange={e => updateOption(i, { label: e.target.value })}
            placeholder="Label" className="flex-1 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
          <input type="text" value={String(opt.value ?? '')} onChange={e => {
            const v = e.target.value;
            updateOption(i, { value: isNaN(Number(v)) ? v : Number(v) });
          }}
            placeholder="Value" className="w-16 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
          <button onClick={() => removeOption(i)} className="text-red-400 hover:text-red-300 text-xs px-1">&times;</button>
        </div>
      ))}
      <button onClick={addOption} className="text-xs text-blue-400 hover:text-blue-300">+ Add option</button>
    </div>
  );
}
