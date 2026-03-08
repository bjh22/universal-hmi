import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Search, Download, UserPlus, Plus, Pencil, Trash2, Upload, X, Plug, Unplug, FolderSearch, Tag as TagIcon, CheckSquare, Square, MinusSquare, Filter } from 'lucide-react';
import { api } from '../lib/api';
import { PROTOCOL_CONFIGS } from '../lib/protocolConfigs';
import { IntegrationsTab } from '../components/settings/IntegrationsTab';
import type { Tag, TagLabel, DataSourceData, ProtocolType, AuditEntry, UserData, BrowsedTag, UserListEntry, ImportPreviewTag, TagValue } from '../types';

interface Props {
  user: UserData | null;
  tagValues: Record<string, TagValue>;
}

const EMPTY_TAG: Omit<Tag, 'id'> = {
  name: '',
  description: null,
  long_description: null,
  data_source_id: null,
  address: null,
  data_type: 'float',
  access_mode: 'read_write',
  engineering_units: null,
  display_format: null,
  min_value: null,
  max_value: null,
  deadband: null,
  trending_enabled: false,
  trending_sample_rate_ms: null,
  alarm_enabled: false,
  alarm_config: null,
  simulation_enabled: false,
  simulation_behavior: null,
  simulation_config: null,
  enum_mapping: null,
  labels: [],
};

const LABEL_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
];

const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      {children}
    </div>
  );
}

