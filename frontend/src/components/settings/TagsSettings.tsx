import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Search, Download, Plus, Pencil, Trash2, Upload, X, FolderSearch, Tag as TagIcon, CheckSquare, Square, MinusSquare, Filter, ChevronRight, ChevronDown, Folder, FolderOpen, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { InlineTagValue, DeleteConfirmDialog, Field, inputCls, EMPTY_TAG, LABEL_COLORS, EnumMappingEditor, parseAlarmConfig, FaultHelpConfig } from './shared';
import type { Tag, TagLabel, DataSourceData, BrowsedTag, BrowsedNode, ImportPreviewTag, ImportConflictMode, TagValue } from '../../types';

// ─── Tag Edit Dialog ───
export function TagDialog({ tag, dataSources, allLabels, onSave, onClose, onLabelCreated }: {
  tag: Omit<Tag, 'id'> & { id?: number };
  dataSources: DataSourceData[];
  allLabels: TagLabel[];
  onSave: (data: Omit<Tag, 'id'> & { id?: number }) => void;
  onClose: () => void;
  onLabelCreated?: () => void;
}) {
  const [form, setForm] = useState(tag);
  const set = useCallback(<K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v })), []);
  const setAlarmField = useCallback((field: string, value: string | boolean) => {
    setForm(f => {
      const current = parseAlarmConfig(f.alarm_config);
      return { ...f, alarm_config: JSON.stringify({ ...current, [field]: value }) as unknown as Record<string, unknown> | null };
    });
  }, []);
  const [labelSearch, setLabelSearch] = useState('');
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);

  const selectedLabelIds = new Set((form.labels || []).map(l => l.id));
  const filteredLabels = allLabels.filter(l =>
    !selectedLabelIds.has(l.id) && l.name.toLowerCase().includes(labelSearch.toLowerCase())
  );
  const trimmedSearch = labelSearch.trim();
  const exactMatch = allLabels.some(l => l.name.toLowerCase() === trimmedSearch.toLowerCase());
  const canCreateLabel = trimmedSearch.length > 0 && !exactMatch;

  const handleCreateLabel = useCallback(async () => {
    if (!trimmedSearch || creatingLabel) return;
    setCreatingLabel(true);
    try {
      const color = LABEL_COLORS[allLabels.length % LABEL_COLORS.length];
      const newLabel = await api.createTagLabel({ name: trimmedSearch, color });
      setForm(f => { const labels: TagLabel[] = [...(f.labels || []), newLabel]; return { ...f, labels }; });
      setLabelSearch('');
      setShowLabelDropdown(false);
      onLabelCreated?.();
    } catch { /* label creation failed */ }
    setCreatingLabel(false);
  }, [trimmedSearch, creatingLabel, allLabels.length, onLabelCreated]);

  const toggleLabel = useCallback((label: TagLabel) => {
    setForm(f => {
      const current = f.labels || [];
      const exists = current.some(l => l.id === label.id);
      return { ...f, labels: exists ? current.filter(l => l.id !== label.id) : [...current, label] };
    });
    setLabelSearch('');
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (labelRef.current && !labelRef.current.contains(e.target as Node)) setShowLabelDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--hmi-text-primary)]">{form.id != null ? 'Edit Tag' : 'New Tag'}</h2>
          <button onClick={onClose} className="text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Identity */}
          <Field label="Name *">
            <input value={form.name} onChange={e => set('name', e.target.value)} required className={inputCls} placeholder="e.g. Tank1.Level" />
          </Field>
          <Field label="Labels">
            <div ref={labelRef} className="relative">
              <div className="flex flex-wrap gap-1.5 min-h-[38px] w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-md px-2 py-1.5 cursor-text"
                onClick={() => setShowLabelDropdown(true)}>
                {(form.labels || []).map(l => (
                  <span key={l.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white"
                    style={{ backgroundColor: l.color || '#3b82f6' }}>
                    {l.name}
                    <button type="button" onClick={e => { e.stopPropagation(); toggleLabel(l); }}
                      className="hover:text-[var(--hmi-text-primary)] ml-0.5">&times;</button>
                  </span>
                ))}
                <input
                  value={labelSearch}
                  onChange={e => { setLabelSearch(e.target.value); setShowLabelDropdown(true); }}
                  onFocus={() => setShowLabelDropdown(true)}
                  placeholder={form.labels?.length ? '' : 'Search labels...'}
                  className="flex-1 min-w-[80px] bg-transparent text-sm text-white outline-none"
                />
              </div>
              {showLabelDropdown && (filteredLabels.length > 0 || canCreateLabel) && (
                <div className="absolute z-10 mt-1 w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-md shadow-lg max-h-40 overflow-y-auto">
                  {filteredLabels.map(l => (
                    <button key={l.id} type="button"
                      onClick={() => { toggleLabel(l); setShowLabelDropdown(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-border-subtle)] flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: l.color || '#3b82f6' }} />
                      {l.name}
                    </button>
                  ))}
                  {canCreateLabel && (
                    <button type="button" onClick={handleCreateLabel} disabled={creatingLabel}
                      className="w-full text-left px-3 py-1.5 text-sm text-blue-400 hover:bg-[var(--hmi-border-subtle)] flex items-center gap-2 border-t border-[var(--hmi-border-subtle)]">
                      <Plus size={14} className="flex-shrink-0" />
                      {creatingLabel ? 'Creating...' : <>Create &ldquo;{trimmedSearch}&rdquo;</>}
                    </button>
                  )}
                </div>
              )}
            </div>
          </Field>
          <Field label="Display Name">
            <input value={form.display_name || ''} onChange={e => set('display_name', e.target.value || null)} className={inputCls} placeholder="Friendly name shown to operators instead of the tag name" />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description || ''}
              onChange={e => set('description', e.target.value || null)}
              className={inputCls}
              rows={3}
              placeholder="Detailed description shown to operators via the info button on widgets"
            />
          </Field>

          {/* Data source & address */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Data Source">
              <select
                value={form.data_source_id ?? ''}
                onChange={e => set('data_source_id', e.target.value ? Number(e.target.value) : null)}
                className={inputCls}
              >
                <option value="">Internal</option>
                {dataSources.map(ds => (
                  <option key={ds.id} value={ds.id}>{ds.name} ({ds.protocol})</option>
                ))}
              </select>
            </Field>
            <Field label="Address">
              <input value={form.address || ''} onChange={e => set('address', e.target.value || null)} className={inputCls} placeholder="e.g. ns=2;s=Temperature" />
            </Field>
          </div>

          {/* Type & access */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Data Type">
              <select value={form.data_type} onChange={e => set('data_type', e.target.value as Tag['data_type'])} className={inputCls}>
                <option value="bool">Bool</option>
                <option value="int">Int</option>
                <option value="float">Float</option>
                <option value="string">String</option>
              </select>
            </Field>
            <Field label="Access Mode">
              <select value={form.access_mode} onChange={e => set('access_mode', e.target.value as Tag['access_mode'])} className={inputCls}>
                <option value="read">Read</option>
                <option value="write">Write</option>
                <option value="read_write">Read/Write</option>
              </select>
            </Field>
            {form.data_type !== 'bool' && (
              <Field label="Units">
                <input value={form.engineering_units || ''} onChange={e => set('engineering_units', e.target.value || null)} className={inputCls} placeholder="e.g. °C" />
              </Field>
            )}
          </div>

          {/* Range & display (not applicable to bool) */}
          {form.data_type !== 'bool' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Min Value">
                <input type="number" value={form.min_value ?? ''} onChange={e => set('min_value', e.target.value ? Number(e.target.value) : null)} className={inputCls} />
              </Field>
              <Field label="Max Value">
                <input type="number" value={form.max_value ?? ''} onChange={e => set('max_value', e.target.value ? Number(e.target.value) : null)} className={inputCls} />
              </Field>
              <Field label="Display Format">
                <input value={form.display_format || ''} onChange={e => set('display_format', e.target.value || null)} className={inputCls} placeholder="e.g. 0.00" />
              </Field>
            </div>
          )}

          {/* Trending */}
          <fieldset className="border border-[var(--hmi-border)] rounded-lg p-3">
            <legend className="text-xs text-[var(--hmi-text-secondary)] px-2">Trending</legend>
            <label className="flex items-center gap-2 text-sm text-[var(--hmi-text-secondary)] cursor-pointer">
              <input type="checkbox" checked={form.trending_enabled} onChange={e => set('trending_enabled', e.target.checked)} className="accent-blue-500" />
              Enabled
            </label>
            {form.trending_enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <Field label="Sample Rate (ms)">
                  <input type="number" value={form.trending_sample_rate_ms ?? ''} onChange={e => set('trending_sample_rate_ms', e.target.value ? Number(e.target.value) : null)} className={inputCls} min={100} step={100} placeholder="1000" />
                </Field>
                <Field label="Deadband">
                  <input type="number" value={form.deadband ?? ''} onChange={e => set('deadband', e.target.value ? Number(e.target.value) : null)} className={inputCls} step="0.1" placeholder="0 (log every sample)" />
                </Field>
              </div>
            )}
          </fieldset>

          {/* Alarm (boolean tags only) */}
          <fieldset className="border border-[var(--hmi-border)] rounded-lg p-3">
            <legend className="text-xs text-[var(--hmi-text-secondary)] px-2">Alarm</legend>
            {form.data_type !== 'bool' ? (
              <p className="text-xs text-[var(--hmi-text-muted)]">Alarms are only supported on boolean tags. Use PLC-side logic for analog threshold alarming.</p>
            ) : (
              <label className="flex items-center gap-2 text-sm text-[var(--hmi-text-secondary)] cursor-pointer">
                <input type="checkbox" checked={form.alarm_enabled} onChange={e => {
                  const enabled = e.target.checked;
                  set('alarm_enabled', enabled);
                  if (enabled && !form.alarm_config) {
                    setForm(f => ({ ...f, alarm_config: JSON.stringify({ type: 'boolean', trigger_on: true, severity: 'warning', message: '' }) as unknown as Record<string, unknown> | null }));
                  }
                }} className="accent-blue-500" />
                Enabled
              </label>
            )}
            {form.data_type === 'bool' && form.alarm_enabled && (
              <div className="flex items-end gap-3 mt-3">
                <Field label="Severity">
                  <select
                    value={parseAlarmConfig(form.alarm_config).severity}
                    onChange={e => setAlarmField('severity', e.target.value)}
                    className={inputCls + ' w-32'}
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </Field>
              </div>
            )}
            {form.data_type === 'bool' && form.alarm_enabled && (
              <FaultHelpConfig alarmConfig={form.alarm_config} setAlarmField={setAlarmField} />
            )}
          </fieldset>

          {/* Simulation */}
          <fieldset className="border border-[var(--hmi-border)] rounded-lg p-3">
            <legend className="text-xs text-[var(--hmi-text-secondary)] px-2">Simulation</legend>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-[var(--hmi-text-secondary)] cursor-pointer">
                <input type="checkbox" checked={form.simulation_enabled} onChange={e => set('simulation_enabled', e.target.checked)} className="accent-blue-500" />
                Enabled
              </label>
              <Field label="Behavior">
                <select value={form.simulation_behavior || ''} onChange={e => set('simulation_behavior', e.target.value || null)} className={inputCls + ' w-36'}>
                  <option value="">None</option>
                  <option value="sine">Sine</option>
                  <option value="ramp">Ramp</option>
                  <option value="random">Random</option>
                  <option value="toggle">Toggle</option>
                  <option value="enum_cycle">Enum Cycle</option>
                </select>
              </Field>
            </div>
          </fieldset>

          {/* Enum Mapping */}
          {(form.data_type === 'int' || form.enum_mapping) && (
            <fieldset className="border border-[var(--hmi-border)] rounded-lg p-3">
              <legend className="text-xs text-[var(--hmi-text-secondary)] px-2">Enum Mapping</legend>
              <p className="text-xs text-[var(--hmi-text-muted)] mb-2">Map integer values to display labels (e.g. 0=Stopped, 1=Running)</p>
              <EnumMappingEditor
                mapping={form.enum_mapping}
                onChange={m => set('enum_mapping', m)}
              />
            </fieldset>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-[var(--hmi-bg-input)] rounded-lg text-sm text-[var(--hmi-text-secondary)] hover:bg-[var(--hmi-border-subtle)]">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-[var(--hmi-accent)] rounded-lg text-sm text-white hover:bg-[var(--hmi-accent-dark)]">{form.id != null ? 'Save' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Bulk Edit Dialog ───
type BulkFieldState = { enabled: boolean; value: unknown };

function BulkEditDialog({ tagCount, dataSources, onApply, onClose }: {
  tagCount: number;
  dataSources: DataSourceData[];
  onApply: (fields: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<Record<string, BulkFieldState>>({
    data_type:              { enabled: false, value: 'float' },
    access_mode:            { enabled: false, value: 'read_write' },
    engineering_units:      { enabled: false, value: '' },
    display_format:         { enabled: false, value: '' },
    min_value:              { enabled: false, value: 0 },
    max_value:              { enabled: false, value: 100 },
    deadband:               { enabled: false, value: 0 },
    data_source_id:         { enabled: false, value: null },
    trending_enabled:       { enabled: false, value: false },
    trending_sample_rate_ms: { enabled: false, value: 1000 },
    alarm_enabled:          { enabled: false, value: false },
    alarm_severity:         { enabled: false, value: 'warning' },
    alarm_help_enabled:     { enabled: false, value: false },
    alarm_help_text:        { enabled: false, value: '' },
    simulation_enabled:     { enabled: false, value: false },
    simulation_behavior:    { enabled: false, value: null },
  });

  // Boolean fields that default to true when first enabled (users enabling
  // "Alarm" in bulk edit almost always want alarm_enabled=true, not false).
  const booleanKeys = new Set(['trending_enabled', 'alarm_enabled', 'alarm_help_enabled', 'simulation_enabled']);

  const toggle = useCallback((key: string) =>
    setFields(f => {
      const wasEnabled = f[key].enabled;
      const newEnabled = !wasEnabled;
      // When enabling a boolean toggle field, auto-set value to true
      const value = (!wasEnabled && newEnabled && booleanKeys.has(key)) ? true : f[key].value;
      return { ...f, [key]: { ...f[key], enabled: newEnabled, value } };
    }), []);
  const setValue = useCallback((key: string, value: unknown) =>
    setFields(f => ({ ...f, [key]: { ...f[key], value } })), []);

  // Map bulk-edit alarm sub-fields into an alarm_config patch dict
  const alarmConfigKeys: Record<string, string> = {
    alarm_severity: 'severity',
    alarm_help_enabled: 'help_enabled',
    alarm_help_text: 'help_text',
  };

  const handleApply = useCallback(() => {
    const patch: Record<string, unknown> = {};
    const alarmPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!v.enabled) continue;
      if (k in alarmConfigKeys) {
        alarmPatch[alarmConfigKeys[k]] = v.value;
      } else {
        patch[k] = v.value;
      }
    }
    if (Object.keys(alarmPatch).length > 0) {
      patch.alarm_config = alarmPatch;
    }
    if (Object.keys(patch).length > 0) onApply(patch);
    else onClose();
  }, [fields, onApply, onClose]);

  const enabledCount = Object.values(fields).filter(f => f.enabled).length;

  const rowCls = 'flex items-center gap-3 py-2 border-b border-[var(--hmi-border)]/50';
  const checkCls = 'text-[var(--hmi-text-muted)] hover:text-[var(--hmi-text-secondary)] flex-shrink-0';
  const labelCls = 'text-sm text-[var(--hmi-text-secondary)] w-36 flex-shrink-0';
  const ctrlCls = 'flex-1 bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded px-2 py-1 text-sm text-white outline-none disabled:opacity-40';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-[var(--hmi-text-primary)]">Edit Fields</h2>
          <button onClick={onClose} className="text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]"><X size={20} /></button>
        </div>
        <p className="text-sm text-[var(--hmi-text-muted)] mb-4">
          Editing {tagCount} tag{tagCount !== 1 ? 's' : ''}. Check a field to change its value on all selected tags.
        </p>

        <div className="space-y-0 mb-5">
          {/* Data Type */}
          <div className={rowCls}>
            <button onClick={() => toggle('data_type')} className={checkCls}>
              {fields.data_type.enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
            </button>
            <span className={labelCls}>Data Type</span>
            <select value={fields.data_type.value as string}
              onChange={e => setValue('data_type', e.target.value)}
              disabled={!fields.data_type.enabled} className={ctrlCls}>
              <option value="bool">Bool</option>
              <option value="int">Int</option>
              <option value="float">Float</option>
              <option value="string">String</option>
            </select>
          </div>

          {/* Access Mode */}
          <div className={rowCls}>
            <button onClick={() => toggle('access_mode')} className={checkCls}>
              {fields.access_mode.enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
            </button>
            <span className={labelCls}>Access Mode</span>
            <select value={fields.access_mode.value as string}
              onChange={e => setValue('access_mode', e.target.value)}
              disabled={!fields.access_mode.enabled} className={ctrlCls}>
              <option value="read">Read</option>
              <option value="write">Write</option>
              <option value="read_write">Read/Write</option>
            </select>
          </div>

          {/* Engineering Units */}
          <div className={rowCls}>
            <button onClick={() => toggle('engineering_units')} className={checkCls}>
              {fields.engineering_units.enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
            </button>
            <span className={labelCls}>Units</span>
            <input type="text" value={fields.engineering_units.value as string}
              onChange={e => setValue('engineering_units', e.target.value || null)}
              disabled={!fields.engineering_units.enabled}
              className={ctrlCls} placeholder="e.g. °C, bar, rpm" />
          </div>

          {/* Display Format */}
          <div className={rowCls}>
            <button onClick={() => toggle('display_format')} className={checkCls}>
              {fields.display_format.enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
            </button>
            <span className={labelCls}>Display Format</span>
            <input type="text" value={fields.display_format.value as string}
              onChange={e => setValue('display_format', e.target.value || null)}
              disabled={!fields.display_format.enabled}
              className={ctrlCls} placeholder="e.g. 0.00, 0.0" />
          </div>

          {/* Min Value */}
          <div className={rowCls}>
            <button onClick={() => toggle('min_value')} className={checkCls}>
              {fields.min_value.enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
            </button>
            <span className={labelCls}>Min Value</span>
            <input type="number" value={fields.min_value.value as number}
              onChange={e => setValue('min_value', e.target.value === '' ? null : Number(e.target.value))}
              disabled={!fields.min_value.enabled}
              className={ctrlCls} />
          </div>

          {/* Max Value */}
          <div className={rowCls}>
            <button onClick={() => toggle('max_value')} className={checkCls}>
              {fields.max_value.enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
            </button>
            <span className={labelCls}>Max Value</span>
            <input type="number" value={fields.max_value.value as number}
              onChange={e => setValue('max_value', e.target.value === '' ? null : Number(e.target.value))}
              disabled={!fields.max_value.enabled}
              className={ctrlCls} />
          </div>

          {/* Deadband */}
          <div className={rowCls}>
            <button onClick={() => toggle('deadband')} className={checkCls}>
              {fields.deadband.enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
            </button>
            <span className={labelCls}>Deadband</span>
            <input type="number" value={fields.deadband.value as number}
              onChange={e => setValue('deadband', e.target.value === '' ? null : Number(e.target.value))}
              disabled={!fields.deadband.enabled}
              className={ctrlCls} step="0.1" min="0" />
          </div>

          {/* Data Source */}
          <div className={rowCls}>
            <button onClick={() => toggle('data_source_id')} className={checkCls}>
              {fields.data_source_id.enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
            </button>
            <span className={labelCls}>Data Source</span>
            <select
              value={fields.data_source_id.value == null ? '' : String(fields.data_source_id.value)}
              onChange={e => setValue('data_source_id', e.target.value ? Number(e.target.value) : null)}
              disabled={!fields.data_source_id.enabled} className={ctrlCls}>
              <option value="">Internal</option>
              {dataSources.map(ds => <option key={ds.id} value={ds.id}>{ds.name} ({ds.protocol})</option>)}
            </select>
          </div>

          {/* Boolean flags */}
          {([
            ['trending_enabled', 'Trending'],
            ['alarm_enabled', 'Alarm'],
            ['simulation_enabled', 'Simulation'],
          ] as [string, string][]).map(([key, label]) => (
            <div key={key} className={rowCls}>
              <button onClick={() => toggle(key)} className={checkCls}>
                {fields[key].enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
              </button>
              <span className={labelCls}>{label}</span>
              <label className="flex items-center gap-2 text-sm text-[var(--hmi-text-secondary)] cursor-pointer">
                <input type="checkbox"
                  checked={fields[key].value as boolean}
                  onChange={e => setValue(key, e.target.checked)}
                  disabled={!fields[key].enabled}
                  className="accent-blue-500 disabled:opacity-40" />
                {(fields[key].value as boolean) ? 'Enabled' : 'Disabled'}
              </label>
            </div>
          ))}

          {/* Trending Sample Rate */}
          <div className={rowCls}>
            <button onClick={() => toggle('trending_sample_rate_ms')} className={checkCls}>
              {fields.trending_sample_rate_ms.enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
            </button>
            <span className={labelCls}>Sample Rate (ms)</span>
            <input type="number" value={fields.trending_sample_rate_ms.value as number}
              onChange={e => setValue('trending_sample_rate_ms', e.target.value === '' ? null : Number(e.target.value))}
              disabled={!fields.trending_sample_rate_ms.enabled}
              className={ctrlCls} min="100" step="100" />
          </div>

          {/* Alarm Severity */}
          <div className={rowCls}>
            <button onClick={() => toggle('alarm_severity')} className={checkCls}>
              {fields.alarm_severity.enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
            </button>
            <span className={labelCls}>Alarm Severity</span>
            <select value={fields.alarm_severity.value as string}
              onChange={e => setValue('alarm_severity', e.target.value)}
              disabled={!fields.alarm_severity.enabled} className={ctrlCls}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Alarm Fault Help Enabled */}
          <div className={rowCls}>
            <button onClick={() => toggle('alarm_help_enabled')} className={checkCls}>
              {fields.alarm_help_enabled.enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
            </button>
            <span className={labelCls}>Fault Help</span>
            <label className="flex items-center gap-2 text-sm text-[var(--hmi-text-secondary)] cursor-pointer">
              <input type="checkbox"
                checked={fields.alarm_help_enabled.value as boolean}
                onChange={e => setValue('alarm_help_enabled', e.target.checked)}
                disabled={!fields.alarm_help_enabled.enabled}
                className="accent-blue-500 disabled:opacity-40" />
              {(fields.alarm_help_enabled.value as boolean) ? 'Enabled' : 'Disabled'}
            </label>
          </div>

          {/* Alarm Help Text */}
          <div className={rowCls}>
            <button onClick={() => toggle('alarm_help_text')} className={checkCls}>
              {fields.alarm_help_text.enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
            </button>
            <span className={labelCls}>Help Text</span>
            <input type="text" value={fields.alarm_help_text.value as string}
              onChange={e => setValue('alarm_help_text', e.target.value)}
              disabled={!fields.alarm_help_text.enabled}
              className={ctrlCls} placeholder="Troubleshooting instructions" />
          </div>

          {/* Simulation Behavior */}
          <div className={rowCls + ' border-b-0'}>
            <button onClick={() => toggle('simulation_behavior')} className={checkCls}>
              {fields.simulation_behavior.enabled ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
            </button>
            <span className={labelCls}>Sim Behavior</span>
            <select
              value={(fields.simulation_behavior.value as string) || ''}
              onChange={e => setValue('simulation_behavior', e.target.value || null)}
              disabled={!fields.simulation_behavior.enabled} className={ctrlCls}>
              <option value="">None</option>
              <option value="sine">Sine</option>
              <option value="ramp">Ramp</option>
              <option value="random">Random</option>
              <option value="toggle">Toggle</option>
              <option value="enum_cycle">Enum Cycle</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-[var(--hmi-bg-input)] rounded-lg text-sm text-[var(--hmi-text-secondary)] hover:bg-[var(--hmi-border-subtle)]">Cancel</button>
          <button
            onClick={handleApply}
            disabled={enabledCount === 0}
            className="px-4 py-2 bg-[var(--hmi-accent)] rounded-lg text-sm text-white hover:bg-[var(--hmi-accent-dark)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply to {tagCount} Tag{tagCount !== 1 ? 's' : ''}{enabledCount > 0 ? ` (${enabledCount} field${enabledCount !== 1 ? 's' : ''})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Label Dialog ───
function BulkLabelDialog({ mode, tagCount, allLabels, onApply, onClose }: {
  mode: 'add' | 'remove';
  tagCount: number;
  allLabels: TagLabel[];
  onApply: (labelIds: number[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleLabel = useCallback((id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--hmi-text-primary)]">
            {mode === 'add' ? 'Add' : 'Remove'} Labels
          </h2>
          <button onClick={onClose} className="text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]"><X size={20} /></button>
        </div>
        <p className="text-sm text-[var(--hmi-text-secondary)] mb-3">
          {mode === 'add' ? 'Add labels to' : 'Remove labels from'} {tagCount} selected tag{tagCount !== 1 ? 's' : ''}
        </p>
        <div className="space-y-1 max-h-60 overflow-y-auto mb-4">
          {allLabels.map(l => (
            <button
              key={l.id}
              onClick={() => toggleLabel(l.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${selected.has(l.id) ? 'bg-[var(--hmi-accent-bg)] border border-[var(--hmi-accent)]/40' : 'hover:bg-[var(--hmi-bg-input)] border border-transparent'}`}
            >
              {selected.has(l.id)
                ? <CheckSquare size={16} className="text-blue-400 flex-shrink-0" />
                : <Square size={16} className="text-[var(--hmi-text-muted)] flex-shrink-0" />}
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: l.color || '#3b82f6' }} />
              <span className="text-[var(--hmi-text-primary)]">{l.name}</span>
              {l.description && <span className="text-[var(--hmi-text-muted)] text-xs ml-auto truncate max-w-32">{l.description}</span>}
            </button>
          ))}
          {allLabels.length === 0 && <p className="text-sm text-[var(--hmi-text-muted)] text-center py-4">No labels created yet</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-[var(--hmi-bg-input)] rounded-lg text-sm text-[var(--hmi-text-secondary)] hover:bg-[var(--hmi-border-subtle)]">Cancel</button>
          <button
            onClick={() => onApply(Array.from(selected))}
            disabled={selected.size === 0}
            className="px-4 py-2 bg-[var(--hmi-accent)] rounded-lg text-sm text-white hover:bg-[var(--hmi-accent-dark)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mode === 'add' ? 'Add' : 'Remove'} {selected.size > 0 ? `${selected.size} Label${selected.size !== 1 ? 's' : ''}` : 'Labels'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tag Import Dialog (HMI CSV, CODESYS XML, RSLogix 500) ───
type ImportFormat = 'hmi_csv' | 'codesys_xml' | 'rslogix500';

function TagImportDialog({ dataSources, existingTagNames, onImportCsv, onImportCodesys, onImportRslogix, onClose }: {
  dataSources: DataSourceData[];
  existingTagNames: Set<string>;
  onImportCsv: (tags: Record<string, unknown>[], dataSourceId: number | null, onConflict: ImportConflictMode, updateFields: string[]) => void;
  onImportCodesys: (xml: string, prefix: string, names: string[], dataSourceId: number | null, onConflict: ImportConflictMode, updateFields: string[]) => void;
  onImportRslogix: (csv: string, prefix: string, names: string[], dataSourceId: number | null, onConflict: ImportConflictMode, updateFields: string[]) => void;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ImportFormat>('hmi_csv');
  const [dataSourceId, setDataSourceId] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawContent, setRawContent] = useState('');
  const [prefix, setPrefix] = useState('');
  const [previewTags, setPreviewTags] = useState<ImportPreviewTag[]>([]);
  const [previewGroups, setPreviewGroups] = useState<Record<string, number>>({});
  const [previewEnumCount, setPreviewEnumCount] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [conflictMode, setConflictMode] = useState<ImportConflictMode>('skip');
  const [updateFields, setUpdateFields] = useState<Set<string>>(new Set(['display_name', 'data_type', 'access_mode', 'address', 'enum_mapping', 'engineering_units']));
  const fileRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setRows([]);
    setHeaders([]);
    setRawContent('');
    setPreviewTags([]);
    setPreviewGroups({});
    setPreviewEnumCount(0);
    setPreviewError('');
    setExpandedGroups(new Set());
    setSelectedNames(new Set());
    setConflictMode('skip');
    setUpdateFields(new Set(['display_name', 'data_type', 'access_mode', 'address', 'enum_mapping', 'engineering_units']));
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleFormatChange = useCallback((f: ImportFormat) => {
    setFormat(f);
    resetState();
  }, [resetState]);

  const loadPreview = useCallback(async (content: string, fmt: ImportFormat, pfx: string) => {
    setPreviewLoading(true);
    setPreviewError('');
    try {
      if (fmt === 'codesys_xml') {
        const result = await api.previewCodesysImport(content, pfx);
        setPreviewTags(result.tags);
        setPreviewGroups(result.groups);
        setPreviewEnumCount(result.enum_count);
        setSelectedNames(new Set(result.tags.filter(t => !existingTagNames.has(t.name)).map(t => t.name)));
      } else if (fmt === 'rslogix500') {
        const result = await api.previewRslogix500Import(content, pfx);
        setPreviewTags(result.tags);
        setPreviewGroups(result.groups);
        setPreviewEnumCount(0);
        setSelectedNames(new Set(result.tags.filter(t => !existingTagNames.has(t.name)).map(t => t.name)));
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
      setPreviewTags([]);
      setPreviewGroups({});
      setSelectedNames(new Set());
    } finally {
      setPreviewLoading(false);
    }
  }, [existingTagNames]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      if (format === 'hmi_csv') {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return;
        const hdr = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        setHeaders(hdr);
        const parsed = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const row: Record<string, string> = {};
          hdr.forEach((h, i) => { row[h] = vals[i] || ''; });
          return row;
        });
        setRows(parsed);
        setSelectedNames(new Set(parsed.filter(r => !existingTagNames.has(r.name)).map((r, i) => r.name || String(i))));
      } else {
        setRawContent(text);
        loadPreview(text, format, prefix);
      }
    };
    reader.readAsText(file);
  }, [format, prefix, loadPreview, existingTagNames]);

  // Re-preview when prefix changes for PLC formats
  const prefixTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(prefixTimeoutRef.current), []);
  const handlePrefixChange = useCallback((val: string) => {
    setPrefix(val);
    if (rawContent && format !== 'hmi_csv') {
      clearTimeout(prefixTimeoutRef.current);
      prefixTimeoutRef.current = setTimeout(() => loadPreview(rawContent, format, val), 300);
    }
  }, [rawContent, format, loadPreview]);

  const toggleGroup = useCallback((group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  // Selection helpers
  const allNames = format === 'hmi_csv'
    ? rows.map((r, i) => r.name || String(i))
    : previewTags.map(t => t.name);
  const selectedCount = selectedNames.size;
  const totalCount = allNames.length;

  const toggleSelectAll = useCallback(() => {
    if (format === 'hmi_csv') {
      const all = rows.map((r, i) => r.name || String(i));
      setSelectedNames(prev => prev.size === all.length ? new Set() : new Set(all));
    } else {
      setSelectedNames(prev => prev.size === previewTags.length ? new Set() : new Set(previewTags.map(t => t.name)));
    }
  }, [format, rows, previewTags]);

  const toggleGroupSelection = useCallback((group: string) => {
    const groupTagNames = previewTags.filter(t => (t.group || 'Ungrouped') === group).map(t => t.name);
    setSelectedNames(prev => {
      const next = new Set(prev);
      const allSelected = groupTagNames.every(n => next.has(n));
      if (allSelected) {
        groupTagNames.forEach(n => next.delete(n));
      } else {
        groupTagNames.forEach(n => next.add(n));
      }
      return next;
    });
  }, [previewTags]);

  const toggleTagSelection = useCallback((name: string) => {
    setSelectedNames(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const handleImport = useCallback(() => {
    const names = [...selectedNames];
    const fields = [...updateFields];
    if (format === 'hmi_csv') {
      const selected = rows.filter((r, i) => selectedNames.has(r.name || String(i)));
      onImportCsv(selected, dataSourceId, conflictMode, fields);
    } else if (format === 'codesys_xml') {
      onImportCodesys(rawContent, prefix, names, dataSourceId, conflictMode, fields);
    } else if (format === 'rslogix500') {
      onImportRslogix(rawContent, prefix, names, dataSourceId, conflictMode, fields);
    }
  }, [format, rows, rawContent, prefix, selectedNames, dataSourceId, conflictMode, updateFields, onImportCsv, onImportCodesys, onImportRslogix]);

  const hasData = format === 'hmi_csv' ? rows.length > 0 : previewTags.length > 0;

  // Conflict detection
  const existingCount = useMemo(() => {
    if (format === 'hmi_csv') {
      return rows.filter((r, i) => selectedNames.has(r.name || String(i)) && existingTagNames.has(r.name)).length;
    }
    return [...selectedNames].filter(n => existingTagNames.has(n)).length;
  }, [format, rows, selectedNames, existingTagNames]);
  const newCount = selectedNames.size - existingCount;
  const fileAccept = format === 'codesys_xml' ? '.xml' : '.csv,.CSV';

  const formatInfo: Record<ImportFormat, { label: string; desc: string }> = {
    hmi_csv: { label: 'HMI CSV', desc: 'CSV with header row. Columns: name, description (Display Name), data_type, access_mode, engineering_units, min_value, max_value, address' },
    codesys_xml: { label: 'CODESYS XML', desc: 'CODESYS symbol configuration XML exported from the PLC IDE. Structures, function blocks, enums, and arrays are expanded into flat tags.' },
    rslogix500: { label: 'RSLogix 500', desc: 'RSLogix 500 database CSV export. Addresses are mapped to typed tags grouped by data file (B=Bits, N=Integers, F=Floats, T=Timers, C=Counters).' },
  };

  const typeBadgeColor: Record<string, string> = {
    bool: 'bg-purple-600', int: 'bg-blue-600', float: 'bg-emerald-600', string: 'bg-amber-600',
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] w-full max-w-4xl max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--hmi-text-primary)]">Import Tags</h2>
          <button onClick={onClose} className="text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]"><X size={20} /></button>
        </div>

        {/* Format selector */}
        <div className="flex gap-2 mb-4">
          {(Object.keys(formatInfo) as ImportFormat[]).map(f => (
            <button
              key={f}
              onClick={() => handleFormatChange(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${format === f ? 'bg-[var(--hmi-accent)] text-white' : 'bg-[var(--hmi-bg-input)] text-[var(--hmi-text-secondary)] hover:bg-[var(--hmi-border-subtle)]'}`}
            >
              {formatInfo[f].label}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <p className="text-xs text-[var(--hmi-text-secondary)] mb-2">{formatInfo[format].desc}</p>
          <div className="mb-3">
            <label className="block text-xs text-[var(--hmi-text-secondary)] mb-1">Data Source <span className="text-red-400">*</span></label>
            <select
              value={dataSourceId ?? ''}
              onChange={e => setDataSourceId(e.target.value ? Number(e.target.value) : null)}
              className="w-64 px-3 py-1.5 bg-[var(--hmi-bg-surface)] border border-[var(--hmi-border-subtle)] rounded-lg text-sm text-[var(--hmi-text-primary)]"
            >
              <option value="">Select a data source...</option>
              {dataSources.map(ds => (
                <option key={ds.id} value={ds.id}>{ds.name} ({ds.protocol})</option>
              ))}
            </select>
          </div>
          <input ref={fileRef} type="file" accept={fileAccept} onChange={handleFile} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] text-white text-sm font-medium rounded-lg transition-colors">
            <Upload size={16} />
            {fileRef.current?.files?.length ? fileRef.current.files[0].name : 'Choose File'}
          </button>
        </div>

        {/* Optional prefix for PLC imports */}
        {format !== 'hmi_csv' && (
          <div className="mb-4">
            <label className="block text-xs text-[var(--hmi-text-secondary)] mb-1">Tag name prefix (optional)</label>
            <input
              type="text"
              value={prefix}
              onChange={e => handlePrefixChange(e.target.value)}
              placeholder="e.g. PLC1"
              className="w-48 px-3 py-1.5 bg-[var(--hmi-bg-surface)] border border-[var(--hmi-border-subtle)] rounded-lg text-sm text-[var(--hmi-text-primary)]"
            />
          </div>
        )}

        {/* HMI CSV preview */}
        {format === 'hmi_csv' && rows.length > 0 && (
          <>
            <div className="flex items-center gap-3 mb-2">
              <button onClick={toggleSelectAll} className="text-xs text-blue-400 hover:text-blue-300">
                {selectedCount === totalCount ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-sm text-[var(--hmi-text-secondary)]">{selectedCount} of {totalCount} selected</span>
            </div>
            <div className="overflow-auto mb-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--hmi-border)] text-[var(--hmi-text-secondary)]">
                    <th className="px-2 py-1 w-8">
                      <input
                        type="checkbox"
                        checked={selectedCount === totalCount}
                        onChange={toggleSelectAll}
                        className="accent-blue-600"
                      />
                    </th>
                    {headers.map(h => <th key={h} className="text-left px-2 py-1 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const key = row.name || String(i);
                    const checked = selectedNames.has(key);
                    return (
                      <tr key={i} className={`border-b border-[var(--hmi-border)]/50 cursor-pointer ${checked ? '' : 'opacity-50'}`} onClick={() => toggleTagSelection(key)}>
                        <td className="px-2 py-1" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={checked} onChange={() => toggleTagSelection(key)} className="accent-blue-600" />
                        </td>
                        {headers.map(h => <td key={h} className="px-2 py-1 text-[var(--hmi-text-secondary)] truncate max-w-32">{row[h]}</td>)}
                        {existingTagNames.has(row.name) && (
                          <td className="px-2 py-1"><span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--hmi-text-secondary)] bg-[var(--hmi-border-subtle)]">exists</span></td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* PLC import preview */}
        {format !== 'hmi_csv' && previewLoading && (
          <div className="text-sm text-[var(--hmi-text-secondary)] mb-4">Analyzing file...</div>
        )}
        {previewError && (
          <div className="text-sm text-red-400 mb-4">{previewError}</div>
        )}
        {format !== 'hmi_csv' && previewTags.length > 0 && (
          <>
            {/* Summary + selection controls */}
            <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
              <button onClick={toggleSelectAll} className="text-xs text-blue-400 hover:text-blue-300">
                {selectedCount === totalCount ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-[var(--hmi-text-secondary)]">{selectedCount} of {totalCount} selected</span>
              <span className="text-[var(--hmi-text-muted)]">|</span>
              <span className="text-[var(--hmi-text-secondary)]">{Object.keys(previewGroups).length} groups</span>
              {previewEnumCount > 0 && (
                <>
                  <span className="text-[var(--hmi-text-muted)]">|</span>
                  <span className="text-amber-400">{previewEnumCount} enum tags</span>
                </>
              )}
            </div>

            {/* Grouped tree view */}
            <div className="overflow-auto mb-4 border border-[var(--hmi-border)] rounded-lg">
              {Object.entries(previewGroups)
                .sort(([, a], [, b]) => b - a)
                .map(([group]) => {
                  const isExpanded = expandedGroups.has(group);
                  const groupTags = previewTags.filter(t => (t.group || 'Ungrouped') === group);
                  const groupSelectedCount = groupTags.filter(t => selectedNames.has(t.name)).length;
                  const allGroupSelected = groupSelectedCount === groupTags.length;
                  const someGroupSelected = groupSelectedCount > 0 && !allGroupSelected;
                  return (
                    <div key={group}>
                      <div className="w-full flex items-center gap-2 px-3 py-1.5 bg-[var(--hmi-bg-input)]/70 hover:bg-[var(--hmi-bg-input)] border-b border-[var(--hmi-border)]">
                        <input
                          type="checkbox"
                          checked={allGroupSelected}
                          ref={el => { if (el) el.indeterminate = someGroupSelected; }}
                          onChange={() => toggleGroupSelection(group)}
                          className="accent-blue-600"
                        />
                        <button
                          onClick={() => toggleGroup(group)}
                          className="flex items-center justify-between flex-1 text-left"
                        >
                          <span className="text-sm text-[var(--hmi-text-primary)] font-medium">
                            <span className="text-[var(--hmi-text-muted)] mr-1">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                            {group}
                          </span>
                          <span className="text-xs text-[var(--hmi-text-muted)]">{groupSelectedCount} / {groupTags.length} selected</span>
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="bg-[var(--hmi-bg-surface)]">
                          {groupTags.map((tag, i) => {
                            const checked = selectedNames.has(tag.name);
                            return (
                              <div
                                key={i}
                                className={`flex items-center gap-2 px-4 py-1 border-b border-[var(--hmi-border)] text-xs cursor-pointer ${checked ? '' : 'opacity-50'}`}
                                onClick={() => toggleTagSelection(tag.name)}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleTagSelection(tag.name)}
                                  onClick={e => e.stopPropagation()}
                                  className="accent-blue-600"
                                />
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${typeBadgeColor[tag.data_type] || 'bg-[var(--hmi-border-subtle)]'}`}>
                                  {tag.data_type}
                                </span>
                                {tag.has_enum && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-300 bg-amber-900/40">enum</span>
                                )}
                                {existingTagNames.has(tag.name) && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--hmi-text-secondary)] bg-[var(--hmi-border-subtle)]">exists</span>
                                )}
                                <span className="text-[var(--hmi-text-secondary)] font-mono truncate flex-1">{tag.name}</span>
                                {tag.display_name && (
                                  <span className="text-[var(--hmi-text-muted)] truncate max-w-48">{tag.display_name}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )}

        {/* Conflict resolution */}
        {hasData && existingCount > 0 && (
          <div className="mb-4 p-3 bg-[var(--hmi-bg-surface)] border border-[var(--hmi-border)] rounded-lg">
            <div className="text-sm text-[var(--hmi-text-secondary)] mb-2">
              <span className="text-blue-400 font-medium">{newCount} new</span>
              {' and '}
              <span className="text-amber-400 font-medium">{existingCount} existing</span>
              {' tags selected'}
            </div>
            <div className="flex gap-4 mb-2">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="conflict" checked={conflictMode === 'skip'} onChange={() => setConflictMode('skip')} className="accent-blue-600" />
                <span className="text-[var(--hmi-text-secondary)]">Skip existing</span>
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="conflict" checked={conflictMode === 'update'} onChange={() => setConflictMode('update')} className="accent-blue-600" />
                <span className="text-[var(--hmi-text-secondary)]">Update existing</span>
              </label>
            </div>
            {conflictMode === 'update' && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                <span className="text-xs text-[var(--hmi-text-muted)] w-full mb-0.5">Fields to update:</span>
                {[
                  { key: 'display_name', label: 'Display Name' },
                  { key: 'data_type', label: 'Data Type' },
                  { key: 'access_mode', label: 'Access Mode' },
                  { key: 'address', label: 'Address' },
                  ...(format === 'codesys_xml' ? [{ key: 'enum_mapping', label: 'Enum Mapping' }] : []),
                  ...(format === 'hmi_csv' ? [{ key: 'engineering_units', label: 'Units' }] : []),
                ].map(f => (
                  <label key={f.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={updateFields.has(f.key)}
                      onChange={() => setUpdateFields(prev => {
                        const next = new Set(prev);
                        if (next.has(f.key)) next.delete(f.key);
                        else next.add(f.key);
                        return next;
                      })}
                      className="accent-blue-600"
                    />
                    <span className="text-[var(--hmi-text-secondary)]">{f.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {hasData && (
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-[var(--hmi-bg-input)] rounded-lg text-sm text-[var(--hmi-text-secondary)]">Cancel</button>
            <button
              onClick={handleImport}
              disabled={selectedCount === 0 || dataSourceId === null}
              className="px-4 py-2 bg-[var(--hmi-accent)] rounded-lg text-sm text-white hover:bg-[var(--hmi-accent-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
              title={dataSourceId === null ? 'Select a data source first' : undefined}
            >
              Import {selectedCount} {selectedCount === 1 ? 'Tag' : 'Tags'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Browse Tags Dialog ───
function mapBrowseDataType(dt: string | undefined): 'bool' | 'int' | 'float' | 'string' {
  if (!dt) return 'float';
  const lower = dt.toLowerCase();
  if (lower === 'boolean' || lower === 'bool') return 'bool';
  if (['int16', 'int32', 'int64', 'uint16', 'uint32', 'uint64', 'byte', 'sbyte', 'integer', 'int'].includes(lower)) return 'int';
  if (['string', 'bytestring', 'xmlelement', 'localizedtext', 'qualifiedname'].includes(lower)) return 'string';
  return 'float';
}

interface TreeNodeState {
  node: BrowsedNode;
  expanded: boolean;
  children: TreeNodeState[] | null; // null = not loaded yet
  loading: boolean;
  depth: number;
}

function BrowseTreeRow({ item, existingAddresses, createdAddresses, onCreateTag, onToggle }: {
  item: TreeNodeState;
  existingAddresses: Set<string>;
  createdAddresses: Set<string>;
  onCreateTag: (node: BrowsedNode) => void;
  onToggle: (nodeId: string) => void;
}) {
  const isVariable = item.node.node_class === 'variable';
  const tagAddress = item.node.relative_address || item.node.node_id || '';
  const alreadyExists = existingAddresses.has(tagAddress) || existingAddresses.has(item.node.node_id) || createdAddresses.has(tagAddress);

  return (
    <tr className="border-b border-[var(--hmi-border)]/50 hover:bg-[var(--hmi-bg-input)]/30">
      <td className="px-3 py-1.5 text-[var(--hmi-text-primary)]">
        <div className="flex items-center gap-1" style={{ paddingLeft: `${item.depth * 20}px` }}>
          {isVariable ? (
            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0" />
          ) : (
            <button
              onClick={() => onToggle(item.node.node_id)}
              className="w-5 h-5 flex items-center justify-center flex-shrink-0 text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]"
            >
              {item.loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : item.expanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
          )}
          {isVariable ? (
            <TagIcon size={14} className="text-blue-400 flex-shrink-0" />
          ) : item.expanded ? (
            <FolderOpen size={14} className="text-yellow-400 flex-shrink-0" />
          ) : (
            <Folder size={14} className="text-yellow-400 flex-shrink-0" />
          )}
          <span className="truncate ml-1">{item.node.name}</span>
        </div>
      </td>
      <td className="px-3 py-1.5 text-[var(--hmi-text-secondary)] font-mono text-xs">
        {isVariable ? (
          item.node.relative_address ? (
            <span title={item.node.node_id}>{item.node.relative_address}</span>
          ) : (
            item.node.node_id || '\u2014'
          )
        ) : (
          <span className="text-[var(--hmi-text-muted)] italic">folder</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-[var(--hmi-text-secondary)] text-xs">{isVariable ? (item.node.data_type || '\u2014') : ''}</td>
      <td className="px-3 py-1.5 text-right">
        {isVariable && (
          alreadyExists ? (
            <span className="text-xs text-green-400">Exists</span>
          ) : (
            <button
              onClick={() => onCreateTag(item.node)}
              className="px-2 py-1 bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-hover)] rounded text-xs text-white flex items-center gap-1 ml-auto"
            >
              <Plus size={12} /> Create
            </button>
          )
        )}
      </td>
    </tr>
  );
}

function flattenTree(nodes: TreeNodeState[], filter: string): TreeNodeState[] {
  const result: TreeNodeState[] = [];
  const lowerFilter = filter.toLowerCase();

  function walk(items: TreeNodeState[]) {
    for (const item of items) {
      if (filter) {
        // When filtering, show all variables that match (skip folder structure)
        if (item.node.node_class === 'variable') {
          const name = item.node.name?.toLowerCase() || '';
          const addr = (item.node.relative_address || item.node.node_id || '').toLowerCase();
          if (name.includes(lowerFilter) || addr.includes(lowerFilter)) {
            result.push(item);
          }
        }
        // Always walk children if loaded
        if (item.children) walk(item.children);
      } else {
        result.push(item);
        if (item.expanded && item.children) {
          walk(item.children);
        }
      }
    }
  }
  walk(nodes);
  return result;
}

export function BrowseTagsDialog({ dsId, dsName, existingTags, onCreateTag, onClose }: {
  dsId: number;
  dsName: string;
  existingTags: Tag[];
  onCreateTag: (tag: Omit<Tag, 'id'>) => void;
  onClose: () => void;
}) {
  const [tree, setTree] = useState<TreeNodeState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [createdAddresses, setCreatedAddresses] = useState<Set<string>>(new Set());

  // Load root level on mount
  useEffect(() => {
    let cancelled = false;
    api.browseDataSourceLevel(dsId, null)
      .then(r => {
        if (cancelled) return;
        const nodes: TreeNodeState[] = (r.nodes || []).map(n => ({
          node: n,
          expanded: false,
          children: n.node_class === 'object' && n.has_children ? null : (n.node_class === 'object' ? [] : null),
          loading: false,
          depth: 0,
        }));
        setTree(nodes);
        setLoading(false);
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [dsId]);

  const existingAddresses = useMemo(() => {
    const set = new Set<string>();
    existingTags.forEach(t => {
      if (t.data_source_id === dsId && t.address) set.add(t.address);
    });
    return set;
  }, [existingTags, dsId]);

  const handleToggle = useCallback(async (nodeId: string) => {
    // Find and toggle the node in the tree
    function toggleInTree(items: TreeNodeState[]): TreeNodeState[] {
      return items.map(item => {
        if (item.node.node_id === nodeId) {
          if (item.children === null) {
            // Need to load children
            return { ...item, loading: true };
          }
          return { ...item, expanded: !item.expanded };
        }
        if (item.children) {
          return { ...item, children: toggleInTree(item.children) };
        }
        return item;
      });
    }

    setTree(prev => {
      const updated = toggleInTree(prev);
      return updated;
    });

    // Check if we need to load children
    function findNode(items: TreeNodeState[]): TreeNodeState | null {
      for (const item of items) {
        if (item.node.node_id === nodeId) return item;
        if (item.children) {
          const found = findNode(item.children);
          if (found) return found;
        }
      }
      return null;
    }

    const targetNode = findNode(tree);
    if (!targetNode || targetNode.children !== null) return;

    // Load children from server
    try {
      const r = await api.browseDataSourceLevel(dsId, nodeId);
      const childNodes: TreeNodeState[] = (r.nodes || []).map(n => ({
        node: n,
        expanded: false,
        children: n.node_class === 'object' && n.has_children ? null : (n.node_class === 'object' ? [] : null),
        loading: false,
        depth: (targetNode.depth || 0) + 1,
      }));

      function setChildrenInTree(items: TreeNodeState[]): TreeNodeState[] {
        return items.map(item => {
          if (item.node.node_id === nodeId) {
            return { ...item, children: childNodes, expanded: true, loading: false };
          }
          if (item.children) {
            return { ...item, children: setChildrenInTree(item.children) };
          }
          return item;
        });
      }

      setTree(prev => setChildrenInTree(prev));
    } catch {
      function clearLoadingInTree(items: TreeNodeState[]): TreeNodeState[] {
        return items.map(item => {
          if (item.node.node_id === nodeId) {
            return { ...item, children: [], loading: false };
          }
          if (item.children) {
            return { ...item, children: clearLoadingInTree(item.children) };
          }
          return item;
        });
      }
      setTree(prev => clearLoadingInTree(prev));
    }
  }, [dsId, tree]);

  const handleCreate = useCallback((node: BrowsedNode) => {
    const address = node.relative_address || node.node_id || '';
    const name = node.name || '';
    onCreateTag({
      ...EMPTY_TAG,
      name,
      data_source_id: dsId,
      address,
      data_type: mapBrowseDataType(node.data_type),
      access_mode: 'read',
    });
    setCreatedAddresses(prev => new Set(prev).add(address));
  }, [dsId, onCreateTag]);

  const handleCreateFromBrowsed = useCallback((t: BrowsedTag) => {
    const address = t.relative_address || t.node_id || t.address || '';
    const name = t.name || t.display_name || '';
    onCreateTag({
      ...EMPTY_TAG,
      name,
      data_source_id: dsId,
      address,
      data_type: mapBrowseDataType(t.data_type),
      access_mode: 'read',
    });
    setCreatedAddresses(prev => new Set(prev).add(address));
  }, [dsId, onCreateTag]);

  // Visible rows for the tree/filtered view
  const visibleRows = useMemo(() => flattenTree(tree, filter), [tree, filter]);

  // Count of new (uncreated) variables visible
  const newVariableCount = useMemo(() => {
    return visibleRows.filter(r => {
      if (r.node.node_class !== 'variable') return false;
      const addr = r.node.relative_address || r.node.node_id || '';
      return !existingAddresses.has(addr) && !existingAddresses.has(r.node.node_id) && !createdAddresses.has(addr);
    }).length;
  }, [visibleRows, existingAddresses, createdAddresses]);

  const handleCreateAll = useCallback(() => {
    for (const row of visibleRows) {
      if (row.node.node_class !== 'variable') continue;
      const addr = row.node.relative_address || row.node.node_id || '';
      if (existingAddresses.has(addr) || existingAddresses.has(row.node.node_id) || createdAddresses.has(addr)) continue;
      handleCreate(row.node);
    }
  }, [visibleRows, existingAddresses, createdAddresses, handleCreate]);

  // Fallback: full browse mode for non-OPC-UA or if lazy browse fails
  const [fallbackMode, setFallbackMode] = useState(false);
  const [fallbackTags, setFallbackTags] = useState<BrowsedTag[]>([]);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  const handleFullBrowse = useCallback(() => {
    setFallbackLoading(true);
    api.browseDataSource(dsId)
      .then(r => {
        setFallbackTags(r.tags || []);
        setFallbackMode(true);
        setFallbackLoading(false);
      })
      .catch(() => setFallbackLoading(false));
  }, [dsId]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] w-full max-w-3xl max-h-[80vh] flex flex-col p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[var(--hmi-text-primary)]">Browse Tags: {dsName}</h2>
          <button onClick={onClose} className="text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]"><X size={20} /></button>
        </div>

        {/* Search + actions bar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--hmi-text-secondary)]" />
            <input
              type="text"
              placeholder="Filter tags by name or address..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded text-sm text-[var(--hmi-text-primary)] placeholder-[var(--hmi-text-muted)]"
            />
          </div>
          {!fallbackMode && newVariableCount > 0 && (
            <button
              onClick={handleCreateAll}
              className="px-3 py-1.5 bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-hover)] rounded text-xs text-white flex items-center gap-1 whitespace-nowrap"
            >
              <Plus size={12} /> Create All ({newVariableCount})
            </button>
          )}
          {!fallbackMode && (
            <button
              onClick={handleFullBrowse}
              disabled={fallbackLoading}
              className="px-3 py-1.5 bg-[var(--hmi-bg-input)] hover:bg-[var(--hmi-border-subtle)] rounded text-xs text-[var(--hmi-text-secondary)] flex items-center gap-1 whitespace-nowrap"
              title="Load entire tag tree at once (slower for large servers)"
            >
              {fallbackLoading ? <Loader2 size={12} className="animate-spin" /> : <FolderSearch size={12} />}
              Full Scan
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading && <p className="text-[var(--hmi-text-secondary)] text-sm py-4 text-center"><Loader2 size={16} className="inline animate-spin mr-2" />Loading...</p>}
          {error && <p className="text-red-400 text-sm py-4 text-center">{error}</p>}

          {!loading && !error && !fallbackMode && (
            <>
              {tree.length === 0 ? (
                <p className="text-[var(--hmi-text-muted)] text-sm py-4 text-center">No tags found on this data source</p>
              ) : visibleRows.length === 0 && filter ? (
                <p className="text-[var(--hmi-text-muted)] text-sm py-4 text-center">No matches for &ldquo;{filter}&rdquo; in loaded nodes. Try expanding more folders or use Full Scan.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--hmi-bg-elevated)] z-10">
                    <tr className="border-b border-[var(--hmi-border)] text-[var(--hmi-text-secondary)]">
                      <th className="text-left px-3 py-2 font-medium">Name</th>
                      <th className="text-left px-3 py-2 font-medium">Address</th>
                      <th className="text-left px-3 py-2 font-medium w-20">Type</th>
                      <th className="px-3 py-2 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((item) => (
                      <BrowseTreeRow
                        key={item.node.node_id}
                        item={item}
                        existingAddresses={existingAddresses}
                        createdAddresses={createdAddresses}
                        onCreateTag={handleCreate}
                        onToggle={handleToggle}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* Fallback flat list mode (full browse) */}
          {fallbackMode && (
            <>
              {fallbackTags.length === 0 ? (
                <p className="text-[var(--hmi-text-muted)] text-sm py-4 text-center">No tags found</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--hmi-bg-elevated)] z-10">
                    <tr className="border-b border-[var(--hmi-border)] text-[var(--hmi-text-secondary)]">
                      <th className="text-left px-3 py-2 font-medium">Name</th>
                      <th className="text-left px-3 py-2 font-medium">Node ID / Address</th>
                      <th className="text-left px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fallbackTags
                      .filter(t => {
                        if (!filter) return true;
                        const lower = filter.toLowerCase();
                        const name = (t.name || t.display_name || '').toLowerCase();
                        const addr = (t.relative_address || t.node_id || t.address || '').toLowerCase();
                        return name.includes(lower) || addr.includes(lower);
                      })
                      .map((t, i) => {
                        const tagAddress = t.relative_address || t.node_id || t.address || '';
                        const fullAddress = t.node_id || t.address || '';
                        const alreadyExists = existingAddresses.has(tagAddress) || existingAddresses.has(fullAddress) || createdAddresses.has(tagAddress);
                        return (
                          <tr key={i} className="border-b border-[var(--hmi-border)]/50">
                            <td className="px-3 py-2 text-[var(--hmi-text-primary)]">{t.name || t.display_name || '\u2014'}</td>
                            <td className="px-3 py-2 text-[var(--hmi-text-secondary)] font-mono text-xs">
                              {t.relative_address ? (
                                <span title={fullAddress}>{t.relative_address}</span>
                              ) : (
                                fullAddress || '\u2014'
                              )}
                            </td>
                            <td className="px-3 py-2 text-[var(--hmi-text-secondary)]">{t.data_type || '\u2014'}</td>
                            <td className="px-3 py-2 text-right">
                              {alreadyExists ? (
                                <span className="text-xs text-green-400">Exists</span>
                              ) : (
                                <button
                                  onClick={() => handleCreateFromBrowsed(t)}
                                  className="px-2 py-1 bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-hover)] rounded text-xs text-white flex items-center gap-1 ml-auto"
                                >
                                  <Plus size={12} /> Create
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--hmi-border)]">
          <span className="text-xs text-[var(--hmi-text-muted)]">
            {filter ? `${visibleRows.filter(r => r.node.node_class === 'variable').length} matching tags` : `Click folders to expand. Tags load one level at a time.`}
          </span>
          <button onClick={onClose} className="px-4 py-2 bg-[var(--hmi-bg-input)] rounded-lg text-sm text-[var(--hmi-text-secondary)]">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tags Settings Tab ───
export interface TagsSettingsProps {
  tags: Tag[];
  dataSources: DataSourceData[];
  allLabels: TagLabel[];
  tagValues: Record<string, TagValue>;
  canManage: boolean;
  loadTags: () => void;
  loadLabels: () => void;
}

export function TagsSettings({ tags, dataSources, allLabels, tagValues, canManage, loadTags, loadLabels }: TagsSettingsProps) {
  // Tag state
  const [tagSearch, setTagSearch] = useState('');
  const [tagLabelFilter, setTagLabelFilter] = useState('all');
  const [tagTypeFilter, setTagTypeFilter] = useState('all');
  const [tagSourceFilter, setTagSourceFilter] = useState<number | 'all' | 'none'>('all');
  const [tagFeatureFilter, setTagFeatureFilter] = useState('all');
  const [showAdvFilters, setShowAdvFilters] = useState(false);
  const [editTag, setEditTag] = useState<(Omit<Tag, 'id'> & { id?: number }) | null>(null);
  const [deleteTagTarget, setDeleteTagTarget] = useState<Tag | null>(null);
  const [showTagImport, setShowTagImport] = useState(false);

  // Multi-select state
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [bulkLabelDialog, setBulkLabelDialog] = useState<'add' | 'remove' | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  // Label management state
  const [editLabel, setEditLabel] = useState<{ id?: number; name: string; color: string; description: string } | null>(null);
  const [deleteLabelTarget, setDeleteLabelTarget] = useState<TagLabel | null>(null);

  const filteredTags = useMemo(() => {
    return tags.filter(t => {
      if (tagLabelFilter !== 'all') {
        const labelId = Number(tagLabelFilter);
        if (!(t.labels || []).some(l => l.id === labelId)) return false;
      }
      if (tagTypeFilter !== 'all' && t.data_type !== tagTypeFilter) return false;
      if (tagSourceFilter !== 'all') {
        if (tagSourceFilter === 'none' && t.data_source_id != null) return false;
        if (tagSourceFilter !== 'none' && t.data_source_id !== tagSourceFilter) return false;
      }
      if (tagFeatureFilter !== 'all') {
        if (tagFeatureFilter === 'trending' && !t.trending_enabled) return false;
        if (tagFeatureFilter === 'alarm' && !t.alarm_enabled) return false;
        if (tagFeatureFilter === 'simulation' && !t.simulation_enabled) return false;
        if (tagFeatureFilter === 'no_trending' && t.trending_enabled) return false;
        if (tagFeatureFilter === 'no_alarm' && t.alarm_enabled) return false;
        if (tagFeatureFilter === 'no_simulation' && t.simulation_enabled) return false;
      }
      if (tagSearch) {
        const q = tagSearch.toLowerCase();
        return t.name.toLowerCase().includes(q) ||
               (t.display_name || '').toLowerCase().includes(q) ||
               (t.address || '').toLowerCase().includes(q) ||
               (t.labels || []).some(l => l.name.toLowerCase().includes(q));
      }
      return true;
    });
  }, [tags, tagSearch, tagLabelFilter, tagTypeFilter, tagSourceFilter, tagFeatureFilter]);

  // Clear selection when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedTagIds(new Set());
  }, [tagSearch, tagLabelFilter, tagTypeFilter, tagSourceFilter, tagFeatureFilter]);

  // Data source name lookup for tag table
  const dsNameMap = useMemo(() => {
    const map = new Map<number, string>();
    dataSources.forEach(ds => map.set(ds.id, ds.name));
    return map;
  }, [dataSources]);

  // Tag handlers
  const handleSaveTag = useCallback(async (data: Omit<Tag, 'id'> & { id?: number }) => {
    try {
      const oldName = data.id != null ? editTag?.name : undefined;
      let savedTag: Tag;
      if (data.id != null) {
        savedTag = await api.updateTag(data.id, data) as Tag;
      } else {
        savedTag = await api.createTag(data) as Tag;
      }
      // Sync label assignments
      const tagId = savedTag.id ?? data.id!;
      const oldLabelIds = new Set((savedTag.labels || []).map(l => l.id));
      const newLabelIds = new Set((data.labels || []).map(l => l.id));
      for (const lid of newLabelIds) {
        if (!oldLabelIds.has(lid)) await api.assignTagLabel(tagId, lid);
      }
      for (const lid of oldLabelIds) {
        if (!newLabelIds.has(lid)) await api.removeTagLabel(tagId, lid);
      }
      // If tag was renamed, offer to update screen references
      if (oldName && oldName !== data.name) {
        const doUpdate = confirm(`Tag renamed from "${oldName}" to "${data.name}".\n\nUpdate all screen widget references to use the new name?`);
        if (doUpdate) {
          const result = await api.renameTagReferences(oldName, data.name);
          if (result.updated_screens > 0) {
            alert(`Updated references in ${result.updated_screens} screen${result.updated_screens === 1 ? '' : 's'}.`);
          }
        }
      }
      setEditTag(null);
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [loadTags, editTag]);

  const handleDeleteTag = useCallback(async () => {
    if (!deleteTagTarget) return;
    try {
      await api.deleteTag(deleteTagTarget.id);
      setDeleteTagTarget(null);
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [deleteTagTarget, loadTags]);

  // Bulk actions
  const handleBulkDelete = useCallback(async () => {
    try {
      await api.bulkDeleteTags(Array.from(selectedTagIds));
      setSelectedTagIds(new Set());
      setBulkDeleteConfirm(false);
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [selectedTagIds, loadTags]);

  const handleBulkLabels = useCallback(async (mode: 'add' | 'remove', labelIds: number[]) => {
    try {
      if (mode === 'add') {
        await api.bulkAddLabels(Array.from(selectedTagIds), labelIds);
      } else {
        await api.bulkRemoveLabels(Array.from(selectedTagIds), labelIds);
      }
      setBulkLabelDialog(null);
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [selectedTagIds, loadTags]);

  const handleBulkEdit = useCallback(async (fields: Record<string, unknown>) => {
    try {
      await api.bulkUpdateTags(Array.from(selectedTagIds), fields);
      setShowBulkEdit(false);
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [selectedTagIds, loadTags]);

  const toggleTagSelection = useCallback((id: number) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedTagIds(prev => {
      if (prev.size === filteredTags.length) return new Set();
      return new Set(filteredTags.map(t => t.id));
    });
  }, [filteredTags]);

  const formatImportResult = (result: { imported: number; updated: number; skipped: number }) => {
    const parts: string[] = [];
    if (result.imported > 0) parts.push(`${result.imported} imported`);
    if (result.updated > 0) parts.push(`${result.updated} updated`);
    if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
    return parts.join(', ') || 'No changes';
  };

  const handleCsvImport = useCallback(async (rows: Record<string, unknown>[], dataSourceId: number | null, onConflict: ImportConflictMode, updateFieldsList: string[]) => {
    try {
      const result = await api.importTagsCsv(rows as Partial<Tag>[], dataSourceId, onConflict, updateFieldsList);
      setShowTagImport(false);
      alert(formatImportResult(result));
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [loadTags]);

  const handleCodesysImport = useCallback(async (xml: string, prefix: string, names: string[], dataSourceId: number | null, onConflict: ImportConflictMode, updateFieldsList: string[]) => {
    try {
      const result = await api.importTagsCodesys(xml, prefix, names, dataSourceId, onConflict, updateFieldsList);
      setShowTagImport(false);
      alert(formatImportResult(result));
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [loadTags]);

  const handleRslogixImport = useCallback(async (csv: string, prefix: string, names: string[], dataSourceId: number | null, onConflict: ImportConflictMode, updateFieldsList: string[]) => {
    try {
      const result = await api.importTagsRslogix500(csv, prefix, names, dataSourceId, onConflict, updateFieldsList);
      setShowTagImport(false);
      alert(formatImportResult(result));
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [loadTags]);

  // Label handlers
  const handleSaveLabel = useCallback(async (data: { id?: number; name: string; color: string; description: string }) => {
    try {
      if (data.id != null) {
        await api.updateTagLabel(data.id, data);
      } else {
        await api.createTagLabel(data);
      }
      setEditLabel(null);
      loadLabels();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [loadLabels]);

  const handleDeleteLabel = useCallback(async () => {
    if (!deleteLabelTarget) return;
    try {
      await api.deleteTagLabel(deleteLabelTarget.id);
      setDeleteLabelTarget(null);
      loadLabels();
      loadTags(); // refresh tags to reflect removed labels
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [deleteLabelTarget, loadLabels, loadTags]);

  return (
    <div>
      {/* Search & Filter Bar */}
      <div className="flex gap-3 mb-2 flex-wrap items-center">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--hmi-text-muted)]" />
          <input
            type="text"
            placeholder="Search name, description, group, address, labels..."
            value={tagSearch}
            onChange={e => setTagSearch(e.target.value)}
            className="w-full bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] rounded-lg pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={tagLabelFilter}
          onChange={e => setTagLabelFilter(e.target.value)}
          className="bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] rounded-lg px-3 py-2 text-sm text-[var(--hmi-text-secondary)] outline-none"
        >
          <option value="all">All Labels</option>
          {allLabels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button
          onClick={() => setShowAdvFilters(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm ${showAdvFilters || tagTypeFilter !== 'all' || tagSourceFilter !== 'all' || tagFeatureFilter !== 'all' ? 'bg-[var(--hmi-accent-bg)] text-[var(--hmi-accent-text)] border border-[var(--hmi-accent)]/40' : 'bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-secondary)]'}`}
        >
          <Filter size={14} /> Filters
          {(tagTypeFilter !== 'all' || tagSourceFilter !== 'all' || tagFeatureFilter !== 'all') && (
            <span className="ml-1 px-1.5 py-0.5 bg-[var(--hmi-accent)] text-white text-[10px] rounded-full font-medium">
              {[tagTypeFilter, String(tagSourceFilter), tagFeatureFilter].filter(f => f !== 'all').length}
            </span>
          )}
        </button>
        <span className="self-center text-xs text-[var(--hmi-text-muted)]">{filteredTags.length} / {tags.length} tags</span>
        {canManage && (
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => api.exportTagsCsv().catch(() => alert('Export failed'))}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--hmi-bg-input)] hover:bg-[var(--hmi-border-subtle)] text-[var(--hmi-text-secondary)] rounded-lg text-sm font-medium"
            >
              <Download size={16} /> Export
            </button>
            <button
              onClick={() => setShowTagImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--hmi-bg-input)] hover:bg-[var(--hmi-border-subtle)] text-[var(--hmi-text-secondary)] rounded-lg text-sm font-medium"
            >
              <Upload size={16} /> Import
            </button>
            <button
              onClick={() => setEditTag({ ...EMPTY_TAG })}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] text-white rounded-lg text-sm font-medium"
            >
              <Plus size={16} /> New Tag
            </button>
          </div>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvFilters && (
        <div className="flex gap-3 mb-2 flex-wrap items-center bg-[var(--hmi-bg-elevated)]/50 border border-[var(--hmi-border)] rounded-lg px-3 py-2">
          <select
            value={tagTypeFilter}
            onChange={e => setTagTypeFilter(e.target.value)}
            className="bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-lg px-3 py-1.5 text-sm text-[var(--hmi-text-secondary)] outline-none"
          >
            <option value="all">All Types</option>
            <option value="bool">Bool</option>
            <option value="int">Int</option>
            <option value="float">Float</option>
            <option value="string">String</option>
          </select>
          <select
            value={String(tagSourceFilter)}
            onChange={e => {
              const v = e.target.value;
              setTagSourceFilter(v === 'all' || v === 'none' ? v : Number(v));
            }}
            className="bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-lg px-3 py-1.5 text-sm text-[var(--hmi-text-secondary)] outline-none"
          >
            <option value="all">All Sources</option>
            <option value="none">Internal</option>
            {dataSources.map(ds => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
          </select>
          <select
            value={tagFeatureFilter}
            onChange={e => setTagFeatureFilter(e.target.value)}
            className="bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-lg px-3 py-1.5 text-sm text-[var(--hmi-text-secondary)] outline-none"
          >
            <option value="all">All Features</option>
            <option value="trending">Trending</option>
            <option value="alarm">Alarming</option>
            <option value="simulation">Simulated</option>
            <option value="no_trending">Not Trending</option>
            <option value="no_alarm">Not Alarming</option>
            <option value="no_simulation">Not Simulated</option>
          </select>
          {(tagTypeFilter !== 'all' || tagSourceFilter !== 'all' || tagFeatureFilter !== 'all') && (
            <button
              onClick={() => { setTagTypeFilter('all'); setTagSourceFilter('all'); setTagFeatureFilter('all'); }}
              className="text-xs text-[var(--hmi-text-muted)] hover:text-[var(--hmi-text-secondary)]"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Bulk Action Bar */}
      {canManage && selectedTagIds.size > 0 && (
        <div className="flex items-center gap-3 mb-2 bg-[var(--hmi-accent-bg)] border border-[var(--hmi-accent)]/30 rounded-lg px-4 py-2">
          <span className="text-sm text-blue-300 font-medium">{selectedTagIds.size} selected</span>
          <div className="h-4 w-px bg-[var(--hmi-border-subtle)]" />
          <button
            onClick={() => setBulkLabelDialog('add')}
            className="text-sm text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] px-2 py-1 rounded hover:bg-[var(--hmi-bg-input)]"
          >
            Add Labels
          </button>
          <button
            onClick={() => setBulkLabelDialog('remove')}
            className="text-sm text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] px-2 py-1 rounded hover:bg-[var(--hmi-bg-input)]"
          >
            Remove Labels
          </button>
          <div className="h-4 w-px bg-[var(--hmi-border-subtle)]" />
          <button
            onClick={() => setShowBulkEdit(true)}
            className="text-sm text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] px-2 py-1 rounded hover:bg-[var(--hmi-bg-input)]"
          >
            Edit Fields
          </button>
          <div className="h-4 w-px bg-[var(--hmi-border-subtle)]" />
          <button
            onClick={() => setBulkDeleteConfirm(true)}
            className="text-sm text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/30"
          >
            Delete
          </button>
          <button
            onClick={() => setSelectedTagIds(new Set())}
            className="ml-auto text-xs text-[var(--hmi-text-muted)] hover:text-[var(--hmi-text-secondary)]"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Tag Table */}
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hmi-border)] text-[var(--hmi-text-secondary)]">
              {canManage && (
                <th className="w-10 px-3 py-3">
                  <button onClick={toggleSelectAll} className="text-[var(--hmi-text-muted)] hover:text-[var(--hmi-text-secondary)]">
                    {selectedTagIds.size === filteredTags.length && filteredTags.length > 0
                      ? <CheckSquare size={16} />
                      : selectedTagIds.size > 0
                        ? <MinusSquare size={16} />
                        : <Square size={16} />}
                  </button>
                </th>
              )}
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Value</th>
              <th className="text-left px-4 py-3 font-medium">Labels</th>
              <th className="text-left px-4 py-3 font-medium">Source</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Access</th>
              <th className="text-left px-4 py-3 font-medium">Units</th>
              <th className="text-center px-4 py-3 font-medium">Trend</th>
              <th className="text-center px-4 py-3 font-medium">Alarm</th>
              <th className="text-center px-4 py-3 font-medium">Sim</th>
              {canManage && <th className="px-4 py-3 font-medium w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {filteredTags.map((tag) => (
              <tr
                key={tag.id}
                className={`border-b border-[var(--hmi-border)]/50 hover:bg-[var(--hmi-bg-input)]/30 ${selectedTagIds.has(tag.id) ? 'bg-[var(--hmi-accent-bg)]' : ''}`}
              >
                {canManage && (
                  <td className="w-10 px-3 py-2">
                    {tag.is_system ? (
                      <span className="text-[var(--hmi-text-muted)]/30"><Square size={16} /></span>
                    ) : (
                      <button onClick={() => toggleTagSelection(tag.id)} className="text-[var(--hmi-text-muted)] hover:text-[var(--hmi-text-secondary)]">
                        {selectedTagIds.has(tag.id) ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
                      </button>
                    )}
                  </td>
                )}
                <td className="px-4 py-2">
                  <div className="text-[var(--hmi-text-primary)] font-mono text-xs">{tag.name}</div>
                  {tag.display_name && <div className="text-[10px] text-[var(--hmi-text-muted)] truncate max-w-48">{tag.display_name}</div>}
                </td>
                <td className="px-4 py-2">
                  <InlineTagValue tag={tag} tagValues={tagValues} canEdit={canManage && tag.access_mode !== 'read'} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(tag.labels || []).length > 0
                      ? tag.labels.map(l => (
                          <span key={l.id} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] text-white"
                            style={{ backgroundColor: l.color || '#3b82f6' }}>
                            {l.name}
                          </span>
                        ))
                      : <span className="text-[var(--hmi-text-muted)]">{'\u2014'}</span>}
                  </div>
                </td>
                <td className="px-4 py-2 text-[var(--hmi-text-secondary)] text-xs">
                  {tag.data_source_id ? dsNameMap.get(tag.data_source_id) || `#${tag.data_source_id}` : (tag.simulation_enabled ? 'Simulation' : 'Internal')}
                </td>
                <td className="px-4 py-2 text-[var(--hmi-text-secondary)]">{tag.data_type}</td>
                <td className="px-4 py-2 text-[var(--hmi-text-secondary)]">{tag.access_mode}</td>
                <td className="px-4 py-2 text-[var(--hmi-text-secondary)]">{tag.engineering_units || '\u2014'}</td>
                <td className="px-4 py-2 text-center">{tag.trending_enabled ? '\u2713' : ''}</td>
                <td className="px-4 py-2 text-center">{tag.alarm_enabled ? '\u2713' : ''}</td>
                <td className="px-4 py-2 text-center">{tag.simulation_enabled ? '\u2713' : ''}</td>
                {canManage && (
                  <td className="px-4 py-2">
                    <div className="flex gap-1 justify-end">
                      {tag.is_system ? (
                        <span className="text-[10px] text-amber-400/60 px-1">System</span>
                      ) : (
                        <>
                          <button onClick={() => setEditTag(tag)} className="p-1 text-[var(--hmi-text-muted)] hover:text-blue-400" title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteTagTarget(tag)} className="p-1 text-[var(--hmi-text-muted)] hover:text-red-400" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filteredTags.length === 0 && (
              <tr><td colSpan={canManage ? 12 : 11} className="px-4 py-8 text-center text-[var(--hmi-text-muted)]">No tags found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editTag && <TagDialog tag={editTag} dataSources={dataSources} allLabels={allLabels} onSave={handleSaveTag} onClose={() => setEditTag(null)} onLabelCreated={loadLabels} />}
      {deleteTagTarget && <DeleteConfirmDialog title="Delete Tag" name={deleteTagTarget.name} onConfirm={handleDeleteTag} onCancel={() => setDeleteTagTarget(null)} />}
      {showTagImport && <TagImportDialog dataSources={dataSources} existingTagNames={new Set(tags.map(t => t.name))} onImportCsv={handleCsvImport} onImportCodesys={handleCodesysImport} onImportRslogix={handleRslogixImport} onClose={() => setShowTagImport(false)} />}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setBulkDeleteConfirm(false)}>
          <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] p-6 max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-[var(--hmi-text-primary)] font-medium mb-2">Delete {selectedTagIds.size} Tags</div>
            <p className="text-sm text-[var(--hmi-text-secondary)] mb-4">Are you sure you want to delete {selectedTagIds.size} selected tags? This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBulkDeleteConfirm(false)} className="px-4 py-2 bg-[var(--hmi-bg-input)] rounded-lg text-sm text-[var(--hmi-text-secondary)]">Cancel</button>
              <button onClick={handleBulkDelete} className="px-4 py-2 bg-red-600 rounded-lg text-sm text-white hover:bg-red-700">Delete {selectedTagIds.size} Tags</button>
            </div>
          </div>
        </div>
      )}
      {bulkLabelDialog && (
        <BulkLabelDialog
          mode={bulkLabelDialog}
          tagCount={selectedTagIds.size}
          allLabels={allLabels}
          onApply={labelIds => handleBulkLabels(bulkLabelDialog, labelIds)}
          onClose={() => setBulkLabelDialog(null)}
        />
      )}
      {showBulkEdit && (
        <BulkEditDialog
          tagCount={selectedTagIds.size}
          dataSources={dataSources}
          onApply={handleBulkEdit}
          onClose={() => setShowBulkEdit(false)}
        />
      )}

      {/* Label Management */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--hmi-text-secondary)] flex items-center gap-1.5"><TagIcon size={14} /> Labels</h2>
          {canManage && (
            <button
              onClick={() => setEditLabel({ name: '', color: LABEL_COLORS[allLabels.length % LABEL_COLORS.length], description: '' })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--hmi-bg-input)] hover:bg-[var(--hmi-border-subtle)] text-[var(--hmi-text-secondary)] rounded-lg text-xs font-medium"
            >
              <Plus size={14} /> New Label
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {allLabels.map(l => (
            <div key={l.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-white"
              style={{ backgroundColor: l.color || '#3b82f6' }}>
              {l.name}
              {canManage && (
                <>
                  <button onClick={() => setEditLabel({ id: l.id, name: l.name, color: l.color || '#3b82f6', description: l.description || '' })}
                    className="hover:text-[var(--hmi-text-primary)] ml-1" title="Edit">
                    <Pencil size={10} />
                  </button>
                  <button onClick={() => setDeleteLabelTarget(l)}
                    className="hover:text-[var(--hmi-text-primary)]" title="Delete">
                    <Trash2 size={10} />
                  </button>
                </>
              )}
            </div>
          ))}
          {allLabels.length === 0 && <span className="text-[var(--hmi-text-muted)] text-xs">No labels defined yet</span>}
        </div>
      </div>

      {/* Label Edit Dialog */}
      {editLabel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditLabel(null)}>
          <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--hmi-text-primary)]">{editLabel.id != null ? 'Edit Label' : 'New Label'}</h2>
              <button onClick={() => setEditLabel(null)} className="text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <Field label="Name *">
                <input value={editLabel.name} onChange={e => setEditLabel(l => l ? { ...l, name: e.target.value } : l)} className={inputCls} placeholder="e.g. Process" />
              </Field>
              <Field label="Color">
                <div className="flex items-center gap-2">
                  <input type="color" value={editLabel.color} onChange={e => setEditLabel(l => l ? { ...l, color: e.target.value } : l)}
                    className="w-8 h-8 rounded border border-[var(--hmi-border-subtle)] cursor-pointer bg-transparent" />
                  <div className="flex gap-1">
                    {LABEL_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setEditLabel(l => l ? { ...l, color: c } : l)}
                        className={`w-5 h-5 rounded-full border-2 ${editLabel.color === c ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </Field>
              <Field label="Description">
                <input value={editLabel.description} onChange={e => setEditLabel(l => l ? { ...l, description: e.target.value } : l)} className={inputCls} />
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditLabel(null)} className="px-4 py-2 bg-[var(--hmi-bg-input)] rounded-lg text-sm text-[var(--hmi-text-secondary)] hover:bg-[var(--hmi-border-subtle)]">Cancel</button>
                <button onClick={() => editLabel.name.trim() && handleSaveLabel(editLabel)} className="px-4 py-2 bg-[var(--hmi-accent)] rounded-lg text-sm text-white hover:bg-[var(--hmi-accent-dark)]">
                  {editLabel.id != null ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {deleteLabelTarget && <DeleteConfirmDialog title="Delete Label" name={deleteLabelTarget.name} onConfirm={handleDeleteLabel} onCancel={() => setDeleteLabelTarget(null)} />}
    </div>
  );
}
