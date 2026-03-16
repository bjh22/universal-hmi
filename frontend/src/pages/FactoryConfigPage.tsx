import { useEffect, useState, useCallback, useMemo } from 'react';
import { Cog, Edit, Save, X, ChevronDown, ChevronRight, Tag as TagIcon, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { getTagDisplayName } from '../lib/tagDisplayName';
import { NumericKeypad, AlphaKeyboard } from '../components/widgets/TouchInput';
import type { Tag, TagValue, UserData } from '../types';

const LABEL_NAME = 'Factory Config';

interface Props {
  user: UserData | null;
  tagValues: Record<string, TagValue>;
}

function parseTypedValue(val: string): unknown {
  if (val === 'true') return true;
  if (val === 'false') return false;
  const num = Number(val);
  if (!isNaN(num) && val.trim() !== '') return num;
  return val;
}

function groupTags(tags: Tag[]): { group: string; tags: Tag[] }[] {
  const groups = new Map<string, Tag[]>();
  for (const t of tags) {
    const labelNames = t.labels?.filter(l => l.name !== LABEL_NAME).map(l => l.name).sort() || [];
    const g = labelNames.length > 0 ? labelNames.join(', ') : 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(t);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b))
    .map(([group, tags]) => ({ group, tags }));
}

export function FactoryConfigPage({ user, tagValues }: Props) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [keypad, setKeypad] = useState<{ tag: string; kind: 'numeric' | 'alpha' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canEdit = ['engineer', 'designer'].includes(user?.role || '');

  const loadTags = useCallback(async () => {
    try {
      const tags = await api.getTags();
      setAllTags(tags);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { loadTags(); }, [loadTags]);

  const factoryTags = useMemo(
    () => allTags.filter(t => t.labels?.some(l => l.name === LABEL_NAME)),
    [allTags],
  );

  const grouped = useMemo(() => groupTags(factoryTags), [factoryTags]);

  const enterEditMode = useCallback(() => {
    const vals: Record<string, unknown> = {};
    for (const t of factoryTags) {
      const tv = tagValues[t.name];
      vals[t.name] = tv?.value ?? '';
    }
    setEditValues(vals);
    setEditMode(true);
    setError(null);
  }, [factoryTags, tagValues]);

  const cancelEdit = useCallback(() => {
    setEditMode(false);
    setEditValues({});
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const writes: Promise<unknown>[] = [];
      for (const t of factoryTags) {
        const newVal = editValues[t.name];
        const curVal = tagValues[t.name]?.value;
        if (newVal !== curVal && !(newVal === '' && curVal == null)) {
          writes.push(api.writeTag(t.name, newVal));
        }
      }
      await Promise.all(writes);
      setEditMode(false);
      setEditValues({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [factoryTags, editValues, tagValues]);

  const toggleGroup = useCallback((group: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }, []);

  const openKeypad = useCallback((tagName: string) => {
    const current = editValues[tagName];
    const isNumeric = typeof current === 'number' || (typeof current === 'string' && current !== '' && !isNaN(Number(current)));
    setKeypad({ tag: tagName, kind: isNumeric || current === '' || current == null ? 'numeric' : 'alpha' });
  }, [editValues]);

  const updateValue = useCallback((tagName: string, val: unknown) => {
    setEditValues(prev => ({ ...prev, [tagName]: val }));
  }, []);

  const formatValue = (tag: Tag, value: unknown): string => {
    if (value == null || value === '') return '—';
    if (tag.enum_mapping) {
      let em: Record<string, string> = {};
      try { em = typeof tag.enum_mapping === 'string' ? JSON.parse(tag.enum_mapping) : tag.enum_mapping; } catch { /* ignore */ }
      const mapped = em[String(value)];
      if (mapped) return mapped;
    }
    const formatted = typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(2) : String(value);
    if (tag.engineering_units) return `${formatted} ${tag.engineering_units}`;
    return formatted;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Cog size={28} className="text-slate-400" />
          <div>
            <h1 className="text-2xl font-semibold text-white">Factory Configuration</h1>
            <p className="text-sm text-slate-400">Parameters configured before machine shipment</p>
          </div>
        </div>
        {canEdit && !editMode && (
          <button
            onClick={enterEditMode}
            disabled={factoryTags.length === 0}
            className="flex items-center gap-2 px-5 py-3 min-h-[48px] bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-base font-medium rounded-lg transition-colors active:scale-95"
          >
            <Edit size={18} />
            Edit
          </button>
        )}
        {editMode && (
          <div className="flex gap-3">
            <button
              onClick={cancelEdit}
              className="flex items-center gap-2 px-5 py-3 min-h-[48px] bg-slate-700 hover:bg-slate-600 text-white text-base font-medium rounded-lg transition-colors active:scale-95"
            >
              <X size={18} />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-3 min-h-[48px] bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-base font-medium rounded-lg transition-colors active:scale-95"
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-base">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Empty state */}
      {factoryTags.length === 0 && (
        <div className="text-center py-16">
          <TagIcon size={40} className="mx-auto mb-4 text-slate-600" />
          <p className="text-base text-slate-400 mb-2">No factory configuration parameters found</p>
          <p className="text-sm text-slate-500">
            Add the <span className="text-blue-400 font-medium">{LABEL_NAME}</span> label to tags in Settings to include them here.
          </p>
        </div>
      )}

      {/* Grouped tag display */}
      <div className="space-y-4">
        {grouped.map(({ group, tags: groupTags }) => (
          <div key={group}>
            {grouped.length > 1 && (
              <button
                onClick={() => toggleGroup(group)}
                className="flex items-center gap-2 w-full py-3 min-h-[48px] text-sm font-medium text-slate-400 hover:text-slate-200 active:bg-slate-700/50 transition-colors rounded-lg"
              >
                {collapsed.has(group) ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                {group}
                <span className="text-slate-500 ml-1">({groupTags.length})</span>
              </button>
            )}
            {!collapsed.has(group) && (
              <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full text-base">
                  <tbody>
                    {groupTags.map(tag => {
                      const liveValue = tagValues[tag.name]?.value;
                      const isBool = tag.data_type === 'bool';

                      if (editMode) {
                        const editVal = editValues[tag.name];
                        let enumMap: Record<string, string> | null = null;
                        if (tag.enum_mapping) {
                          try { enumMap = typeof tag.enum_mapping === 'string' ? JSON.parse(tag.enum_mapping) : tag.enum_mapping; } catch { /* ignore */ }
                        }
                        const hasEnum = enumMap && Object.keys(enumMap).length > 0;
                        return (
                          <tr key={tag.name} className="border-b border-slate-700/50 last:border-b-0">
                            <td className="px-5 py-4 text-slate-300">
                              {tag.display_name || tag.name}
                              {tag.engineering_units && (
                                <span className="text-slate-500 ml-1">({tag.engineering_units})</span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-right">
                              {isBool ? (
                                <button
                                  type="button"
                                  onClick={() => updateValue(tag.name, !editVal)}
                                  className="inline-flex items-center gap-3 min-h-[48px] px-3 py-2"
                                >
                                  <div className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${editVal ? 'bg-green-500' : 'bg-slate-600'}`}>
                                    <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm"
                                      style={{ left: editVal ? '1.5rem' : '0.125rem' }} />
                                  </div>
                                  <span className={`text-sm font-medium ${editVal ? 'text-green-400' : 'text-slate-500'}`}>
                                    {editVal ? 'ON' : 'OFF'}
                                  </span>
                                </button>
                              ) : hasEnum ? (
                                <select
                                  value={String(editVal ?? '')}
                                  onChange={e => updateValue(tag.name, parseTypedValue(e.target.value))}
                                  className="min-h-[48px] min-w-[120px] bg-slate-700 border border-slate-600 rounded-md px-3 py-3 text-base text-white hover:border-blue-500 transition-all"
                                >
                                  <option value="">Select…</option>
                                  {Object.entries(enumMap!).map(([k, label]) => (
                                    <option key={k} value={k}>{label}</option>
                                  ))}
                                </select>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openKeypad(tag.name)}
                                  className="inline-flex items-center min-h-[48px] min-w-[120px] bg-slate-700 border border-slate-600 rounded-md px-3 py-3 text-base text-white text-left hover:border-blue-500 active:scale-95 transition-all"
                                >
                                  {editVal != null && editVal !== '' ? (
                                    <span>{String(editVal)}</span>
                                  ) : (
                                    <span className="text-slate-500">Tap to set</span>
                                  )}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      }

                      // View mode
                      return (
                        <tr key={tag.name} className="border-b border-slate-700/50 last:border-b-0">
                          <td className="px-5 py-4 text-slate-300">
                            {tag.display_name || tag.name}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {isBool ? (
                              <span className={`font-medium ${liveValue ? 'text-green-400' : 'text-slate-500'}`}>
                                {liveValue ? 'ON' : 'OFF'}
                              </span>
                            ) : (
                              <span className="text-slate-200">{formatValue(tag, liveValue)}</span>
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

      {/* Keypads */}
      {keypad?.kind === 'numeric' && (
        <NumericKeypad
          value={String(editValues[keypad.tag] ?? '')}
          title={getTagDisplayName(keypad.tag, allTags) || 'Value'}
          onSubmit={val => { updateValue(keypad.tag, parseTypedValue(val)); setKeypad(null); }}
          onClose={() => setKeypad(null)}
        />
      )}
      {keypad?.kind === 'alpha' && (
        <AlphaKeyboard
          value={String(editValues[keypad.tag] ?? '')}
          title={getTagDisplayName(keypad.tag, allTags) || 'Value'}
          onSubmit={val => { updateValue(keypad.tag, parseTypedValue(val)); setKeypad(null); }}
          onClose={() => setKeypad(null)}
        />
      )}
    </div>
  );
}