// ─── Generic Delete Confirmation ───
function DeleteConfirmDialog({ title, name, onConfirm, onCancel }: {
  title: string;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="text-slate-100 font-medium mb-2">{title}</div>
        <p className="text-sm text-slate-400 mb-4">Are you sure you want to delete <span className="text-slate-200 font-mono">{name}</span>? This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 bg-slate-700 rounded-lg text-sm text-slate-300">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 rounded-lg text-sm text-white hover:bg-red-700">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Data Source Dialog ───
function DataSourceDialog({ ds, onSave, onClose }: {
  ds: { id?: number; name: string; protocol: ProtocolType; enabled: boolean; config: Record<string, unknown> };
  onSave: (data: { id?: number; name: string; protocol: ProtocolType; enabled: boolean; config: Record<string, unknown> }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(ds);
  const protoFields = PROTOCOL_CONFIGS[form.protocol]?.fields || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">{form.id != null ? 'Edit Data Source' : 'New Data Source'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Name *">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className={inputCls} placeholder="e.g. PLC-01" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Protocol *">
              <select
                value={form.protocol}
                onChange={e => setForm(f => ({ ...f, protocol: e.target.value as ProtocolType, config: {} }))}
                className={inputCls}
              >
                {Object.entries(PROTOCOL_CONFIGS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Enabled">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer pt-2">
                <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} className="accent-blue-500" />
                {form.enabled ? 'Yes' : 'No'}
              </label>
            </Field>
          </div>

          {protoFields.length > 0 && (
            <fieldset className="border border-slate-700 rounded-lg p-3">
              <legend className="text-xs text-slate-400 px-2">Connection Settings</legend>
              <div className="space-y-3">
                {protoFields.map(f => (
                  <Field key={f.key} label={f.label}>
                    <input
                      type={f.type}
                      value={(form.config[f.key] as string) ?? ''}
                      onChange={e => setForm(prev => ({
                        ...prev,
                        config: { ...prev.config, [f.key]: f.type === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value },
                      }))}
                      className={inputCls}
                      placeholder={f.placeholder}
                    />
                  </Field>
                ))}
              </div>
            </fieldset>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-600">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 rounded-lg text-sm text-white hover:bg-blue-700">{form.id != null ? 'Save' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Enum Mapping Editor ───
function EnumMappingEditor({ mapping, onChange }: {
  mapping: Record<string, string> | null;
  onChange: (m: Record<string, string> | null) => void;
}) {
  const entries = useMemo(() => {
    if (!mapping) return [];
    return Object.entries(mapping)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([k, v]) => ({ key: k, label: v }));
  }, [mapping]);

  const update = useCallback((newEntries: { key: string; label: string }[]) => {
    if (newEntries.length === 0) {
      onChange(null);
      return;
    }
    const m: Record<string, string> = {};
    for (const e of newEntries) {
      if (e.key.trim()) m[e.key.trim()] = e.label;
    }
    onChange(Object.keys(m).length > 0 ? m : null);
  }, [onChange]);

  const addEntry = useCallback(() => {
    const nextKey = entries.length > 0 ? String(Math.max(...entries.map(e => Number(e.key) || 0)) + 1) : '0';
    update([...entries, { key: nextKey, label: '' }]);
  }, [entries, update]);

  const removeEntry = useCallback((idx: number) => {
    update(entries.filter((_, i) => i !== idx));
  }, [entries, update]);

  const updateEntry = useCallback((idx: number, field: 'key' | 'label', value: string) => {
    update(entries.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  }, [entries, update]);

  return (
    <div className="space-y-1.5">
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-1 items-center">
          <input
            type="number"
            value={entry.key}
            onChange={e => updateEntry(i, 'key', e.target.value)}
            placeholder="Value"
            className="w-16 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white"
          />
          <span className="text-slate-500 text-xs">=</span>
          <input
            type="text"
            value={entry.label}
            onChange={e => updateEntry(i, 'label', e.target.value)}
            placeholder="Label"
            className="flex-1 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white"
          />
          <button type="button" onClick={() => removeEntry(i)} className="text-red-400 hover:text-red-300 text-xs px-1">&times;</button>
        </div>
      ))}
      <button type="button" onClick={addEntry} className="text-xs text-blue-400 hover:text-blue-300">+ Add value</button>
    </div>
  );
}

// ─── Tag Edit Dialog ───
function TagDialog({ tag, dataSources, allLabels, onSave, onClose }: {
  tag: Omit<Tag, 'id'> & { id?: number };
  dataSources: DataSourceData[];
  allLabels: TagLabel[];
  onSave: (data: Omit<Tag, 'id'> & { id?: number }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(tag);
  const set = useCallback(<K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v })), []);
  const [labelSearch, setLabelSearch] = useState('');
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);

  const selectedLabelIds = new Set((form.labels || []).map(l => l.id));
  const filteredLabels = allLabels.filter(l =>
    !selectedLabelIds.has(l.id) && l.name.toLowerCase().includes(labelSearch.toLowerCase())
  );

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
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">{form.id != null ? 'Edit Tag' : 'New Tag'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Identity */}
          <Field label="Name *">
            <input value={form.name} onChange={e => set('name', e.target.value)} required className={inputCls} placeholder="e.g. Tank1.Level" />
          </Field>
          <Field label="Labels">
            <div ref={labelRef} className="relative">
              <div className="flex flex-wrap gap-1.5 min-h-[38px] w-full bg-slate-700 border border-slate-600 rounded-md px-2 py-1.5 cursor-text"
                onClick={() => setShowLabelDropdown(true)}>
                {(form.labels || []).map(l => (
                  <span key={l.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white"
                    style={{ backgroundColor: l.color || '#3b82f6' }}>
                    {l.name}
                    <button type="button" onClick={e => { e.stopPropagation(); toggleLabel(l); }}
                      className="hover:text-slate-200 ml-0.5">&times;</button>
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
              {showLabelDropdown && filteredLabels.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-slate-700 border border-slate-600 rounded-md shadow-lg max-h-40 overflow-y-auto">
                  {filteredLabels.map(l => (
                    <button key={l.id} type="button"
                      onClick={() => { toggleLabel(l); setShowLabelDropdown(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: l.color || '#3b82f6' }} />
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
          <Field label="Display Name">
            <input value={form.description || ''} onChange={e => set('description', e.target.value || null)} className={inputCls} placeholder="Friendly name shown to operators instead of the tag name" />
          </Field>
          <Field label="Description">
            <textarea
              value={form.long_description || ''}
              onChange={e => set('long_description', e.target.value || null)}
              className={inputCls}
              rows={3}
              placeholder="Detailed description shown to operators via the info button on widgets"
            />
          </Field>

          {/* Data source & address */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data Source">
              <select
                value={form.data_source_id ?? ''}
                onChange={e => set('data_source_id', e.target.value ? Number(e.target.value) : null)}
                className={inputCls}
              >
                <option value="">None (simulation)</option>
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
          <div className="grid grid-cols-3 gap-3">
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
            <Field label="Units">
              <input value={form.engineering_units || ''} onChange={e => set('engineering_units', e.target.value || null)} className={inputCls} placeholder="e.g. \u00b0C" />
            </Field>
          </div>

          {/* Range & deadband */}
          <div className="grid grid-cols-4 gap-3">
            <Field label="Min Value">
              <input type="number" value={form.min_value ?? ''} onChange={e => set('min_value', e.target.value ? Number(e.target.value) : null)} className={inputCls} />
            </Field>
            <Field label="Max Value">
              <input type="number" value={form.max_value ?? ''} onChange={e => set('max_value', e.target.value ? Number(e.target.value) : null)} className={inputCls} />
            </Field>
            <Field label="Deadband">
              <input type="number" value={form.deadband ?? ''} onChange={e => set('deadband', e.target.value ? Number(e.target.value) : null)} className={inputCls} step="0.1" />
            </Field>
            <Field label="Display Format">
              <input value={form.display_format || ''} onChange={e => set('display_format', e.target.value || null)} className={inputCls} placeholder="e.g. 0.00" />
            </Field>
          </div>

          {/* Trending */}
          <fieldset className="border border-slate-700 rounded-lg p-3">
            <legend className="text-xs text-slate-400 px-2">Trending</legend>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={form.trending_enabled} onChange={e => set('trending_enabled', e.target.checked)} className="accent-blue-500" />
                Enabled
              </label>
              <Field label="Sample Rate (ms)">
                <input type="number" value={form.trending_sample_rate_ms ?? ''} onChange={e => set('trending_sample_rate_ms', e.target.value ? Number(e.target.value) : null)} className={inputCls + ' w-28'} min={100} step={100} />
              </Field>
            </div>
          </fieldset>

          {/* Alarm */}
          <fieldset className="border border-slate-700 rounded-lg p-3">
            <legend className="text-xs text-slate-400 px-2">Alarm</legend>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={form.alarm_enabled} onChange={e => set('alarm_enabled', e.target.checked)} className="accent-blue-500" />
              Enabled
            </label>
          </fieldset>

          {/* Simulation */}
          <fieldset className="border border-slate-700 rounded-lg p-3">
            <legend className="text-xs text-slate-400 px-2">Simulation</legend>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
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
            <fieldset className="border border-slate-700 rounded-lg p-3">
              <legend className="text-xs text-slate-400 px-2">Enum Mapping</legend>
              <p className="text-xs text-slate-500 mb-2">Map integer values to display labels (e.g. 0=Stopped, 1=Running)</p>
              <EnumMappingEditor
                mapping={form.enum_mapping}
                onChange={m => set('enum_mapping', m)}
              />
            </fieldset>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-600">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 rounded-lg text-sm text-white hover:bg-blue-700">{form.id != null ? 'Save' : 'Create'}</button>
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
    data_type:           { enabled: false, value: 'float' },
    access_mode:         { enabled: false, value: 'read_write' },
    engineering_units:   { enabled: false, value: '' },
    data_source_id:      { enabled: false, value: null },
    trending_enabled:    { enabled: false, value: false },
    alarm_enabled:       { enabled: false, value: false },
    simulation_enabled:  { enabled: false, value: false },
    simulation_behavior: { enabled: false, value: null },
  });

  const toggle = useCallback((key: string) =>
    setFields(f => ({ ...f, [key]: { ...f[key], enabled: !f[key].enabled } })), []);
  const setValue = useCallback((key: string, value: unknown) =>
    setFields(f => ({ ...f, [key]: { ...f[key], value } })), []);

  const handleApply = useCallback(() => {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v.enabled) patch[k] = v.value;
    }
    if (Object.keys(patch).length > 0) onApply(patch);
    else onClose();
  }, [fields, onApply, onClose]);

  const enabledCount = Object.values(fields).filter(f => f.enabled).length;

  const rowCls = 'flex items-center gap-3 py-2 border-b border-slate-700/50';
  const checkCls = 'text-slate-500 hover:text-slate-300 flex-shrink-0';
  const labelCls = 'text-sm text-slate-400 w-36 flex-shrink-0';
  const ctrlCls = 'flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white outline-none disabled:opacity-40';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-slate-100">Edit Fields</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
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
              <option value="">None (simulation)</option>
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
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox"
                  checked={fields[key].value as boolean}
                  onChange={e => setValue(key, e.target.checked)}
                  disabled={!fields[key].enabled}
                  className="accent-blue-500 disabled:opacity-40" />
                {(fields[key].value as boolean) ? 'Enabled' : 'Disabled'}
              </label>
            </div>
          ))}

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
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-600">Cancel</button>
          <button
            onClick={handleApply}
            disabled={enabledCount === 0}
            className="px-4 py-2 bg-blue-600 rounded-lg text-sm text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
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
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">
            {mode === 'add' ? 'Add' : 'Remove'} Labels
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <p className="text-sm text-slate-400 mb-3">
          {mode === 'add' ? 'Add labels to' : 'Remove labels from'} {tagCount} selected tag{tagCount !== 1 ? 's' : ''}
        </p>
        <div className="space-y-1 max-h-60 overflow-y-auto mb-4">
          {allLabels.map(l => (
            <button
              key={l.id}
              onClick={() => toggleLabel(l.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${selected.has(l.id) ? 'bg-blue-600/20 border border-blue-500/40' : 'hover:bg-slate-700 border border-transparent'}`}
            >
              {selected.has(l.id)
                ? <CheckSquare size={16} className="text-blue-400 flex-shrink-0" />
                : <Square size={16} className="text-slate-500 flex-shrink-0" />}
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: l.color || '#3b82f6' }} />
              <span className="text-slate-200">{l.name}</span>
              {l.description && <span className="text-slate-500 text-xs ml-auto truncate max-w-32">{l.description}</span>}
            </button>
          ))}
          {allLabels.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No labels created yet</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-600">Cancel</button>
          <button
            onClick={() => onApply(Array.from(selected))}
            disabled={selected.size === 0}
            className="px-4 py-2 bg-blue-600 rounded-lg text-sm text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
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

function TagImportDialog({ onImportCsv, onImportCodesys, onImportRslogix, onClose }: {
  onImportCsv: (tags: Record<string, unknown>[]) => void;
  onImportCodesys: (xml: string, prefix: string, names: string[]) => void;
  onImportRslogix: (csv: string, prefix: string, names: string[]) => void;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ImportFormat>('hmi_csv');
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
        setSelectedNames(new Set(result.tags.map(t => t.name)));
      } else if (fmt === 'rslogix500') {
        const result = await api.previewRslogix500Import(content, pfx);
        setPreviewTags(result.tags);
        setPreviewGroups(result.groups);
        setPreviewEnumCount(0);
        setSelectedNames(new Set(result.tags.map(t => t.name)));
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
      setPreviewTags([]);
      setPreviewGroups({});
      setSelectedNames(new Set());
    } finally {
      setPreviewLoading(false);
    }
  }, []);

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
        setSelectedNames(new Set(parsed.map((r, i) => r.name || String(i))));
      } else {
        setRawContent(text);
        loadPreview(text, format, prefix);
      }
    };
    reader.readAsText(file);
  }, [format, prefix, loadPreview]);

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
    if (format === 'hmi_csv') {
      const selected = rows.filter((r, i) => selectedNames.has(r.name || String(i)));
      onImportCsv(selected);
    } else if (format === 'codesys_xml') {
      onImportCodesys(rawContent, prefix, names);
    } else if (format === 'rslogix500') {
      onImportRslogix(rawContent, prefix, names);
    }
  }, [format, rows, rawContent, prefix, selectedNames, onImportCsv, onImportCodesys, onImportRslogix]);

  const hasData = format === 'hmi_csv' ? rows.length > 0 : previewTags.length > 0;
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
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-4xl max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Import Tags</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        {/* Format selector */}
        <div className="flex gap-2 mb-4">
          {(Object.keys(formatInfo) as ImportFormat[]).map(f => (
            <button
              key={f}
              onClick={() => handleFormatChange(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${format === f ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              {formatInfo[f].label}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <p className="text-xs text-slate-400 mb-2">{formatInfo[format].desc}</p>
          <input ref={fileRef} type="file" accept={fileAccept} onChange={handleFile} className="text-sm text-slate-300" />
        </div>

        {/* Optional prefix for PLC imports */}
        {format !== 'hmi_csv' && (
          <div className="mb-4">
            <label className="block text-xs text-slate-400 mb-1">Tag name prefix (optional)</label>
            <input
              type="text"
              value={prefix}
              onChange={e => handlePrefixChange(e.target.value)}
              placeholder="e.g. PLC1"
              className="w-48 px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200"
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
              <span className="text-sm text-slate-400">{selectedCount} of {totalCount} selected</span>
            </div>
            <div className="max-h-60 overflow-auto mb-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
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
                  {rows.slice(0, 50).map((row, i) => {
                    const key = row.name || String(i);
                    const checked = selectedNames.has(key);
                    return (
                      <tr key={i} className={`border-b border-slate-700/50 cursor-pointer ${checked ? '' : 'opacity-50'}`} onClick={() => toggleTagSelection(key)}>
                        <td className="px-2 py-1" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={checked} onChange={() => toggleTagSelection(key)} className="accent-blue-600" />
                        </td>
                        {headers.map(h => <td key={h} className="px-2 py-1 text-slate-300 truncate max-w-32">{row[h]}</td>)}
                      </tr>
                    );
                  })}
                  {rows.length > 50 && (
                    <tr><td colSpan={headers.length + 1} className="px-2 py-1 text-slate-500 text-center">...and {rows.length - 50} more</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* PLC import preview */}
        {format !== 'hmi_csv' && previewLoading && (
          <div className="text-sm text-slate-400 mb-4">Analyzing file...</div>
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
              <span className="text-slate-400">{selectedCount} of {totalCount} selected</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">{Object.keys(previewGroups).length} groups</span>
              {previewEnumCount > 0 && (
                <>
                  <span className="text-slate-500">|</span>
                  <span className="text-amber-400">{previewEnumCount} enum tags</span>
                </>
              )}
            </div>

            {/* Grouped tree view */}
            <div className="max-h-72 overflow-auto mb-4 border border-slate-700 rounded-lg">
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
                      <div className="w-full flex items-center gap-2 px-3 py-1.5 bg-slate-750 hover:bg-slate-700 border-b border-slate-700">
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
                          <span className="text-sm text-slate-200 font-medium">
                            <span className="text-slate-500 mr-1">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                            {group}
                          </span>
                          <span className="text-xs text-slate-500">{groupSelectedCount} / {groupTags.length} selected</span>
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="bg-slate-900">
                          {groupTags.slice(0, 100).map((tag, i) => {
                            const checked = selectedNames.has(tag.name);
                            return (
                              <div
                                key={i}
                                className={`flex items-center gap-2 px-4 py-1 border-b border-slate-800 text-xs cursor-pointer ${checked ? '' : 'opacity-50'}`}
                                onClick={() => toggleTagSelection(tag.name)}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleTagSelection(tag.name)}
                                  onClick={e => e.stopPropagation()}
                                  className="accent-blue-600"
                                />
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${typeBadgeColor[tag.data_type] || 'bg-slate-600'}`}>
                                  {tag.data_type}
                                </span>
                                {tag.has_enum && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-300 bg-amber-900/40">enum</span>
                                )}
                                <span className="text-slate-300 font-mono truncate flex-1">{tag.name}</span>
                                {tag.description && (
                                  <span className="text-slate-500 truncate max-w-48">{tag.description}</span>
                                )}
                              </div>
                            );
                          })}
                          {groupTags.length > 100 && (
                            <div className="px-4 py-1 text-xs text-slate-500">...and {groupTags.length - 100} more</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )}

        {hasData && (
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-slate-700 rounded-lg text-sm text-slate-300">Cancel</button>
            <button
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="px-4 py-2 bg-blue-600 rounded-lg text-sm text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

function BrowseTagsDialog({ dsId, dsName, existingTags, onCreateTag, onClose }: {
  dsId: number;
  dsName: string;
  existingTags: Tag[];
  onCreateTag: (tag: Omit<Tag, 'id'>) => void;
  onClose: () => void;
}) {
  const [browsedTags, setBrowsedTags] = useState<BrowsedTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createdAddresses, setCreatedAddresses] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    api.browseDataSource(dsId)
      .then(r => { if (!cancelled) { setBrowsedTags(r.tags || []); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [dsId]);

  const existingAddresses = useMemo(() => {
    const set = new Set<string>();
    existingTags.forEach(t => {
      if (t.data_source_id === dsId && t.address) set.add(t.address);
    });
    return set;
  }, [existingTags, dsId]);

  const handleCreate = useCallback((t: BrowsedTag) => {
    // Prefer relative_address (prefix-stripped) so tags work across machines
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-3xl max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Browse Tags: {dsName}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        {loading && <p className="text-slate-400 text-sm py-4 text-center">Browsing data source...</p>}
        {error && <p className="text-red-400 text-sm py-4 text-center">{error}</p>}
        {!loading && !error && browsedTags.length === 0 && (
          <p className="text-slate-500 text-sm py-4 text-center">No tags found on this data source</p>
        )}
        {browsedTags.length > 0 && (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Node ID / Address</th>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium w-28"></th>
                </tr>
              </thead>
              <tbody>
                {browsedTags.map((t, i) => {
                  const tagAddress = t.relative_address || t.node_id || t.address || '';
                  const fullAddress = t.node_id || t.address || '';
                  const alreadyExists = existingAddresses.has(tagAddress) || existingAddresses.has(fullAddress) || createdAddresses.has(tagAddress);
                  return (
                    <tr key={i} className="border-b border-slate-700/50">
                      <td className="px-3 py-2 text-slate-200">{t.name || t.display_name || '\u2014'}</td>
                      <td className="px-3 py-2 text-slate-400 font-mono text-xs">
                        {t.relative_address ? (
                          <span title={fullAddress}>{t.relative_address}</span>
                        ) : (
                          fullAddress || '\u2014'
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{t.data_type || '\u2014'}</td>
                      <td className="px-3 py-2 text-right">
                        {alreadyExists ? (
                          <span className="text-xs text-green-400">Exists</span>
                        ) : (
                          <button
                            onClick={() => handleCreate(t)}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white flex items-center gap-1 ml-auto"
                          >
                            <Plus size={12} /> Create Tag
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 rounded-lg text-sm text-slate-300">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main SettingsPage ───
export function SettingsPage({ user, tagValues }: Props) {
  const [tab, setTab] = useState<'tags' | 'datasources' | 'integrations' | 'users' | 'audit'>('tags');
  const [tags, setTags] = useState<Tag[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceData[]>([]);
  const [users, setUsers] = useState<UserListEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  // Tag state
  const [tagSearch, setTagSearch] = useState('');
  const [tagLabelFilter, setTagLabelFilter] = useState('all');
  const [tagTypeFilter, setTagTypeFilter] = useState('all');
  const [tagSourceFilter, setTagSourceFilter] = useState<number | 'all' | 'none'>('all');
  const [showAdvFilters, setShowAdvFilters] = useState(false);
  const [allLabels, setAllLabels] = useState<TagLabel[]>([]);
  const [editTag, setEditTag] = useState<(Omit<Tag, 'id'> & { id?: number }) | null>(null);
  const [deleteTagTarget, setDeleteTagTarget] = useState<Tag | null>(null);
  const [showTagImport, setShowTagImport] = useState(false);
  const [editLabel, setEditLabel] = useState<{ id?: number; name: string; color: string; description: string } | null>(null);
  const [deleteLabelTarget, setDeleteLabelTarget] = useState<TagLabel | null>(null);

  // Multi-select state
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [bulkLabelDialog, setBulkLabelDialog] = useState<'add' | 'remove' | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  // Data source state
  const [editDs, setEditDs] = useState<{ id?: number; name: string; protocol: ProtocolType; enabled: boolean; config: Record<string, unknown> } | null>(null);
  const [deleteDsTarget, setDeleteDsTarget] = useState<DataSourceData | null>(null);
  const [browseDs, setBrowseDs] = useState<DataSourceData | null>(null);
  const [connectingId, setConnectingId] = useState<number | null>(null);

  // Audit filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');

  // User create
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', display_name: '', password: '', role: 'operator', login_mode: 'password' });

  const canManage = ['engineer', 'designer'].includes(user?.role || '');

  const loadTags = useCallback(() => { api.getTags().then(setTags).catch(() => {}); }, []);
  const loadLabels = useCallback(() => { api.getTagLabels().then(setAllLabels).catch(() => {}); }, []);
  const loadDataSources = useCallback(() => { api.getDataSources().then(setDataSources).catch(() => {}); }, []);

  useEffect(() => {
    // Always load data sources so tag dialog can use them
    loadDataSources();
  }, [loadDataSources]);

  useEffect(() => {
    switch (tab) {
      case 'tags': loadTags(); loadLabels(); break;
      case 'datasources': loadDataSources(); loadTags(); break;
      case 'users': api.getUsers().then(setUsers).catch(() => {}); break;
      case 'audit': api.getAuditLog(500).then(setAuditLog).catch(() => {}); break;
    }
  }, [tab, loadTags, loadLabels, loadDataSources]);

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
      if (tagSearch) {
        const q = tagSearch.toLowerCase();
        return t.name.toLowerCase().includes(q) ||
               (t.description || '').toLowerCase().includes(q) ||
               (t.address || '').toLowerCase().includes(q) ||
               (t.labels || []).some(l => l.name.toLowerCase().includes(q));
      }
      return true;
    });
  }, [tags, tagSearch, tagLabelFilter, tagTypeFilter, tagSourceFilter]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedTagIds(new Set());
  }, [tagSearch, tagLabelFilter, tagTypeFilter, tagSourceFilter]);

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

  const handleCsvImport = useCallback(async (rows: Record<string, unknown>[]) => {
    try {
      const result = await api.importTagsCsv(rows);
      setShowTagImport(false);
      alert(`Imported ${result.imported} tags`);
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [loadTags]);

  const handleCodesysImport = useCallback(async (xml: string, prefix: string, names: string[]) => {
    try {
      const result = await api.importTagsCodesys(xml, prefix, names);
      setShowTagImport(false);
      alert(`Imported ${result.imported} tags from CODESYS`);
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [loadTags]);

  const handleRslogixImport = useCallback(async (csv: string, prefix: string, names: string[]) => {
    try {
      const result = await api.importTagsRslogix500(csv, prefix, names);
      setShowTagImport(false);
      alert(`Imported ${result.imported} tags from RSLogix 500`);
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

  // Data source handlers
  const handleSaveDs = useCallback(async (data: { id?: number; name: string; protocol: ProtocolType; enabled: boolean; config: Record<string, unknown> }) => {
    try {
      if (data.id != null) {
        await api.updateDataSource(data.id, data);
      } else {
        await api.createDataSource(data);
      }
      setEditDs(null);
      loadDataSources();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [loadDataSources]);

  const handleDeleteDs = useCallback(async () => {
    if (!deleteDsTarget) return;
    try {
      await api.deleteDataSource(deleteDsTarget.id);
      setDeleteDsTarget(null);
      loadDataSources();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [deleteDsTarget, loadDataSources]);

  const handleConnect = useCallback(async (ds: DataSourceData) => {
    setConnectingId(ds.id);
    try {
      await api.connectDataSource(ds.id);
      loadDataSources();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setConnectingId(null);
    }
  }, [loadDataSources]);

  // Data source name lookup for tag table
  const dsNameMap = useMemo(() => {
    const map = new Map<number, string>();
    dataSources.forEach(ds => map.set(ds.id, ds.name));
    return map;
  }, [dataSources]);

  const auditActions = useMemo(() => {
    const actions = new Set(auditLog.map(e => e.action));
    return Array.from(actions).sort();
  }, [auditLog]);

  const filteredAudit = useMemo(() => {
    return auditLog.filter(e => {
      if (auditActionFilter !== 'all' && e.action !== auditActionFilter) return false;
      if (auditSearch) {
        const q = auditSearch.toLowerCase();
        return (e.user || '').toLowerCase().includes(q) ||
               e.action.toLowerCase().includes(q) ||
               (e.details || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [auditLog, auditSearch, auditActionFilter]);

  const handleCreateUser = async () => {
    if (!newUser.username.trim()) return;
    try {
      await api.createUser(newUser);
      setShowCreateUser(false);
      setNewUser({ username: '', display_name: '', password: '', role: 'operator', login_mode: 'password' });
      api.getUsers().then(setUsers).catch(() => {});
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const exportAuditCsv = () => {
    const header = 'Timestamp,User,Action,Details,Source IP';
    const rows = filteredAudit.map(e =>
      [e.timestamp, e.user || '', e.action, `"${(e.details || '').replace(/"/g, '""')}"`, e.source_ip || ''].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tabList = [
    { key: 'tags' as const, label: 'Tags' },
    { key: 'datasources' as const, label: 'Data Sources' },
    { key: 'integrations' as const, label: 'Integrations' },
    { key: 'users' as const, label: 'Users' },
    { key: 'audit' as const, label: 'Audit Trail' },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-100 mb-4">Settings</h1>

      <div className="flex gap-1 mb-4">
        {tabList.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Tags ═══ */}
      {tab === 'tags' && (
        <div>
          {/* Search & Filter Bar */}
          <div className="flex gap-3 mb-2 flex-wrap items-center">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search name, description, group, address, labels..."
                value={tagSearch}
                onChange={e => setTagSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>
            <select
              value={tagLabelFilter}
              onChange={e => setTagLabelFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none"
            >
              <option value="all">All Labels</option>
              {allLabels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button
              onClick={() => setShowAdvFilters(f => !f)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm ${showAdvFilters || tagTypeFilter !== 'all' || tagSourceFilter !== 'all' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40' : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-300'}`}
            >
              <Filter size={14} /> Filters
              {(tagTypeFilter !== 'all' || tagSourceFilter !== 'all') && (
                <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-[10px] rounded-full font-medium">
                  {[tagTypeFilter, String(tagSourceFilter)].filter(f => f !== 'all').length}
                </span>
              )}
            </button>
            <span className="self-center text-xs text-slate-500">{filteredTags.length} / {tags.length} tags</span>
            {canManage && (
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => setShowTagImport(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium"
                >
                  <Upload size={16} /> Import
                </button>
                <button
                  onClick={() => setEditTag({ ...EMPTY_TAG })}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                >
                  <Plus size={16} /> New Tag
                </button>
              </div>
            )}
          </div>

          {/* Advanced Filters */}
          {showAdvFilters && (
            <div className="flex gap-3 mb-2 flex-wrap items-center bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2">
              <select
                value={tagTypeFilter}
                onChange={e => setTagTypeFilter(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-300 outline-none"
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
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-300 outline-none"
              >
                <option value="all">All Sources</option>
                <option value="none">Simulation</option>
                {dataSources.map(ds => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
              </select>
              {(tagTypeFilter !== 'all' || tagSourceFilter !== 'all') && (
                <button
                  onClick={() => { setTagTypeFilter('all'); setTagSourceFilter('all'); }}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Bulk Action Bar */}
          {canManage && selectedTagIds.size > 0 && (
            <div className="flex items-center gap-3 mb-2 bg-blue-600/10 border border-blue-500/30 rounded-lg px-4 py-2">
              <span className="text-sm text-blue-300 font-medium">{selectedTagIds.size} selected</span>
              <div className="h-4 w-px bg-slate-600" />
              <button
                onClick={() => setBulkLabelDialog('add')}
                className="text-sm text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700"
              >
                Add Labels
              </button>
              <button
                onClick={() => setBulkLabelDialog('remove')}
                className="text-sm text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700"
              >
                Remove Labels
              </button>
              <div className="h-4 w-px bg-slate-600" />
              <button
                onClick={() => setShowBulkEdit(true)}
                className="text-sm text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700"
              >
                Edit Fields
              </button>
              <div className="h-4 w-px bg-slate-600" />
              <button
                onClick={() => setBulkDeleteConfirm(true)}
                className="text-sm text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/30"
              >
                Delete
              </button>
              <button
                onClick={() => setSelectedTagIds(new Set())}
                className="ml-auto text-xs text-slate-500 hover:text-slate-300"
              >
                Clear selection
              </button>
            </div>
          )}

          {/* Tag Table */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  {canManage && (
                    <th className="w-10 px-3 py-3">
                      <button onClick={toggleSelectAll} className="text-slate-500 hover:text-slate-300">
                        {selectedTagIds.size === filteredTags.length && filteredTags.length > 0
                          ? <CheckSquare size={16} />
                          : selectedTagIds.size > 0
                            ? <MinusSquare size={16} />
                            : <Square size={16} />}
                      </button>
                    </th>
                  )}
                  <th className="text-left px-4 py-3 font-medium">Name</th>
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
                    className={`border-b border-slate-700/50 hover:bg-slate-700/30 ${selectedTagIds.has(tag.id) ? 'bg-blue-600/10' : ''}`}
                  >
                    {canManage && (
                      <td className="w-10 px-3 py-2">
                        <button onClick={() => toggleTagSelection(tag.id)} className="text-slate-500 hover:text-slate-300">
                          {selectedTagIds.has(tag.id) ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <div className="text-slate-200">{tag.description || tag.name}</div>
                      {tag.description && <div className="text-[10px] text-slate-500 font-mono truncate max-w-48">{tag.name}</div>}
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
                          : <span className="text-slate-500">{'\u2014'}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-slate-400 text-xs">
                      {tag.data_source_id ? dsNameMap.get(tag.data_source_id) || `#${tag.data_source_id}` : '\u2014'}
                    </td>
                    <td className="px-4 py-2 text-slate-400">{tag.data_type}</td>
                    <td className="px-4 py-2 text-slate-400">{tag.access_mode}</td>
                    <td className="px-4 py-2 text-slate-400">{tag.engineering_units || '\u2014'}</td>
                    <td className="px-4 py-2 text-center">{tag.trending_enabled ? '\u2713' : ''}</td>
                    <td className="px-4 py-2 text-center">{tag.alarm_enabled ? '\u2713' : ''}</td>
                    <td className="px-4 py-2 text-center">{tag.simulation_enabled ? '\u2713' : ''}</td>
                    {canManage && (
                      <td className="px-4 py-2">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setEditTag(tag)} className="p-1 text-slate-500 hover:text-blue-400" title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteTagTarget(tag)} className="p-1 text-slate-500 hover:text-red-400" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredTags.length === 0 && (
                  <tr><td colSpan={canManage ? 11 : 10} className="px-4 py-8 text-center text-slate-500">No tags found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {editTag && <TagDialog tag={editTag} dataSources={dataSources} allLabels={allLabels} onSave={handleSaveTag} onClose={() => setEditTag(null)} />}
          {deleteTagTarget && <DeleteConfirmDialog title="Delete Tag" name={deleteTagTarget.name} onConfirm={handleDeleteTag} onCancel={() => setDeleteTagTarget(null)} />}
          {showTagImport && <TagImportDialog onImportCsv={handleCsvImport} onImportCodesys={handleCodesysImport} onImportRslogix={handleRslogixImport} onClose={() => setShowTagImport(false)} />}
          {bulkDeleteConfirm && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setBulkDeleteConfirm(false)}>
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-sm" onClick={e => e.stopPropagation()}>
                <div className="text-slate-100 font-medium mb-2">Delete {selectedTagIds.size} Tags</div>
                <p className="text-sm text-slate-400 mb-4">Are you sure you want to delete {selectedTagIds.size} selected tags? This cannot be undone.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setBulkDeleteConfirm(false)} className="px-4 py-2 bg-slate-700 rounded-lg text-sm text-slate-300">Cancel</button>
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
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5"><TagIcon size={14} /> Labels</h2>
              {canManage && (
                <button
                  onClick={() => setEditLabel({ name: '', color: LABEL_COLORS[allLabels.length % LABEL_COLORS.length], description: '' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium"
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
                        className="hover:text-slate-200 ml-1" title="Edit">
                        <Pencil size={10} />
                      </button>
                      <button onClick={() => setDeleteLabelTarget(l)}
                        className="hover:text-slate-200" title="Delete">
                        <Trash2 size={10} />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {allLabels.length === 0 && <span className="text-slate-500 text-xs">No labels defined yet</span>}
            </div>
          </div>

          {/* Label Edit Dialog */}
          {editLabel && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditLabel(null)}>
              <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-100">{editLabel.id != null ? 'Edit Label' : 'New Label'}</h2>
                  <button onClick={() => setEditLabel(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                </div>
                <div className="space-y-3">
                  <Field label="Name *">
                    <input value={editLabel.name} onChange={e => setEditLabel(l => l ? { ...l, name: e.target.value } : l)} className={inputCls} placeholder="e.g. Process" />
                  </Field>
                  <Field label="Color">
                    <div className="flex items-center gap-2">
                      <input type="color" value={editLabel.color} onChange={e => setEditLabel(l => l ? { ...l, color: e.target.value } : l)}
                        className="w-8 h-8 rounded border border-slate-600 cursor-pointer bg-transparent" />
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
                    <button onClick={() => setEditLabel(null)} className="px-4 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-600">Cancel</button>
                    <button onClick={() => editLabel.name.trim() && handleSaveLabel(editLabel)} className="px-4 py-2 bg-blue-600 rounded-lg text-sm text-white hover:bg-blue-700">
                      {editLabel.id != null ? 'Save' : 'Create'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {deleteLabelTarget && <DeleteConfirmDialog title="Delete Label" name={deleteLabelTarget.name} onConfirm={handleDeleteLabel} onCancel={() => setDeleteLabelTarget(null)} />}
        </div>
      )}

      {/* ═══ Data Sources ═══ */}
      {tab === 'datasources' && (
        <div>
          {canManage && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setEditDs({ name: '', protocol: 'opcua', enabled: true, config: {} })}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
              >
                <Plus size={16} /> New Data Source
              </button>
            </div>
          )}
          <div className="space-y-2">
            {dataSources.map((ds) => (
              <div key={ds.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${ds.connected ? 'bg-green-400' : 'bg-red-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-200">{ds.name}</div>
                  <div className="text-xs text-slate-400">
                    {PROTOCOL_CONFIGS[ds.protocol]?.label || ds.protocol} {'\u2022'} {ds.enabled ? 'Enabled' : 'Disabled'}
                    {typeof ds.config?.address_prefix === 'string' && (
                      <span className="ml-1" title={`Detected prefix: ${ds.config.address_prefix}`}> {'\u2022'} Prefix: <span className="font-mono">{ds.config.address_prefix}</span></span>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded flex-shrink-0 ${ds.connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {ds.connected ? 'Connected' : 'Disconnected'}
                </span>
                {canManage && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleConnect(ds)}
                      disabled={connectingId === ds.id}
                      className="p-1.5 text-slate-500 hover:text-green-400 disabled:opacity-50"
                      title={ds.connected ? 'Reconnect' : 'Connect'}
                    >
                      {connectingId === ds.id ? (
                        <span className="inline-block w-4 h-4 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
                      ) : ds.connected ? (
                        <Unplug size={16} />
                      ) : (
                        <Plug size={16} />
                      )}
                    </button>
                    {ds.connected && (
                      <button
                        onClick={() => setBrowseDs(ds)}
                        className="p-1.5 text-slate-500 hover:text-blue-400"
                        title="Browse tags"
                      >
                        <FolderSearch size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => setEditDs({ id: ds.id, name: ds.name, protocol: ds.protocol, enabled: ds.enabled, config: ds.config || {} })}
                      className="p-1.5 text-slate-500 hover:text-blue-400"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setDeleteDsTarget(ds)}
                      className="p-1.5 text-slate-500 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {dataSources.length === 0 && <p className="text-slate-500 text-center py-8">No data sources configured</p>}
          </div>

          {editDs && <DataSourceDialog ds={editDs} onSave={handleSaveDs} onClose={() => setEditDs(null)} />}
          {deleteDsTarget && <DeleteConfirmDialog title="Delete Data Source" name={deleteDsTarget.name} onConfirm={handleDeleteDs} onCancel={() => setDeleteDsTarget(null)} />}
          {browseDs && <BrowseTagsDialog dsId={browseDs.id} dsName={browseDs.name} existingTags={tags} onCreateTag={(tagData) => { setEditTag(tagData); }} onClose={() => setBrowseDs(null)} />}
          {editTag && <TagDialog tag={editTag} dataSources={dataSources} allLabels={allLabels} onSave={handleSaveTag} onClose={() => setEditTag(null)} />}
        </div>
      )}

      {/* ═══ Integrations ═══ */}
      {tab === 'integrations' && (
        <IntegrationsTab tagValues={tagValues} canManage={canManage} />
      )}

      {/* ═══ Users ═══ */}
      {tab === 'users' && (
        <div>
          <div className="flex justify-end mb-3">
            {canManage && (
              <button
                onClick={() => setShowCreateUser(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
              >
                <UserPlus size={16} /> Add User
              </button>
            )}
          </div>
          {showCreateUser && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
              <div className="text-sm font-medium text-slate-300 mb-3">Create User</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Username</label>
                  <input value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none mt-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Display Name</label>
                  <input value={newUser.display_name} onChange={e => setNewUser(p => ({ ...p, display_name: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none mt-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Password / PIN</label>
                  <input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none mt-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Role</label>
                  <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none mt-1">
                    <option value="operator">Operator</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="engineer">Engineer</option>
                    <option value="designer">Designer</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400">Login Mode</label>
                  <select value={newUser.login_mode} onChange={e => setNewUser(p => ({ ...p, login_mode: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none mt-1">
                    <option value="password">Password</option>
                    <option value="pin">PIN</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={handleCreateUser} className="px-4 py-2 bg-blue-600 rounded-md text-sm text-white">Create</button>
                <button onClick={() => setShowCreateUser(false)} className="px-4 py-2 bg-slate-700 rounded-md text-sm text-slate-300">Cancel</button>
              </div>
            </div>
          )}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">Username</th>
                  <th className="text-left px-4 py-3 font-medium">Display Name</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-center px-4 py-3 font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-4 py-2 text-slate-200">{u.username}</td>
                    <td className="px-4 py-2 text-slate-300">{u.display_name}</td>
                    <td className="px-4 py-2 capitalize text-slate-400">{u.role}</td>
                    <td className="px-4 py-2 text-center">{u.is_active ? '\u2713' : '\u2717'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Audit Trail ═══ */}
      {tab === 'audit' && (
        <div>
          <div className="flex gap-3 mb-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search audit log..."
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>
            <select
              value={auditActionFilter}
              onChange={e => setAuditActionFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none"
            >
              <option value="all">All Actions</option>
              {auditActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button
              onClick={exportAuditCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm"
            >
              <Download size={16} /> Export CSV
            </button>
          </div>
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">Time</th>
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                  <th className="text-left px-4 py-3 font-medium">Details</th>
                  <th className="text-left px-4 py-3 font-medium">Source IP</th>
                </tr>
              </thead>
              <tbody>
                {filteredAudit.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-4 py-2 text-slate-300 whitespace-nowrap">{new Date(entry.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-2 text-slate-300">{entry.user || '\u2014'}</td>
                    <td className="px-4 py-2 text-slate-400">{entry.action}</td>
                    <td className="px-4 py-2 text-slate-400 truncate max-w-md">{entry.details || '\u2014'}</td>
                    <td className="px-4 py-2 text-slate-500 text-xs">{entry.source_ip || '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
