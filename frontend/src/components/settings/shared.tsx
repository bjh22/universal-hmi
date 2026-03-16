/* eslint-disable react-refresh/only-export-components */
import { useState, useMemo, useCallback, useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { Tag, TagValue } from '../../types';

export const EMPTY_TAG: Omit<Tag, 'id'> = {
  name: '',
  display_name: null,
  description: null,
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

export const LABEL_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
];

export const inputCls = 'w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-[var(--hmi-text-secondary)] mb-1 block">{label}</label>
      {children}
    </div>
  );
}

// ─── Inline editable live tag value ───
export function InlineTagValue({ tag, tagValues, canEdit }: { tag: Tag; tagValues: Record<string, TagValue>; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const tv = tagValues[tag.name];
  const value = tv?.value;

  const formatNum = (v: unknown) => typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : String(v);

  const display = (() => {
    if (value == null) return '—';
    if (tag.data_type === 'bool') return value ? 'ON' : 'OFF';
    if (tag.enum_mapping) {
      let em: Record<string, string> = {};
      try { em = typeof tag.enum_mapping === 'string' ? JSON.parse(tag.enum_mapping) : tag.enum_mapping; } catch { /* ignore */ }
      const mapped = em[String(value)];
      if (mapped) return `${mapped} (${formatNum(value)})`;
    }
    return formatNum(value);
  })();

  const startEdit = () => {
    if (!canEdit) return;
    setDraft(value != null ? String(value) : '');
    setEditing(true);
  };

  const submit = async () => {
    setEditing(false);
    let parsed: unknown = draft;
    if (tag.data_type === 'bool') parsed = draft === 'true' || draft === '1' || draft === 'ON';
    else if (tag.data_type === 'int' || tag.data_type === 'float') {
      const n = Number(draft);
      if (!isNaN(n)) parsed = n;
    }
    try { await api.writeTag(tag.name, parsed); } catch { /* ignore */ }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={submit}
        onKeyDown={handleKeyDown}
        className="w-20 bg-[var(--hmi-bg-input)] border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white outline-none"
      />
    );
  }

  return (
    <span
      onClick={canEdit ? startEdit : undefined}
      className={`text-xs tabular-nums ${canEdit ? 'cursor-pointer hover:text-blue-400' : ''} ${
        tag.data_type === 'bool' ? (value ? 'text-green-400' : 'text-[var(--hmi-text-muted)]') : 'text-[var(--hmi-text-secondary)]'
      }`}
      title={canEdit ? 'Click to edit' : undefined}
    >
      {display}
    </span>
  );
}

// ─── Generic Delete Confirmation ───
export function DeleteConfirmDialog({ title, name, onConfirm, onCancel }: {
  title: string;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] p-6 max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="text-[var(--hmi-text-primary)] font-medium mb-2">{title}</div>
        <p className="text-sm text-[var(--hmi-text-secondary)] mb-4">Are you sure you want to delete <span className="text-[var(--hmi-text-primary)] font-mono">{name}</span>? This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 bg-[var(--hmi-bg-input)] rounded-lg text-sm text-[var(--hmi-text-secondary)]">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 rounded-lg text-sm text-white hover:bg-red-700">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Enum Mapping Editor ───
export function EnumMappingEditor({ mapping, onChange }: {
  mapping: Record<string, string> | null;
  onChange: (m: Record<string, string> | null) => void;
}) {
  const entries = useMemo(() => {
    if (!mapping) return [];
    let parsed: Record<string, string> = {};
    try { parsed = typeof mapping === 'string' ? JSON.parse(mapping) : mapping; } catch { /* ignore malformed */ }
    return Object.entries(parsed)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([k, v]) => ({ key: k, label: v as string }));
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
            className="w-16 bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded px-1.5 py-0.5 text-xs text-white"
          />
          <span className="text-[var(--hmi-text-muted)] text-xs">=</span>
          <input
            type="text"
            value={entry.label}
            onChange={e => updateEntry(i, 'label', e.target.value)}
            placeholder="Label"
            className="flex-1 bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded px-1.5 py-0.5 text-xs text-white"
          />
          <button type="button" onClick={() => removeEntry(i)} className="text-red-400 hover:text-red-300 text-xs px-1">&times;</button>
        </div>
      ))}
      <button type="button" onClick={addEntry} className="text-xs text-blue-400 hover:text-blue-300">+ Add value</button>
    </div>
  );
}

export function parseAlarmConfig(raw: unknown): { type: string; trigger_on: boolean; severity: string; message: string; help_image: string; help_text: string; help_enabled: boolean } {
  const defaults = { type: 'boolean', trigger_on: true, severity: 'warning', message: '', help_image: '', help_text: '', help_enabled: false };
  if (!raw) return defaults;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { ...defaults, ...(parsed as Record<string, unknown>) };
  } catch { return defaults; }
}

// ─── Fault Help Config (inside alarm section) ───
export function FaultHelpConfig({ alarmConfig, setAlarmField }: {
  alarmConfig: Record<string, unknown> | null;
  setAlarmField: (field: string, value: string | boolean) => void;
}) {
  const config = parseAlarmConfig(alarmConfig);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await api.uploadFaultHelpMedia(file);
      setAlarmField('help_image', result.media_id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [setAlarmField]);

  return (
    <div className="mt-3 space-y-2">
      <label className="flex items-center gap-2 text-sm text-[var(--hmi-text-secondary)] cursor-pointer">
        <input
          type="checkbox"
          checked={!!config.help_enabled}
          onChange={e => setAlarmField('help_enabled', e.target.checked)}
          className="accent-blue-500"
        />
        Show help dialog on fault
      </label>
      {config.help_enabled && (
        <div className="space-y-2 pl-5">
          <div>
            <label className="text-xs text-[var(--hmi-text-secondary)] block mb-1">Help Image (GIF, PNG, JPG)</label>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1 text-xs rounded border border-[var(--hmi-border)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-bg-base)] disabled:opacity-50"
              >
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {uploading ? 'Uploading...' : 'Upload Image'}
              </button>
              {config.help_image && (
                <button
                  type="button"
                  onClick={() => setAlarmField('help_image', '')}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              )}
            </div>
            {config.help_image && (
              <div className="mt-2 p-1 bg-[var(--hmi-bg-base)] border border-[var(--hmi-border)] rounded inline-block">
                <img
                  src={`/api/media/${config.help_image}`}
                  alt="Help preview"
                  className="max-w-[200px] max-h-[120px] object-contain rounded"
                />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-[var(--hmi-text-secondary)] block mb-1">Help Instructions</label>
            <textarea
              value={config.help_text || ''}
              onChange={e => setAlarmField('help_text', e.target.value)}
              placeholder="Step-by-step troubleshooting instructions..."
              rows={3}
              className="w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded px-2 py-1.5 text-sm text-[var(--hmi-text-primary)] placeholder-[var(--hmi-text-muted)] resize-y"
            />
          </div>
        </div>
      )}
    </div>
  );
}
