import { useState, useEffect, useRef, useCallback } from 'react';
import type { Widget, TextStyle, Tag, LayoutMode } from '../../types';
import { api } from '../../lib/api';
import { WIDGET_TYPES } from './WidgetPalette';
import { GAUGE_DEFAULTS, type GaugeDisplayMode } from '../widgets/GaugeWidget';

interface Props {
  widget: Widget | null;
  widgets: Widget[];
  layoutMode: LayoutMode;
  onUpdateProps: (id: string, props: Record<string, unknown>) => void;
  onUpdateWidget: (id: string, patch: Partial<Widget>) => void;
  onDelete: () => void;
  locked: boolean;
  onToggleLock: () => void;
}

function TagPicker({ value, onChange }: { value: string; onChange: (tag: string) => void }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getTags().then(setTags).catch(() => {});
  }, []);

  const lowerSearch = search.toLowerCase();
  const filtered = tags.filter(t =>
    t.name.toLowerCase().includes(lowerSearch) ||
    (t.description || '').toLowerCase().includes(lowerSearch) ||
    (t.group_name || '').toLowerCase().includes(lowerSearch)
  );
  // Cap visible items to avoid rendering 1000+ DOM nodes
  const MAX_VISIBLE = 50;
  const visibleTags = filtered.slice(0, MAX_VISIBLE);
  const hasMore = filtered.length > MAX_VISIBLE;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={open ? search : value}
        onChange={e => { setSearch(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => { setSearch(value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
        placeholder="Search tags..."
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-slate-500">No tags found</div>
          )}
          {visibleTags.map(t => (
            <button
              key={t.id}
              className={`w-full text-left px-2 py-1.5 text-xs hover:bg-slate-700 ${t.name === value ? 'bg-slate-700 text-blue-400' : 'text-slate-300'}`}
              onMouseDown={e => { e.preventDefault(); onChange(t.name); setOpen(false); }}
            >
              <div className="font-medium">{t.description || t.name}</div>
              {t.description && <div className="text-[10px] text-slate-500 font-mono truncate">{t.name}</div>}
            </button>
          ))}
          {hasMore && (
            <div className="px-2 py-1.5 text-[10px] text-slate-500 text-center">
              {filtered.length - MAX_VISIBLE} more — type to narrow results
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TextStyleEditor({ label, value, onChange }: {
  label: string;
  value?: TextStyle;
  onChange: (style: TextStyle) => void;
}) {
  const s = value || {};
  const update = (patch: Partial<TextStyle>) => onChange({ ...s, ...patch });

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold text-slate-500 uppercase">{label}</div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[10px] text-slate-500">Font</label>
          <select
            value={s.fontFamily || ''}
            onChange={e => update({ fontFamily: e.target.value || undefined })}
            className="w-full bg-slate-700 border border-slate-600 rounded px-1.5 py-1 text-xs text-white"
          >
            <option value="">Default</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="'Courier New', monospace">Courier</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="'Segoe UI', sans-serif">Segoe UI</option>
            <option value="Verdana, sans-serif">Verdana</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-slate-500">Size (px)</label>
          <input
            type="number"
            value={s.fontSize ?? ''}
            onChange={e => update({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
            className="w-full bg-slate-700 border border-slate-600 rounded px-1.5 py-1 text-xs text-white"
            min={8} max={72}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={s.fontWeight === 'bold'}
            onChange={e => update({ fontWeight: e.target.checked ? 'bold' : 'normal' })}
            className="rounded bg-slate-700 border-slate-600"
          />
          Bold
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={!!s.italic}
            onChange={e => update({ italic: e.target.checked })}
            className="rounded bg-slate-700 border-slate-600"
          />
          Italic
        </label>
        <div className="flex items-center gap-1 ml-auto">
          <label className="text-[10px] text-slate-500">Color</label>
          <input
            type="color"
            value={s.color || '#ffffff'}
            onChange={e => update({ color: e.target.value })}
            className="w-6 h-6 rounded border border-slate-600 bg-transparent cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}

export function PropertyPanel({ widget, widgets, layoutMode, onUpdateProps, onUpdateWidget, onDelete, locked, onToggleLock }: Props) {
  const isAbsolute = layoutMode === 'absolute';
  if (!widget) {
    return (
      <div className="w-64 bg-slate-900 border-l border-slate-700 p-4 shrink-0">
        <div className="text-xs text-slate-500 text-center mt-8">
          Select a widget to edit its properties
        </div>
      </div>
    );
  }

  const typeInfo = WIDGET_TYPES.find(t => t.type === widget.type);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = widget.props as Record<string, any>;

  const setProp = (key: string, value: unknown) => {
    onUpdateProps(widget.id, { [key]: value });
  };

  return (
    <div className="w-64 bg-slate-900 border-l border-slate-700 flex flex-col overflow-y-auto shrink-0">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {typeInfo?.label || widget.type}
        </span>
        <div className="flex gap-1">
          <button
            onClick={onToggleLock}
            className={`text-xs px-1.5 py-0.5 rounded ${locked ? 'bg-yellow-600/20 text-yellow-400' : 'text-slate-500 hover:text-slate-300'}`}
            title={locked ? 'Unlock' : 'Lock position'}
          >
            {locked ? 'Locked' : 'Lock'}
          </button>
        </div>
      </div>

      <div className="p-3 space-y-4 text-sm">
        {/* General */}
        <Section title="General">
          <Field label="Title">
            <input
              type="text"
              value={p.title || ''}
              onChange={e => setProp('title', e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
            />
          </Field>
        </Section>

        {/* Container Description (for info button) */}
        {widget.type === 'container' && (
          <Section title="Info Button">
            <Field label="Description">
              <textarea
                value={p.description || ''}
                onChange={e => setProp('description', e.target.value)}
                rows={3}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white resize-y"
                placeholder="Info button text..."
              />
            </Field>
          </Section>
        )}

        {/* Group Assignment */}
        {widget.type !== 'container' && (() => {
          const containers = widgets.filter(w => w.type === 'container' && w.id !== widget.id);
          if (containers.length === 0) return null;
          return (
            <Section title="Group">
              <Field label="Container">
                <select
                  value={widget.parentId || ''}
                  onChange={e => onUpdateWidget(widget.id, { parentId: e.target.value || undefined })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                >
                  <option value="">None</option>
                  {containers.map(c => (
                    <option key={c.id} value={c.id}>
                      {(c.props as Record<string, unknown>).title as string || c.id}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>
          );
        })()}

        {/* Display Chrome */}
        <Section title="Display">
          <Field label="Chrome">
            <div className="flex gap-1">
              {(['full', 'compact', 'none'] as const).map(level => (
                <button
                  key={level}
                  onClick={() => onUpdateWidget(widget.id, { chrome: level })}
                  className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    (widget.chrome || 'full') === level ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* Tag Binding */}
        {widget.type !== 'text_label' && widget.type !== 'alarm_summary' && widget.type !== 'multi_value' && widget.type !== 'control_group' && widget.type !== 'container' && (
          <Section title="Tag Binding">
            <Field label="Tag Name">
              <TagPicker value={p.tag || ''} onChange={v => setProp('tag', v)} />
            </Field>
          </Section>
        )}

        {/* Type-specific props */}
        {(widget.type === 'gauge' || widget.type === 'parameter_input') && (
          <Section title="Range">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Min">
                <input type="number" value={p.min ?? 0} onChange={e => setProp('min', Number(e.target.value))}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
              </Field>
              <Field label="Max">
                <input type="number" value={p.max ?? 100} onChange={e => setProp('max', Number(e.target.value))}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
              </Field>
            </div>
            <Field label="Units">
              <input type="text" value={p.units || ''} onChange={e => setProp('units', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
            </Field>
            <Field label="Decimal Places">
              <input type="number" value={p.decimalPlaces ?? 1} onChange={e => setProp('decimalPlaces', Number(e.target.value))}
                min={0} max={6}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
            </Field>
          </Section>
        )}

        {widget.type === 'gauge' && (
          <Section title="Display & Thresholds">
            <Field label="Display Mode">
              <select value={p.displayMode as string || 'bar'} onChange={e => setProp('displayMode', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white">
                <option value="bar">Horizontal Bar</option>
                <option value="radial">Radial / Dial</option>
                <option value="donut">Donut / Ring</option>
                <option value="vertical">Vertical Bar</option>
                <option value="numeric">Numeric Only</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Warning">
                <input type="number" value={p.warning ?? ''} onChange={e => setProp('warning', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
              </Field>
              <Field label="Critical">
                <input type="number" value={p.critical ?? ''} onChange={e => setProp('critical', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
              </Field>
            </div>
            {(() => {
              const mode = (p.displayMode as GaugeDisplayMode) || 'bar';
              const defs = GAUGE_DEFAULTS[mode];
              const isSvg = mode === 'radial' || mode === 'donut';
              return (
                <>
                  <div className={`grid gap-2 ${isSvg ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <Field label="Value Size">
                      <input type="number" value={p.valueFontSize ?? ''} onChange={e => setProp('valueFontSize', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder={String(defs.valueFontSize)} min={isSvg ? 6 : 12} max={isSvg ? 30 : 120}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
                    </Field>
                    <Field label={mode === 'vertical' ? 'Bar Width' : 'Bar Thickness'}>
                      <input type="number" value={p.barThickness ?? ''} onChange={e => setProp('barThickness', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder={String(defs.barThickness)} min={2} max={isSvg ? 20 : 60}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
                    </Field>
                    {isSvg && (
                      <Field label="Gauge Size %">
                        <input type="number" value={p.gaugeSize ?? ''} onChange={e => setProp('gaugeSize', e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="100" min={20} max={100}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
                      </Field>
                    )}
                  </div>
                </>
              );
            })()}
          </Section>
        )}

        {widget.type === 'command_button' && (
          <Section title="Button">
            <Field label="Color">
              <select value={p.color || 'blue'} onChange={e => setProp('color', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white">
                <option value="blue">Blue</option>
                <option value="green">Green</option>
                <option value="red">Red</option>
                <option value="yellow">Yellow</option>
              </select>
            </Field>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input type="checkbox" checked={!!p.confirm} onChange={e => setProp('confirm', e.target.checked)}
                className="rounded bg-slate-700 border-slate-600" />
              Require confirmation
            </label>
            <Field label="Script">
              <textarea value={p.script || ''} onChange={e => setProp('script', e.target.value)}
                rows={3}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white font-mono" />
            </Field>
          </Section>
        )}

        {widget.type === 'parameter_input' && (
          <Section title="Step">
            <Field label="Step Size">
              <input type="number" value={p.step ?? 1} onChange={e => setProp('step', Number(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
            </Field>
          </Section>
        )}

        {/* Text Label */}
        {widget.type === 'text_label' && (
          <Section title="Content">
            <Field label="Text">
              <textarea value={p.text || ''} onChange={e => setProp('text', e.target.value)}
                rows={2}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
            </Field>
          </Section>
        )}

        {/* Text Value */}
        {widget.type === 'text_value' && (
          <Section title="Display">
            <Field label="Units">
              <input type="text" value={p.units || ''} onChange={e => setProp('units', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
            </Field>
            <Field label="Format">
              <select value={p.format || ''} onChange={e => setProp('format', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white">
                <option value="">Auto</option>
                <option value="decimal:0">Integer</option>
                <option value="decimal:1">1 decimal</option>
                <option value="decimal:2">2 decimals</option>
                <option value="decimal:3">3 decimals</option>
              </select>
            </Field>
          </Section>
        )}

        {/* Dropdown Select */}
        {widget.type === 'dropdown_select' && (
          <Section title="Options">
            <DropdownOptionsEditor
              options={(p.options as Array<{ label: string; value: unknown }>) || []}
              onChange={opts => setProp('options', opts)}
              tagName={p.tag as string || ''}
            />
          </Section>
        )}

        {/* Control Group */}
        {widget.type === 'control_group' && (
          <Section title="Controls">
            <ControlGroupEditor
              controls={(p.controls as Array<{ type: string; tag: string; label: string; [k: string]: unknown }>) || []}
              onChange={ctrls => setProp('controls', ctrls)}
            />
            <Field label="Columns">
              <select value={p.columns as number || 1} onChange={e => setProp('columns', Number(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white">
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </Field>
          </Section>
        )}

        {/* OEE Widget */}
        {widget.type === 'oee' && (
          <Section title="OEE Tags">
            <Field label="Availability Tag">
              <TagPicker value={p.availabilityTag as string || ''} onChange={v => setProp('availabilityTag', v)} />
            </Field>
            <Field label="Performance Tag">
              <TagPicker value={p.performanceTag as string || ''} onChange={v => setProp('performanceTag', v)} />
            </Field>
            <Field label="Quality Tag">
              <TagPicker value={p.qualityTag as string || ''} onChange={v => setProp('qualityTag', v)} />
            </Field>
            <Field label="OEE Tag (optional)">
              <TagPicker value={p.oeeTag as string || ''} onChange={v => setProp('oeeTag', v)} />
            </Field>
            <Field label="Decimal Places">
              <input type="number" value={p.decimalPlaces ?? 1} onChange={e => setProp('decimalPlaces', Number(e.target.value))}
                min={0} max={6}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
            </Field>
          </Section>
        )}

        {/* Position & Size */}
        <Section title="Position & Size">
          <div className="grid grid-cols-2 gap-2">
            <Field label={isAbsolute ? 'X (px)' : 'X (col)'}>
              <input type="number" value={widget.x} onChange={e => onUpdateWidget(widget.id, { x: Number(e.target.value) })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" min={0} />
            </Field>
            <Field label={isAbsolute ? 'Y (px)' : 'Y (row)'}>
              <input type="number" value={widget.y} onChange={e => onUpdateWidget(widget.id, { y: Number(e.target.value) })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" min={0} />
            </Field>
            <Field label={isAbsolute ? 'Width (px)' : 'Width'}>
              <input type="number" value={widget.w} onChange={e => onUpdateWidget(widget.id, { w: Number(e.target.value) })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                min={isAbsolute ? 40 : 1} max={isAbsolute ? undefined : 12} />
            </Field>
            <Field label={isAbsolute ? 'Height (px)' : 'Height'}>
              <input type="number" value={widget.h} onChange={e => onUpdateWidget(widget.id, { h: Number(e.target.value) })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                min={isAbsolute ? 40 : 1} />
            </Field>
          </div>
        </Section>

        {/* Appearance / Text Style */}
        <Section title="Appearance">
          <TextStyleEditor
            label="Title Style"
            value={p.titleStyle as TextStyle | undefined}
            onChange={style => setProp('titleStyle', style)}
          />
          {widget.type !== 'command_button' && (
            <TextStyleEditor
              label="Value Style"
              value={p.valueStyle as TextStyle | undefined}
              onChange={style => setProp('valueStyle', style)}
            />
          )}
        </Section>

        {/* Visibility & Enabled */}
        <Section title="Visibility / Enabled">
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={widget.visible !== false}
              onChange={e => onUpdateWidget(widget.id, { visible: e.target.checked })}
              className="rounded bg-slate-700 border-slate-600" />
            Visible
          </label>
          <Field label="Visible when tag is truthy">
            <input type="text" value={widget.visibleTag || ''}
              onChange={e => onUpdateWidget(widget.id, { visibleTag: e.target.value || undefined })}
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
              placeholder="Optional tag" />
          </Field>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={widget.enabled !== false}
              onChange={e => onUpdateWidget(widget.id, { enabled: e.target.checked })}
              className="rounded bg-slate-700 border-slate-600" />
            Enabled
          </label>
          <Field label="Enabled when tag is truthy">
            <input type="text" value={widget.enabledTag || ''}
              onChange={e => onUpdateWidget(widget.id, { enabledTag: e.target.value || undefined })}
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
              placeholder="Optional tag" />
          </Field>
          <Field label="Visible to roles">
            <RoleSelector
              selected={widget.visibleRoles || []}
              onChange={roles => onUpdateWidget(widget.id, { visibleRoles: roles.length > 0 ? roles : undefined })}
            />
          </Field>
          <Field label="Enabled for roles">
            <RoleSelector
              selected={widget.enabledRoles || []}
              onChange={roles => onUpdateWidget(widget.id, { enabledRoles: roles.length > 0 ? roles : undefined })}
            />
          </Field>
        </Section>

        {/* Info Button */}
        {widget.type !== 'text_label' && widget.type !== 'alarm_summary' && (
          <Section title="Info Button">
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input type="checkbox" checked={widget.showInfo !== false}
                onChange={e => onUpdateWidget(widget.id, { showInfo: e.target.checked })}
                className="rounded bg-slate-700 border-slate-600" />
              Show info icon when tag has a description
            </label>
          </Section>
        )}

        {/* Delete */}
        <button
          onClick={onDelete}
          className="w-full py-1.5 rounded bg-red-600/20 text-red-400 text-xs font-medium hover:bg-red-600/30 transition-colors"
        >
          Delete Widget
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-slate-500 mb-0.5 block">{label}</label>
      {children}
    </div>
  );
}

const ROLES = ['operator', 'supervisor', 'engineer', 'designer'];

function RoleSelector({ selected, onChange }: { selected: string[]; onChange: (roles: string[]) => void }) {
  const toggle = (role: string) => {
    onChange(selected.includes(role) ? selected.filter(r => r !== role) : [...selected, role]);
  };
  return (
    <div className="flex flex-wrap gap-1">
      {ROLES.map(role => (
        <button
          key={role}
          onClick={() => toggle(role)}
          className={`px-1.5 py-0.5 rounded text-[10px] capitalize ${
            selected.includes(role) ? 'bg-blue-600/30 text-blue-400' : 'bg-slate-700 text-slate-500'
          }`}
        >
          {role}
        </button>
      ))}
      {selected.length > 0 && (
        <span className="text-[10px] text-slate-500 self-center ml-1">({selected.length === 0 ? 'all' : selected.join(', ')})</span>
      )}
    </div>
  );
}

const CONTROL_TYPES = [
  { value: 'toggle', label: 'Toggle Switch' },
  { value: 'value', label: 'Value Display' },
  { value: 'button', label: 'Button' },
  { value: 'input', label: 'Parameter Input' },
];

function ControlGroupEditor({ controls, onChange }: {
  controls: Array<{ type: string; tag: string; label: string; [k: string]: unknown }>;
  onChange: (ctrls: Array<{ type: string; tag: string; label: string; [k: string]: unknown }>) => void;
}) {
  const addControl = (type: string) => {
    const base: Record<string, unknown> = { type, tag: '', label: '' };
    if (type === 'button') { base.value = null; base.color = 'blue'; }
    if (type === 'input') { base.min = 0; base.max = 100; base.step = 1; }
    if (type === 'value') { base.decimalPlaces = 1; }
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
          <input type="text" value={ctrl.tag} onChange={e => updateControl(i, { tag: e.target.value })}
            placeholder="Tag name" className="w-full bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />

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
            <div className="flex gap-1">
              <input type="number" value={ctrl.min as number ?? 0} onChange={e => updateControl(i, { min: Number(e.target.value) })}
                placeholder="Min" className="w-14 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
              <input type="number" value={ctrl.max as number ?? 100} onChange={e => updateControl(i, { max: Number(e.target.value) })}
                placeholder="Max" className="w-14 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
              <input type="number" value={ctrl.step as number ?? 1} onChange={e => updateControl(i, { step: Number(e.target.value) })}
                placeholder="Step" className="w-14 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
              <input type="text" value={(ctrl.units as string) || ''} onChange={e => updateControl(i, { units: e.target.value })}
                placeholder="Units" className="w-14 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
            </div>
          )}

          {ctrl.type === 'value' && (
            <div className="flex gap-1">
              <input type="text" value={(ctrl.units as string) || ''} onChange={e => updateControl(i, { units: e.target.value })}
                placeholder="Units" className="flex-1 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
              <input type="number" value={ctrl.decimalPlaces as number ?? 1} onChange={e => updateControl(i, { decimalPlaces: Number(e.target.value) })}
                min={0} max={6} placeholder="DP" className="w-12 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
            </div>
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

function DropdownOptionsEditor({ options, onChange, tagName }: {
  options: Array<{ label: string; value: unknown }>;
  onChange: (opts: Array<{ label: string; value: unknown }>) => void;
  tagName?: string;
}) {
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
