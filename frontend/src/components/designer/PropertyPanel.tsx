import { useState, useEffect, useRef } from 'react';
import type { Widget, TextStyle, Tag } from '../../types';
import { api } from '../../lib/api';
import { WIDGET_TYPES } from './WidgetPalette';

interface Props {
  widget: Widget | null;
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

  const filtered = tags.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.group_name || '').toLowerCase().includes(search.toLowerCase())
  );

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
          {filtered.map(t => (
            <button
              key={t.id}
              className={`w-full text-left px-2 py-1.5 text-xs hover:bg-slate-700 ${t.name === value ? 'bg-slate-700 text-blue-400' : 'text-slate-300'}`}
              onMouseDown={e => { e.preventDefault(); onChange(t.name); setOpen(false); }}
            >
              <div className="font-medium">{t.name}</div>
              {t.description && <div className="text-[10px] text-slate-500 truncate">{t.description}</div>}
            </button>
          ))}
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

export function PropertyPanel({ widget, onUpdateProps, onUpdateWidget, onDelete, locked, onToggleLock }: Props) {
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

        {/* Tag Binding */}
        {widget.type !== 'text_label' && widget.type !== 'alarm_summary' && widget.type !== 'multi_value' && (
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
          </Section>
        )}

        {widget.type === 'gauge' && (
          <Section title="Thresholds">
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

        {/* Multi-Value Group */}
        {widget.type === 'multi_value' && (
          <Section title="Tags">
            <MultiValueTagsEditor
              tags={(p.tags as Array<{ tag: string; label: string; units?: string }>) || []}
              onChange={tags => setProp('tags', tags)}
            />
          </Section>
        )}

        {/* Dropdown Select */}
        {widget.type === 'dropdown_select' && (
          <Section title="Options">
            <DropdownOptionsEditor
              options={(p.options as Array<{ label: string; value: unknown }>) || []}
              onChange={opts => setProp('options', opts)}
            />
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
          </Section>
        )}

        {/* Position & Size */}
        <Section title="Position & Size">
          <div className="grid grid-cols-2 gap-2">
            <Field label="X (col)">
              <input type="number" value={widget.x} onChange={e => onUpdateWidget(widget.id, { x: Number(e.target.value) })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" min={0} />
            </Field>
            <Field label="Y (row)">
              <input type="number" value={widget.y} onChange={e => onUpdateWidget(widget.id, { y: Number(e.target.value) })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" min={0} />
            </Field>
            <Field label="Width">
              <input type="number" value={widget.w} onChange={e => onUpdateWidget(widget.id, { w: Number(e.target.value) })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" min={1} max={12} />
            </Field>
            <Field label="Height">
              <input type="number" value={widget.h} onChange={e => onUpdateWidget(widget.id, { h: Number(e.target.value) })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" min={1} />
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

function MultiValueTagsEditor({ tags, onChange }: {
  tags: Array<{ tag: string; label: string; units?: string }>;
  onChange: (tags: Array<{ tag: string; label: string; units?: string }>) => void;
}) {
  const addTag = () => onChange([...tags, { tag: '', label: '', units: '' }]);
  const removeTag = (idx: number) => onChange(tags.filter((_, i) => i !== idx));
  const updateTag = (idx: number, patch: Partial<{ tag: string; label: string; units: string }>) =>
    onChange(tags.map((t, i) => i === idx ? { ...t, ...patch } : t));

  return (
    <div className="space-y-2">
      {tags.map((entry, i) => (
        <div key={i} className="space-y-1 p-1.5 bg-slate-800 rounded">
          <div className="flex items-center gap-1">
            <input type="text" value={entry.tag} onChange={e => updateTag(i, { tag: e.target.value })}
              placeholder="Tag name" className="flex-1 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
            <button onClick={() => removeTag(i)} className="text-red-400 hover:text-red-300 text-xs px-1">&times;</button>
          </div>
          <div className="flex gap-1">
            <input type="text" value={entry.label} onChange={e => updateTag(i, { label: e.target.value })}
              placeholder="Label" className="flex-1 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
            <input type="text" value={entry.units || ''} onChange={e => updateTag(i, { units: e.target.value })}
              placeholder="Units" className="w-16 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white" />
          </div>
        </div>
      ))}
      <button onClick={addTag} className="text-xs text-blue-400 hover:text-blue-300">+ Add tag</button>
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

function DropdownOptionsEditor({ options, onChange }: {
  options: Array<{ label: string; value: unknown }>;
  onChange: (opts: Array<{ label: string; value: unknown }>) => void;
}) {
  const addOption = () => onChange([...options, { label: '', value: '' }]);
  const removeOption = (idx: number) => onChange(options.filter((_, i) => i !== idx));
  const updateOption = (idx: number, patch: Partial<{ label: string; value: unknown }>) =>
    onChange(options.map((o, i) => i === idx ? { ...o, ...patch } : o));

  return (
    <div className="space-y-1.5">
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
