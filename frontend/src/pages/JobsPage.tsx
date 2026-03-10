import { useEffect, useState, useCallback, useMemo } from 'react';
import { ClipboardList, Download, Plus, Trash2, Edit, Copy, Upload, Save, X, Search, History, Shield, ChevronDown, ChevronRight, Tag as TagIcon } from 'lucide-react';
import { api } from '../lib/api';
import { getTagDisplayName, buildTagDisplayNameMap } from '../lib/tagDisplayName';
import { NumericKeypad, AlphaKeyboard } from '../components/widgets/TouchInput';
import type { JobData, JobHistoryEntry, Tag, UserData } from '../types';

interface Props {
  user: UserData | null;
}

const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-3 text-sm text-white outline-none focus:border-blue-500 min-h-[44px]';

// ─── Helper: parse a string into a typed value ───
function parseTypedValue(val: string): unknown {
  if (val === 'true') return true;
  if (val === 'false') return false;
  const num = Number(val);
  if (!isNaN(num) && val.trim() !== '') return num;
  return val;
}

// ─── Helper: format a tag value for read-only display (enum labels, decimals, units) ───
function formatTagValue(tag: Tag | undefined, value: unknown): string {
  if (value == null || value === '') return '—';
  if (tag?.enum_mapping) {
    let em: Record<string, string> = {};
    try { em = typeof tag.enum_mapping === 'string' ? JSON.parse(tag.enum_mapping) : tag.enum_mapping; } catch { /* ignore */ }
    const mapped = em[String(value)];
    if (mapped) return mapped;
  }
  const formatted = typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(2) : String(value);
  if (tag?.engineering_units) return `${formatted} ${tag.engineering_units}`;
  return formatted;
}

// ─── Helper: group setpoint entries by tag label (excluding "Job Setpoint") ───
function groupEntries(entries: [string, unknown][], tags: Tag[]): { group: string; items: [string, unknown, number][] }[] {
  const tagMap = new Map(tags.map(t => [t.name, t]));
  const groups = new Map<string, [string, unknown, number][]>();
  entries.forEach(([key, val], idx) => {
    const tag = tagMap.get(key);
    const labelNames = tag?.labels?.filter(l => l.name !== 'Job Setpoint').map(l => l.name).sort() || [];
    const group = labelNames.length > 0 ? labelNames.join(', ') : 'Other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push([key, val, idx]);
  });
  return Array.from(groups.entries())
    .sort(([a], [b]) => a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b))
    .map(([group, items]) => ({ group, items }));
}

