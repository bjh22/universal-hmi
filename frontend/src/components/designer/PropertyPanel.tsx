import type { Widget, TextStyle } from '../../types';
import { WIDGET_TYPES } from './WidgetPalette';

interface Props {
  widget: Widget | null;
  onUpdateProps: (id: string, props: Record<string, unknown>) => void;
  onUpdateWidget: (id: string, patch: Partial<Widget>) => void;
  onDelete: () => void;
  locked: boolean;
  onToggleLock: () => void;
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
        {widget.type !== 'text_label' && (
          <Section title="Tag Binding">
            <Field label="Tag Name">
              <input
                type="text"
                value={p.tag || ''}
                onChange={e => setProp('tag', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                placeholder="e.g. Machine.Speed"
              />
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
