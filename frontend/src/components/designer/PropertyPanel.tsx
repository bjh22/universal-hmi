/**
 * PropertyPanel — the right sidebar in the screen designer that shows editable
 * properties for the currently selected widget. Different widget types show
 * different property fields (e.g. gauges show min/max/warning/critical, buttons
 * show color/confirm/script).
 *
 * Key sub-components (extracted into their own files):
 *   - TagPicker (TagPickerField.tsx): a searchable dropdown that lets designers
 *     bind widgets to tags from the backend.
 *   - TextStyleEditor (TextStyleField.tsx): controls for font, size, bold, italic, color
 *   - RoleSelector (RoleSelectorField.tsx): lets designers restrict widget
 *     visibility/interactivity by role
 *   - ControlGroupEditor (ControlGroupEditor.tsx): for building multi-control
 *     widgets with mixed types
 *   - TagOrderEditor (ControlGroupEditor.tsx): drag/sort editor for tag ordering
 *
 * Also defined in this file:
 *   - Section/Field: layout helpers for organizing the property form
 *
 * All property changes are applied immediately via onUpdateProps/onUpdateWidget
 * callbacks — there is no "save" button; the designer sees changes in real time.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import type { Widget, TextStyle, LayoutMode } from '../../types';
import { api } from '../../lib/api';
import { WIDGET_TYPES } from './WidgetPalette';
import { GAUGE_DEFAULTS, type GaugeDisplayMode } from '../widgets/GaugeWidget';
import { icons } from 'lucide-react';
import { TagPicker } from './TagPickerField';
import { TextStyleEditor } from './TextStyleField';
import { RoleSelector } from './RoleSelectorField';
import { ControlGroupEditor, TagOrderEditor, DropdownOptionsEditor } from './ControlGroupEditor';

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

function LabelPicker({ value, onChange }: { value: string; onChange: (label: string) => void }) {
  const [labels, setLabels] = useState<{ id: number; name: string; color: string | null }[]>([]);

  useEffect(() => {
    api.getTagLabels().then(setLabels).catch(() => {});
  }, []);

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
    >
      <option value="">Select label...</option>
      {labels.map(l => (
        <option key={l.id} value={l.name}>{l.name}</option>
      ))}
    </select>
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
        {(widget.type === 'container' || widget.type === 'collapsible_container') && (
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

        {/* Collapsible Container: Default Collapsed */}
        {widget.type === 'collapsible_container' && (
          <Section title="Collapse">
            <Field label="Default Collapsed">
              <button
                onClick={() => setProp('defaultCollapsed', !p.defaultCollapsed)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  p.defaultCollapsed ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.defaultCollapsed ? 'Yes' : 'No'}
              </button>
            </Field>
          </Section>
        )}

        {/* Group Assignment */}
        {widget.type !== 'container' && widget.type !== 'collapsible_container' && (() => {
          const containers = widgets.filter(w => (w.type === 'container' || w.type === 'collapsible_container') && w.id !== widget.id);
          if (containers.length === 0) return null;
          return (
            <Section title="Group">
              <Field label="Container">
                <select
                  value={widget.parentId || ''}
                  onChange={e => {
                    const newParentId = e.target.value || undefined;
                    if (layoutMode === 'grid') {
                      if (newParentId && !widget.parentId) {
                        // Grouping: set default pixel position inside the container
                        onUpdateWidget(widget.id, { parentId: newParentId, x: 8, y: 32, w: 160, h: 80 });
                      } else if (!newParentId && widget.parentId) {
                        // Ungrouping: convert back to grid units at row 0, col 0
                        onUpdateWidget(widget.id, { parentId: undefined, x: 0, y: 0, w: 3, h: 1 });
                      } else {
                        onUpdateWidget(widget.id, { parentId: newParentId });
                      }
                    } else {
                      onUpdateWidget(widget.id, { parentId: newParentId });
                    }
                  }}
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
        {widget.type !== 'text_label' && widget.type !== 'alarm_summary' && widget.type !== 'multi_value' && widget.type !== 'control_group' && widget.type !== 'auto_fill' && widget.type !== 'container' && widget.type !== 'collapsible_container' && widget.type !== 'cognex_viewer' && widget.type !== 'zebra_printer' && widget.type !== 'trend' && (
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

        {widget.type === 'gauge' && (
          <Section title="Target">
            <Field label="Target Tag">
              <TagPicker value={p.targetTag as string || ''} onChange={v => setProp('targetTag', v || undefined)} />
            </Field>
            <Field label="Target Value">
              <input type="number" value={p.targetValue ?? ''} onChange={e => setProp('targetValue', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Fixed target (if no tag)"
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
            </Field>
            <p className="text-[10px] text-slate-500">Colors shift green/amber/red based on distance from target</p>
          </Section>
        )}

        {widget.type === 'command_button' && (
          <Section title="Button">
            <Field label="Variant">
              <select value={p.variant as string || 'filled'} onChange={e => setProp('variant', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white">
                <option value="filled">Filled</option>
                <option value="outline">Outline</option>
                <option value="ghost">Ghost</option>
              </select>
            </Field>
            <Field label="Shape">
              <select value={p.shape as string || 'rectangle'} onChange={e => setProp('shape', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white">
                <option value="rectangle">Rectangle</option>
                <option value="pill">Pill</option>
                <option value="circle">Circle</option>
              </select>
            </Field>
            <Field label="Color">
              <select value={p.color || 'blue'} onChange={e => setProp('color', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white">
                <option value="blue">Blue</option>
                <option value="green">Green</option>
                <option value="red">Red</option>
                <option value="yellow">Yellow</option>
              </select>
            </Field>
            <IconPicker value={p.icon as string || ''} onChange={v => setProp('icon', v)} />
            {p.icon && (p.shape as string) !== 'circle' && (
              <Field label="Icon Position">
                <select value={p.iconPosition as string || 'left'} onChange={e => setProp('iconPosition', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white">
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </Field>
            )}
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

        {widget.type === 'light_indicator' && (
          <Section title="Light Indicator">
            <Field label="Write Tag (optional)">
              <TagPicker value={p.writeTag as string || ''} onChange={v => setProp('writeTag', v)} />
            </Field>
            <p className="text-[10px] text-slate-500 -mt-1">If set, clicking the indicator toggles this tag</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="On Color">
                <input type="color" value={p.onColor as string || '#22c55e'} onChange={e => setProp('onColor', e.target.value)}
                  className="w-full h-7 bg-slate-700 border border-slate-600 rounded cursor-pointer" />
              </Field>
              <Field label="Off Color">
                <input type="color" value={p.offColor as string || '#6b7280'} onChange={e => setProp('offColor', e.target.value)}
                  className="w-full h-7 bg-slate-700 border border-slate-600 rounded cursor-pointer" />
              </Field>
            </div>
            <Field label="Size">
              <select value={p.size as string || 'medium'} onChange={e => setProp('size', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white">
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </Field>
          </Section>
        )}

        {widget.type === 'cognex_viewer' && (
          <Section title="Cognex DataMan">
            <Field label="Tag Prefix">
              <input type="text" value={p.tagPrefix || 'dataman'} onChange={e => setProp('tagPrefix', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                placeholder="dataman" />
            </Field>
            <p className="text-[10px] text-slate-500 -mt-1">Tags: prefix.status, prefix.last_result, etc.</p>
            <Field label="Show Image">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={p.showImage !== false} onChange={e => setProp('showImage', e.target.checked)}
                  className="accent-blue-500" />
                <span className="text-xs text-slate-300">Display captured image</span>
              </label>
            </Field>
            <Field label="Show Trigger">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!p.showTrigger} onChange={e => setProp('showTrigger', e.target.checked)}
                  className="accent-blue-500" />
                <span className="text-xs text-slate-300">Manual trigger button</span>
              </label>
            </Field>
          </Section>
        )}

        {widget.type === 'zebra_printer' && (
          <Section title="Zebra Printer">
            <Field label="Tag Prefix">
              <input type="text" value={p.tagPrefix || 'zebra'} onChange={e => setProp('tagPrefix', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                placeholder="zebra" />
            </Field>
            <p className="text-[10px] text-slate-500 -mt-1">Tags: prefix.status, prefix.paper_out, etc.</p>
            <Field label="Show Faults">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={p.showFaults !== false} onChange={e => setProp('showFaults', e.target.checked)}
                  className="accent-blue-500" />
                <span className="text-xs text-slate-300">Display fault indicators</span>
              </label>
            </Field>
            <Field label="Show Controls">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!p.showControls} onChange={e => setProp('showControls', e.target.checked)}
                  className="accent-blue-500" />
                <span className="text-xs text-slate-300">Speed, darkness & test label</span>
              </label>
            </Field>
          </Section>
        )}

        {widget.type === 'zpl_preview' && (
          <Section title="ZPL Preview">
            <Field label="Static ZPL">
              <textarea value={p.staticZpl || ''} onChange={e => setProp('staticZpl', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white font-mono h-24 resize-y"
                placeholder="^XA^FO50,50^ADN,36,20^FDHello^FS^XZ" />
            </Field>
            <p className="text-[10px] text-slate-500 -mt-1">If a tag is bound, its value is used as ZPL instead.</p>
            <Field label="DPI">
              <select value={p.dpi as number || 203} onChange={e => setProp('dpi', Number(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white">
                <option value={152}>152</option>
                <option value={203}>203</option>
                <option value={300}>300</option>
                <option value={600}>600</option>
              </select>
            </Field>
            <Field label="Auto Refresh">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={p.refreshOnTagChange !== false} onChange={e => setProp('refreshOnTagChange', e.target.checked)}
                  className="accent-blue-500" />
                <span className="text-xs text-slate-300">Re-render when tag changes</span>
              </label>
            </Field>
          </Section>
        )}

        {widget.type === 'qr_code' && (
          <Section title="QR Code">
            <Field label="Static Content">
              <input type="text" value={p.staticContent || ''} onChange={e => setProp('staticContent', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                placeholder="URL or text (tag overrides)" />
            </Field>
            <p className="text-[10px] text-slate-500 -mt-1">If a tag is bound, its value is used instead.</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="FG Color">
                <input type="color" value={p.fgColor || '#ffffff'} onChange={e => setProp('fgColor', e.target.value)}
                  className="w-full h-7 bg-slate-700 border border-slate-600 rounded cursor-pointer" />
              </Field>
              <Field label="BG Color">
                <input type="color" value={p.bgColor === 'transparent' ? '#0f172a' : (p.bgColor || '#0f172a')} onChange={e => setProp('bgColor', e.target.value)}
                  className="w-full h-7 bg-slate-700 border border-slate-600 rounded cursor-pointer" />
              </Field>
            </div>
          </Section>
        )}

        {widget.type === 'auto_fill' && (
          <Section title="Auto Fill">
            <Field label="Tag Label">
              <LabelPicker value={p.labelName as string || ''} onChange={v => setProp('labelName', v)} />
            </Field>
            <Field label="Columns">
              <select value={p.columns as number || 2} onChange={e => setProp('columns', Number(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white">
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="On Color">
                <input type="color" value={p.onColor as string || '#22c55e'} onChange={e => setProp('onColor', e.target.value)}
                  className="w-full h-7 bg-slate-700 border border-slate-600 rounded cursor-pointer" />
              </Field>
              <Field label="Off Color">
                <input type="color" value={p.offColor as string || '#6b7280'} onChange={e => setProp('offColor', e.target.value)}
                  className="w-full h-7 bg-slate-700 border border-slate-600 rounded cursor-pointer" />
              </Field>
            </div>
            <Field label="Decimal Places">
              <input type="number" value={p.decimalPlaces ?? 1} onChange={e => setProp('decimalPlaces', Number(e.target.value))}
                min={0} max={6}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
            </Field>
            {p.labelName && (
              <TagOrderEditor labelName={p.labelName as string} order={(p.tagOrder as string[]) || []} onChange={v => setProp('tagOrder', v)} />
            )}
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

        {/* Trend Widget */}
        {widget.type === 'trend' && (
          <>
            <Section title="Trend Tags">
              {((p.tags as Array<{ tag: string; color?: string }>) || []).map((t, i) => (
                <div key={i} className="flex items-center gap-1 mb-1">
                  <input
                    type="color"
                    value={t.color || ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'][i % 8]}
                    onChange={e => {
                      const arr = [...((p.tags as Array<{ tag: string; color?: string }>) || [])];
                      arr[i] = { ...arr[i], color: e.target.value };
                      setProp('tags', arr);
                    }}
                    className="w-6 h-6 rounded border border-slate-600 bg-transparent cursor-pointer shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <TagPicker value={t.tag} onChange={v => {
                      const arr = [...((p.tags as Array<{ tag: string; color?: string }>) || [])];
                      arr[i] = { ...arr[i], tag: v };
                      setProp('tags', arr);
                    }} />
                  </div>
                  <button
                    onClick={() => {
                      const arr = [...((p.tags as Array<{ tag: string; color?: string }>) || [])];
                      arr.splice(i, 1);
                      setProp('tags', arr);
                    }}
                    className="text-slate-500 hover:text-red-400 text-xs shrink-0 px-1"
                    title="Remove tag"
                  >&#x2715;</button>
                </div>
              ))}
              {((p.tags as Array<{ tag: string; color?: string }>) || []).length < 8 && (
                <button
                  onClick={() => {
                    const arr = [...((p.tags as Array<{ tag: string; color?: string }>) || [])];
                    arr.push({ tag: '' });
                    setProp('tags', arr);
                  }}
                  className="w-full text-left px-2 py-1 text-xs text-blue-400 hover:text-blue-300"
                >+ Add Tag</button>
              )}
            </Section>
            <Section title="Time Range">
              <Field label="Hours">
                <input type="number" value={p.hours ?? 24} onChange={e => setProp('hours', Number(e.target.value))}
                  min={0.1} step={1}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
              </Field>
              <Field label="Refresh (seconds)">
                <input type="number" value={p.refreshSeconds ?? 30} onChange={e => setProp('refreshSeconds', Number(e.target.value))}
                  min={0} step={5}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
              </Field>
            </Section>
          </>
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

// Common icon names useful for industrial HMI buttons
const POPULAR_ICONS = [
  'Play', 'Pause', 'Square', 'Power', 'PowerOff', 'RotateCcw', 'RotateCw',
  'ChevronUp', 'ChevronDown', 'ChevronLeft', 'ChevronRight',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Plus', 'Minus', 'X', 'Check', 'RefreshCw',
  'Zap', 'ZapOff', 'AlertTriangle', 'Bell', 'BellOff',
  'Settings', 'Wrench', 'Home', 'Save', 'Download', 'Upload',
  'Trash2', 'Eye', 'EyeOff', 'Lock', 'Unlock',
];

const allIconNames = Object.keys(icons);

function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return POPULAR_ICONS.filter(name => name in icons);
    const q = search.toLowerCase();
    return allIconNames.filter(name => name.toLowerCase().includes(q)).slice(0, 40);
  }, [search]);

  const SelectedIcon = value ? (icons as Record<string, React.ComponentType<{ size?: number }>>)[value] : null;

  return (
    <div ref={ref} className="relative">
      <label className="text-[10px] text-slate-500 mb-0.5 block">Icon</label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white flex items-center gap-2"
      >
        {SelectedIcon && <SelectedIcon size={14} />}
        <span className="flex-1 text-left">{value || '(none)'}</span>
        {value && (
          <span
            onClick={e => { e.stopPropagation(); onChange(''); }}
            className="text-slate-400 hover:text-white"
          >&times;</span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-60 overflow-auto">
          <div className="sticky top-0 bg-slate-800 p-1.5 border-b border-slate-700">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search icons..."
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-5 gap-0.5 p-1.5">
            {filtered.map(name => {
              const Ic = (icons as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[name];
              if (!Ic) return null;
              return (
                <button
                  key={name}
                  title={name}
                  onClick={() => { onChange(name); setOpen(false); setSearch(''); }}
                  className={`p-1.5 rounded flex items-center justify-center hover:bg-slate-600 ${
                    value === name ? 'bg-blue-600' : ''
                  }`}
                >
                  <Ic size={16} className="text-white" />
                </button>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">No icons found</div>
          )}
        </div>
      )}
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