// ─── Setpoint Editor (structured tag picker, grouped) ───
function SetpointEditor({ value, onChange, tags }: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  tags: Tag[];
}) {
  const entries = Object.entries(value);
  const [keypad, setKeypad] = useState<{ key: string; kind: 'numeric' | 'alpha' } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tagMap = useMemo(() => new Map(tags.map(t => [t.name, t])), [tags]);

  const tagDisplayName = (name: string) => tagMap.get(name)?.display_name || name;
  const isBoolTag = (name: string) => tagMap.get(name)?.data_type === 'bool';

  const addRow = () => {
    onChange({ ...value, '': '' });
  };

  const updateKey = (_oldKey: string, newKey: string, idx: number) => {
    const newObj: Record<string, unknown> = {};
    Object.entries(value).forEach(([k, v], i) => {
      newObj[i === idx ? newKey : k] = v;
    });
    onChange(newObj);
  };

  const updateValue = (key: string, val: string) => {
    onChange({ ...value, [key]: parseTypedValue(val) });
  };

  const removeRow = (key: string) => {
    const copy = { ...value };
    delete copy[key];
    onChange(copy);
  };

  const openKeypad = (key: string) => {
    const current = value[key];
    const isNumeric = typeof current === 'number' || (typeof current === 'string' && current !== '' && !isNaN(Number(current)));
    setKeypad({ key, kind: isNumeric || current === '' ? 'numeric' : 'alpha' });
  };

  const toggleGroup = (group: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  };

  // Group tag options for <select> by label (excluding "Job Setpoint")
  const writableTags = tags.filter(t => t.access_mode !== 'read' && !t.name.startsWith('$'));
  const tagGroups = useMemo(() => {
    const groups = new Map<string, Tag[]>();
    for (const t of writableTags) {
      const labelNames = t.labels?.filter(l => l.name !== 'Job Setpoint').map(l => l.name).sort() || [];
      const g = labelNames.length > 0 ? labelNames.join(', ') : 'Other';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(t);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b));
  }, [writableTags]);

  const grouped = groupEntries(entries, tags);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-400 font-medium">Setpoints</label>
        <button type="button" onClick={addRow} className="text-sm text-blue-400 hover:text-blue-300 min-h-[44px] px-2 active:scale-95 transition-transform">+ Add setpoint</button>
      </div>
      {entries.length === 0 && <p className="text-xs text-slate-500 italic">No setpoints defined</p>}
      {grouped.map(({ group, items }) => (
        <div key={group}>
          {grouped.length > 1 && (
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              className="flex items-center gap-1.5 w-full py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              {collapsed.has(group) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              {group}
              <span className="text-slate-600 ml-1">({items.length})</span>
            </button>
          )}
          {!collapsed.has(group) && items.map(([key, val, idx]) => {
            const tagDef = tagMap.get(key);
            let enumMap: Record<string, string> | null = null;
            if (tagDef?.enum_mapping) {
              try { enumMap = typeof tagDef.enum_mapping === 'string' ? JSON.parse(tagDef.enum_mapping) : tagDef.enum_mapping; } catch { /* ignore */ }
            }
            const hasEnum = enumMap && Object.keys(enumMap).length > 0;
            return (
            <div key={idx} className="flex gap-2 items-center mb-2">
              <div className="flex-1">
                <select
                  value={key}
                  onChange={e => updateKey(key, e.target.value, idx)}
                  className={inputCls + ' text-xs'}
                >
                  <option value="">Select tag…</option>
                  {tagGroups.map(([gName, gTags]) => (
                    <optgroup key={gName} label={gName}>
                      {gTags.map(t => (
                        <option key={t.id} value={t.name}>{t.display_name || t.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {isBoolTag(key) ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...value, [key]: !Boolean(val) })}
                  className="w-32 min-h-[44px] flex items-center gap-2 px-3 py-2"
                >
                  <div className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${Boolean(val) ? 'bg-green-500' : 'bg-slate-600'}`}>
                    <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm"
                      style={{ left: Boolean(val) ? '1.25rem' : '0.125rem' }} />
                  </div>
                  <span className={`text-xs font-medium ${Boolean(val) ? 'text-green-400' : 'text-slate-500'}`}>
                    {Boolean(val) ? 'ON' : 'OFF'}
                  </span>
                </button>
              ) : hasEnum ? (
                <select
                  value={String(val ?? '')}
                  onChange={e => updateValue(key, e.target.value)}
                  className="w-32 min-h-[44px] bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white hover:border-blue-500 transition-all"
                >
                  <option value="">Select…</option>
                  {Object.entries(enumMap!).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => openKeypad(key)}
                  className="w-32 min-h-[44px] bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white text-left hover:border-blue-500 active:scale-95 transition-all"
                >
                  {val !== '' && val != null ? (
                    <span>{String(val)}</span>
                  ) : (
                    <span className="text-slate-500">Tap to set</span>
                  )}
                </button>
              )}
              <button type="button" onClick={() => removeRow(key)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-red-400 active:scale-95 transition-transform">
                <X size={18} />
              </button>
            </div>
            );
          })}
        </div>
      ))}
      {keypad?.kind === 'numeric' && (
        <NumericKeypad
          value={String(value[keypad.key] ?? '')}
          title={tagDisplayName(keypad.key) || 'Setpoint Value'}
          onSubmit={val => { updateValue(keypad.key, val); setKeypad(null); }}
          onClose={() => setKeypad(null)}
        />
      )}
      {keypad?.kind === 'alpha' && (
        <AlphaKeyboard
          value={String(value[keypad.key] ?? '')}
          title={tagDisplayName(keypad.key) || 'Setpoint Value'}
          onSubmit={val => { updateValue(keypad.key, val); setKeypad(null); }}
          onClose={() => setKeypad(null)}
        />
      )}
    </div>
  );
}

// ─── Read-only Setpoint Display (grouped, collapsible) ───
function JobSetpointDisplay({ setpoints, tags }: { setpoints: string | null; tags: Tag[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  let sp: Record<string, unknown> = {};
  try { sp = JSON.parse(setpoints || '{}'); } catch { /* ignore malformed */ }
  const entries = Object.entries(sp);
  if (entries.length === 0) return <p className="text-xs text-slate-500 italic mb-3">No setpoints</p>;
  const grouped = groupEntries(entries, tags);

  const toggleGroup = (group: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  };

  return (
    <div className="space-y-2 mb-3">
      {grouped.map(({ group, items }) => (
        <div key={group}>
          {grouped.length > 1 && (
            <button
              onClick={() => toggleGroup(group)}
              className="flex items-center gap-1.5 w-full py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              {collapsed.has(group) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              {group}
              <span className="text-slate-600 ml-1">({items.length})</span>
            </button>
          )}
          {!collapsed.has(group) && (
            <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {items.map(([k, v]) => {
                    const tag = tags.find(t => t.name === k);
                    const isBool = tag?.data_type === 'bool';
                    return (
                      <tr key={k} className="border-b border-slate-700/50">
                        <td className="px-4 py-3 text-slate-300 text-sm">{getTagDisplayName(k, tags)}</td>
                        <td className="px-4 py-3 text-right text-sm">
                          {isBool ? (
                            <span className={`font-medium ${Boolean(v) ? 'text-green-400' : 'text-slate-500'}`}>
                              {Boolean(v) ? 'ON' : 'OFF'}
                            </span>
                          ) : (
                            <span className="text-slate-200">{formatTagValue(tag, v)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Download Conditions Editor ───
function ConditionsEditor({ value, onChange, tags }: {
  value: { guards: { tag: string; value: unknown }[] };
  onChange: (v: { guards: { tag: string; value: unknown }[] }) => void;
  tags: Tag[];
}) {
  const guards = value.guards || [];
  const [keypad, setKeypad] = useState<{ idx: number; kind: 'numeric' | 'alpha' } | null>(null);

  const tagDisplayName = (name: string) => {
    const t = tags.find(t => t.name === name);
    return t?.display_name || name;
  };

  const addGuard = () => {
    onChange({ guards: [...guards, { tag: '', value: '' }] });
  };

  const updateGuard = (idx: number, field: 'tag' | 'value', val: string) => {
    const updated = guards.map((g, i) => {
      if (i !== idx) return g;
      if (field === 'tag') return { ...g, tag: val };
      return { ...g, value: parseTypedValue(val) };
    });
    onChange({ guards: updated });
  };

  const removeGuard = (idx: number) => {
    onChange({ guards: guards.filter((_, i) => i !== idx) });
  };

  const openKeypad = (idx: number) => {
    const current = guards[idx].value;
    const isNumeric = typeof current === 'number' || (typeof current === 'string' && current !== '' && !isNaN(Number(current)));
    setKeypad({ idx, kind: isNumeric || current === '' ? 'numeric' : 'alpha' });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-400 font-medium">Download Conditions</label>
        <button type="button" onClick={addGuard} className="text-sm text-blue-400 hover:text-blue-300 min-h-[44px] px-2 active:scale-95 transition-transform">+ Add guard</button>
      </div>
      <p className="text-[10px] text-slate-500">Tag must equal value before download is allowed</p>
      {guards.length === 0 && <p className="text-xs text-slate-500 italic">No conditions (always allowed)</p>}
      {guards.map((g, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <div className="flex-1">
            <select
              value={g.tag}
              onChange={e => updateGuard(idx, 'tag', e.target.value)}
              className={inputCls + ' text-xs'}
            >
              <option value="">Select tag…</option>
              {tags.filter(t => !t.name.startsWith('$')).map(t => (
                <option key={t.id} value={t.name}>{t.display_name || t.name}</option>
              ))}
            </select>
          </div>
          <span className="text-sm text-slate-500">=</span>
          <button
            type="button"
            onClick={() => openKeypad(idx)}
            className="w-28 min-h-[44px] bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white text-left hover:border-blue-500 active:scale-95 transition-all"
          >
            {g.value !== '' && g.value != null ? (
              <span>{String(g.value)}</span>
            ) : (
              <span className="text-slate-500">Tap to set</span>
            )}
          </button>
          <button type="button" onClick={() => removeGuard(idx)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-red-400 active:scale-95 transition-transform">
            <X size={18} />
          </button>
        </div>
      ))}
      {keypad?.kind === 'numeric' && (
        <NumericKeypad
          value={String(guards[keypad.idx].value ?? '')}
          title={tagDisplayName(guards[keypad.idx].tag) || 'Guard Value'}
          onSubmit={val => { updateGuard(keypad.idx, 'value', val); setKeypad(null); }}
          onClose={() => setKeypad(null)}
        />
      )}
      {keypad?.kind === 'alpha' && (
        <AlphaKeyboard
          value={String(guards[keypad.idx].value ?? '')}
          title={tagDisplayName(guards[keypad.idx].tag) || 'Guard Value'}
          onSubmit={val => { updateGuard(keypad.idx, 'value', val); setKeypad(null); }}
          onClose={() => setKeypad(null)}
        />
      )}
    </div>
  );
}

// ─── Version History Dialog ───
function HistoryDialog({ jobId, jobName, onRestore, onClose }: {
  jobId: number;
  jobName: string;
  onRestore: (setpoints: string) => void;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<JobHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    api.getJobHistory(jobId)
      .then(h => { setHistory(h); setLoading(false); })
      .catch(() => setLoading(false));
  }, [jobId]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-t-2xl sm:rounded-xl border border-slate-700 w-full sm:max-w-2xl max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Version History: {jobName}</h2>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white active:scale-95 transition-transform"><X size={22} /></button>
        </div>
        {loading && <p className="text-slate-400 text-sm py-4 text-center">Loading...</p>}
        {!loading && history.length === 0 && (
          <p className="text-slate-500 text-sm py-4 text-center">No previous versions</p>
        )}
        <div className="space-y-2">
          {history.map(h => (
            <div key={h.id} className="bg-slate-900 rounded-lg border border-slate-700">
              <button
                onClick={() => setExpanded(expanded === h.id ? null : h.id)}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[48px] text-left active:scale-[0.98] transition-transform"
              >
                {expanded === h.id ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                <span className="text-sm text-slate-200 font-medium">v{h.version}</span>
                <span className="text-xs text-slate-500">{h.job_name}</span>
                <span className="text-xs text-slate-500 ml-auto">{h.changed_by || 'unknown'} &middot; {new Date(h.changed_at).toLocaleString()}</span>
              </button>
              {expanded === h.id && (
                <div className="px-4 pb-3 border-t border-slate-700 pt-2">
                  <pre className="text-xs text-slate-400 bg-slate-950 rounded p-2 max-h-48 overflow-auto mb-2">
                    {(() => { try { return JSON.stringify(JSON.parse(h.setpoints || '{}'), null, 2); } catch { return h.setpoints || '{}'; } })()}
                  </pre>
                  <button
                    onClick={() => { onRestore(h.setpoints); onClose(); }}
                    className="px-4 py-3 min-h-[44px] bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] text-white rounded-lg text-sm active:scale-95 transition-transform"
                  >
                    Restore this version
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-5 py-3 min-h-[44px] bg-slate-700 rounded-lg text-sm text-slate-300 active:scale-95 transition-transform">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload from Machine Dialog ───
function UploadDialog({ tags, onClose, onUploaded }: {
  tags: Tag[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [name, setName] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [tagSearch, setTagSearch] = useState('');
  const [uploading, setUploading] = useState(false);

  const writableTags = useMemo(() =>
    tags.filter(t => t.access_mode !== 'read' && !t.name.startsWith('$')),
    [tags]
  );

  // Auto-select tags labeled "Job Setpoint" on open
  useEffect(() => {
    const jobSetpointNames = new Set(
      writableTags
        .filter(t => t.labels?.some(l => l.name === 'Job Setpoint'))
        .map(t => t.name)
    );
    if (jobSetpointNames.size > 0) {
      setSelectedTags(jobSetpointNames);
    }
  }, [writableTags]);

  const filteredTags = useMemo(() => {
    if (!tagSearch) return writableTags;
    const q = tagSearch.toLowerCase();
    return writableTags.filter(t => t.name.toLowerCase().includes(q) || (t.display_name || '').toLowerCase().includes(q) || (t.labels || []).some(l => l.name.toLowerCase().includes(q)));
  }, [writableTags, tagSearch]);

  const toggleAll = () => {
    if (selectedTags.size === filteredTags.length) {
      setSelectedTags(new Set());
    } else {
      setSelectedTags(new Set(filteredTags.map(t => t.name)));
    }
  };

  const handleUpload = async () => {
    if (!name.trim() || selectedTags.size === 0) return;
    setUploading(true);
    try {
      await api.uploadJobFromMachine(name, Array.from(selectedTags));
      onUploaded();
      onClose();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-t-2xl sm:rounded-xl border border-slate-700 w-full sm:max-w-lg max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Capture from Machine</h2>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white active:scale-95 transition-transform"><X size={22} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-slate-400">Job Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls + ' mt-1'} placeholder="e.g. Current Setup" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-slate-400">Select tags to capture ({selectedTags.size} selected)</label>
              <button type="button" onClick={toggleAll} className="text-sm text-blue-400 hover:text-blue-300 min-h-[44px] px-2 active:scale-95 transition-transform">
                {selectedTags.size === filteredTags.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={tagSearch}
                onChange={e => setTagSearch(e.target.value)}
                placeholder="Filter tags..."
                className="w-full bg-slate-700 border border-slate-600 rounded-md pl-8 pr-3 py-3 text-sm text-white outline-none min-h-[44px]"
              />
            </div>
            <div className="max-h-60 overflow-auto bg-slate-900 rounded-lg border border-slate-700 p-2 space-y-0.5">
              {filteredTags.map(t => (
                <label key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded hover:bg-slate-800 cursor-pointer text-sm min-h-[44px] active:bg-slate-700 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={selectedTags.has(t.name)}
                    onChange={() => {
                      const next = new Set(selectedTags);
                      if (next.has(t.name)) { next.delete(t.name); } else { next.add(t.name); }
                      setSelectedTags(next);
                    }}
                    className="accent-blue-500 w-5 h-5"
                  />
                  <span className="text-slate-300">{t.display_name || t.name}</span>
                  {t.labels?.map(l => (
                    <span key={l.id} className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: (l.color || '#6b7280') + '20', color: l.color || '#6b7280' }}>{l.name}</span>
                  ))}
                  {t.engineering_units && <span className="text-slate-600 ml-auto">{t.engineering_units}</span>}
                </label>
              ))}
              {filteredTags.length === 0 && <p className="text-slate-600 text-center py-2">No writable tags found</p>}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-5 py-3 min-h-[44px] bg-slate-700 rounded-lg text-sm text-slate-300 active:scale-95 transition-transform">Cancel</button>
            <button
              onClick={handleUpload}
              disabled={uploading || !name.trim() || selectedTags.size === 0}
              className="px-5 py-3 min-h-[44px] bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-sm text-white active:scale-95 transition-transform"
            >
              {uploading ? 'Capturing...' : 'Capture'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main JobsPage ───
export function JobsPage({ user }: Props) {
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editSetpoints, setEditSetpoints] = useState<Record<string, unknown>>({});
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editConditions, setEditConditions] = useState<{ guards: { tag: string; value: unknown }[] }>({ guards: [] });
  const [jobSearch, setJobSearch] = useState('');

  const userRole = user?.role || '';
  const canEdit = ['supervisor', 'engineer', 'designer'].includes(userRole);
  const canDelete = ['engineer', 'designer'].includes(userRole);

  const loadJobs = useCallback(() => {
    api.getJobs().then(setJobs).catch(() => {});
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);
  useEffect(() => { api.getTags().then(setTags).catch(() => {}); }, []);

  const filteredJobs = useMemo(() => {
    if (!jobSearch) return jobs;
    const q = jobSearch.toLowerCase();
    return jobs.filter(j =>
      j.name.toLowerCase().includes(q) ||
      (j.description || '').toLowerCase().includes(q)
    );
  }, [jobs, jobSearch]);

  const handleDownload = async (id: number) => {
    const job = jobs.find(j => j.id === id);
    if (!job) return;
    const setpoints = JSON.parse(job.setpoints || '{}');
    const displayMap = buildTagDisplayNameMap(tags);
    const tagMap = new Map(tags.map(t => [t.name, t]));
    const params = Object.entries(setpoints).map(([k, v]) => `  ${displayMap[k] || k}: ${formatTagValue(tagMap.get(k), v)}`).join('\n');
    const conditions = job.download_conditions ? JSON.parse(job.download_conditions) : null;
    let msg = `Download job "${job.name}" to machine?\n\nSetpoints:\n${params || '(none)'}`;
    if (conditions?.guards?.length) {
      msg += `\n\nPre-conditions:\n${conditions.guards.map((g: { tag: string; value: unknown }) => `  ${displayMap[g.tag] || g.tag} = ${formatTagValue(tagMap.get(g.tag), g.value)}`).join('\n')}`;
    }
    if (!window.confirm(msg)) return;
    try {
      await api.downloadJob(id);
      alert('Job downloaded successfully');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this job?')) return;
    await api.deleteJob(id);
    loadJobs();
    if (selectedJob?.id === id) setSelectedJob(null);
  };

  // Get default setpoints from tags labeled "Job Setpoint"
  const jobSetpointTags = useMemo(() =>
    tags.filter(t => t.labels?.some(l => l.name === 'Job Setpoint')),
    [tags]
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    // Auto-populate setpoints from "Job Setpoint" labeled tags
    const defaultSetpoints: Record<string, unknown> = {};
    for (const t of jobSetpointTags) {
      defaultSetpoints[t.name] = '';
    }
    await api.createJob({ name: newName, description: newDescription, setpoints: defaultSetpoints });
    setNewName('');
    setNewDescription('');
    setShowCreate(false);
    loadJobs();
  };

  const handleClone = async (job: JobData) => {
    const name = `${job.name} (copy)`;
    const conditions = job.download_conditions ? JSON.parse(job.download_conditions) : null;
    await api.createJob({
      name,
      description: job.description,
      setpoints: JSON.parse(job.setpoints || '{}'),
      download_conditions: conditions,
    });
    loadJobs();
  };

  const startEdit = (job: JobData) => {
    setEditMode(true);
    setEditName(job.name);
    setEditSetpoints(JSON.parse(job.setpoints || '{}'));
    setEditDescription(job.description || '');
    const conditions = job.download_conditions ? JSON.parse(job.download_conditions) : { guards: [] };
    setEditConditions(conditions);
  };

  const handleSaveEdit = async () => {
    if (!selectedJob || !editName.trim()) return;
    await api.updateJob(selectedJob.id, {
      name: editName.trim(),
      description: editDescription,
      setpoints: editSetpoints,
      download_conditions: editConditions.guards.length > 0 ? editConditions : null,
    });
    setEditMode(false);
    loadJobs();
    const updated = await api.getJob(selectedJob.id);
    setSelectedJob(updated);
  };

  const handleRestore = async (setpoints: string) => {
    if (!selectedJob) return;
    await api.updateJob(selectedJob.id, {
      name: selectedJob.name,
      description: selectedJob.description,
      setpoints: JSON.parse(setpoints),
    });
    loadJobs();
    const updated = await api.getJob(selectedJob.id);
    setSelectedJob(updated);
  };

  const handleExportJson = useCallback(() => {
    if (!selectedJob) return;
    const data: Record<string, unknown> = {
      name: selectedJob.name,
      description: selectedJob.description,
      version: selectedJob.version,
      setpoints: JSON.parse(selectedJob.setpoints || '{}'),
    };
    if (selectedJob.download_conditions) {
      data.download_conditions = JSON.parse(selectedJob.download_conditions);
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedJob.name.replace(/\s+/g, '_')}_v${selectedJob.version}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [selectedJob]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-100">Jobs</h1>
        {canEdit && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-3 min-h-[44px] bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform"
            >
              <Upload size={18} /> Capture from Machine
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-3 min-h-[44px] bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] text-white rounded-lg text-sm font-medium active:scale-95 transition-transform"
            >
              <Plus size={18} /> New Job
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
          <div className="space-y-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Job name"
              className={inputCls}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              autoFocus
            />
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              className={inputCls}
            />
            {jobSetpointTags.length > 0 && (
              <div className="flex items-start gap-1.5 text-xs text-slate-400 bg-slate-900 rounded-md px-3 py-2">
                <TagIcon size={12} className="mt-0.5 text-blue-400 flex-shrink-0" />
                <span>
                  Default setpoints from <span className="text-blue-400 font-medium">Job Setpoint</span> tags:{' '}
                  {jobSetpointTags.map(t => t.display_name || t.name).join(', ')}
                </span>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={handleCreate} className="px-5 py-3 min-h-[44px] bg-[var(--hmi-accent)] rounded-lg text-sm text-white active:scale-95 transition-transform">Create</button>
              <button onClick={() => setShowCreate(false)} className="px-5 py-3 min-h-[44px] bg-slate-700 rounded-lg text-sm text-slate-300 active:scale-95 transition-transform">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Job list */}
        <div className="w-full lg:w-96 flex-shrink-0">
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={jobSearch}
              onChange={e => setJobSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-3 min-h-[44px] text-sm text-white outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-2">
            {filteredJobs.map((job) => (
              <div
                key={job.id}
                onClick={() => { setSelectedJob(job); setEditMode(false); }}
                className={`p-4 rounded-xl border cursor-pointer transition-colors active:scale-[0.98] ${
                  selectedJob?.id === job.id
                    ? 'bg-[var(--hmi-accent-bg)] border-[var(--hmi-accent)]/30'
                    : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-slate-200 text-sm truncate">{job.name}</div>
                  <span className="text-xs text-slate-500 flex-shrink-0 ml-2">v{job.version}</span>
                </div>
                {job.description && (
                  <div className="text-xs text-slate-400 mt-1 truncate">{job.description}</div>
                )}
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDownload(job.id); }}
                    className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-green-600/20 text-green-400 rounded-lg text-sm hover:bg-green-600/30 active:scale-95 transition-transform"
                  >
                    <Download size={16} /> Download
                  </button>
                  {canEdit && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleClone(job); }}
                      className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-[var(--hmi-accent-bg)] text-[var(--hmi-accent-text)] rounded-lg text-sm hover:bg-[var(--hmi-accent)]/30 active:scale-95 transition-transform"
                    >
                      <Copy size={16} /> Clone
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(job.id); }}
                      className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-red-600/20 text-red-400 rounded-lg text-sm hover:bg-red-600/30 active:scale-95 transition-transform"
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filteredJobs.length === 0 && jobs.length > 0 && (
              <p className="text-center text-slate-500 py-4 text-sm">No matching jobs</p>
            )}
            {jobs.length === 0 && (
              <div className="text-center text-slate-500 py-12">
                <ClipboardList size={32} className="mx-auto mb-2 opacity-50" />
                <p>No jobs created</p>
              </div>
            )}
          </div>
        </div>

        {/* Job detail */}
        {selectedJob && (
          <div className="flex-1 bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-slate-100">{selectedJob.name}</h2>
              <div className="flex gap-2 flex-wrap justify-end">
                <button
                  onClick={() => setShowHistory(true)}
                  className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 active:scale-95 transition-transform"
                  title="Version history"
                >
                  <History size={16} /> History
                </button>
                {canEdit && !editMode && (
                  <button
                    onClick={() => startEdit(selectedJob)}
                    className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 active:scale-95 transition-transform"
                  >
                    <Edit size={16} /> Edit
                  </button>
                )}
                <button
                  onClick={handleExportJson}
                  className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 active:scale-95 transition-transform"
                >
                  <Upload size={16} /> Export JSON
                </button>
              </div>
            </div>
            <div className="text-xs text-slate-400 mb-4">
              Version {selectedJob.version} &middot; Created by {selectedJob.created_by || 'unknown'} &middot; {new Date(selectedJob.created_at).toLocaleString()}
            </div>

            {editMode ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 font-medium">Name</label>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className={inputCls + ' mt-1'}
                    placeholder="Job name"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium">Description</label>
                  <input
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    className={inputCls + ' mt-1'}
                  />
                </div>
                <SetpointEditor value={editSetpoints} onChange={setEditSetpoints} tags={tags} />
                <ConditionsEditor value={editConditions} onChange={setEditConditions} tags={tags} />
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSaveEdit}
                    className="flex items-center gap-1.5 px-5 py-3 min-h-[44px] bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] rounded-lg text-sm text-white active:scale-95 transition-transform"
                  >
                    <Save size={16} /> Save
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="flex items-center gap-1.5 px-5 py-3 min-h-[44px] bg-slate-700 rounded-lg text-sm text-slate-300 active:scale-95 transition-transform"
                  >
                    <X size={16} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {selectedJob.description && (
                  <p className="text-sm text-slate-400 mb-3">{selectedJob.description}</p>
                )}

                <h3 className="text-sm font-medium text-slate-300 mb-2">Setpoints</h3>
                <JobSetpointDisplay setpoints={selectedJob.setpoints} tags={tags} />

                {selectedJob.download_conditions && (() => {
                  const conds = JSON.parse(selectedJob.download_conditions);
                  const guards = conds?.guards || [];
                  if (guards.length === 0) return null;
                  return (
                    <>
                      <h3 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                        <Shield size={14} className="text-yellow-400" /> Download Conditions
                      </h3>
                      <div className="bg-slate-900 rounded-lg border border-slate-700 mb-3 overflow-hidden">
                        <table className="w-full text-sm">
                          <tbody>
                            {guards.map((g: { tag: string; value: unknown }, i: number) => {
                              const guardTag = tags.find(t => t.name === g.tag);
                              return (
                                <tr key={i} className="border-b border-slate-700/50">
                                  <td className="px-4 py-3 text-slate-300 text-sm">{getTagDisplayName(g.tag, tags)}</td>
                                  <td className="px-4 py-3 text-sm text-slate-500">=</td>
                                  <td className="px-4 py-3 text-slate-200 text-sm">{formatTagValue(guardTag, g.value)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showUpload && <UploadDialog tags={tags} onClose={() => setShowUpload(false)} onUploaded={loadJobs} />}
      {showHistory && selectedJob && (
        <HistoryDialog jobId={selectedJob.id} jobName={selectedJob.name} onRestore={handleRestore} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}
