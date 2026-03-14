import { useEffect, useState, useCallback, useMemo } from 'react';
import { Wrench, ChevronDown, ChevronRight, Tag as TagIcon, Pencil, Save, X, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '../lib/api';
import { getTagDisplayName } from '../lib/tagDisplayName';
import { NumericKeypad, AlphaKeyboard } from '../components/widgets/TouchInput';
import type { Tag, TagValue, UserData, ServiceConfig } from '../types';

const SERVICE_LABEL = 'Service';
const INPUT_LABEL = 'Input';
const OUTPUT_LABEL = 'Output';

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

function hasLabel(tag: Tag, labelName: string): boolean {
  return tag.labels?.some(l => l.name === labelName) ?? false;
}

function groupServiceTags(
  tags: Tag[],
  orderConfig: Record<string, string[]>,
): { group: string; tags: Tag[] }[] {
  const groups = new Map<string, Tag[]>();
  for (const t of tags) {
    const otherLabels = t.labels?.filter(l => l.name !== SERVICE_LABEL).map(l => l.name).sort() || [];
    const g = otherLabels.length > 0 ? otherLabels.join(', ') : 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(t);
  }

  // Apply saved ordering within each group
  for (const [groupName, tagList] of groups) {
    const savedOrder = orderConfig[groupName];
    if (savedOrder && savedOrder.length > 0) {
      const orderMap = new Map(savedOrder.map((name, idx) => [name, idx]));
      tagList.sort((a, b) => {
        const ai = orderMap.get(a.name) ?? 999;
        const bi = orderMap.get(b.name) ?? 999;
        return ai - bi;
      });
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b))
    .map(([group, tags]) => ({ group, tags }));
}

function formatValue(tag: Tag, value: unknown): string {
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
}

export function ServicePage({ user, tagValues }: Props) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [keypad, setKeypad] = useState<{ tag: string; kind: 'numeric' | 'alpha' } | null>(null);

  // Service config from server
  const [serviceConfig, setServiceConfig] = useState<ServiceConfig>({ overrides: {}, order: {} });

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editOverrides, setEditOverrides] = useState<Record<string, { mode: 'momentary' | 'toggle' }>>({});
  const [editOrder, setEditOrder] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  const canAccess = ['engineer', 'designer'].includes(user?.role || '');

  const loadTags = useCallback(async () => {
    try {
      const tags = await api.getTags();
      setAllTags(tags);
    } catch {
      // ignore
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await api.getServiceConfig();
      setServiceConfig(cfg);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { loadTags(); loadConfig(); }, [loadTags, loadConfig]);

  const inputTags = useMemo(
    () => allTags.filter(t => hasLabel(t, INPUT_LABEL)),
    [allTags],
  );

  const outputTags = useMemo(
    () => allTags.filter(t => hasLabel(t, OUTPUT_LABEL)),
    [allTags],
  );

  const serviceTags = useMemo(
    () => allTags.filter(t => hasLabel(t, SERVICE_LABEL)),
    [allTags],
  );

  const activeOrder = editMode ? editOrder : serviceConfig.order;
  const serviceGroups = useMemo(() => groupServiceTags(serviceTags, activeOrder), [serviceTags, activeOrder]);

  const getMode = useCallback((tagName: string): 'momentary' | 'toggle' => {
    if (editMode) {
      return editOverrides[tagName]?.mode ?? 'momentary';
    }
    return serviceConfig.overrides[tagName]?.mode ?? 'momentary';
  }, [editMode, editOverrides, serviceConfig.overrides]);

  // Edit mode actions
  const enterEditMode = useCallback(() => {
    // Clone current config into edit state
    const overrides: Record<string, { mode: 'momentary' | 'toggle' }> = {};
    for (const [name, o] of Object.entries(serviceConfig.overrides)) {
      overrides[name] = { mode: o.mode };
    }
    setEditOverrides(overrides);
    setEditOrder({ ...serviceConfig.order });
    setEditMode(true);
  }, [serviceConfig]);

  const cancelEdit = useCallback(() => {
    setEditMode(false);
    setEditOverrides({});
    setEditOrder({});
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const cfg = await api.updateServiceConfig({ overrides: editOverrides, order: editOrder });
      setServiceConfig(cfg);
      setEditMode(false);
      setEditOverrides({});
      setEditOrder({});
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [editOverrides, editOrder]);

  const setTagMode = useCallback((tagName: string, mode: 'momentary' | 'toggle') => {
    setEditOverrides(prev => ({
      ...prev,
      [tagName]: { mode },
    }));
  }, []);

  const moveTag = useCallback((groupName: string, tagName: string, direction: -1 | 1) => {
    setEditOrder(prev => {
      // Get current order for this group from edit state, or build from current tags
      const group = serviceGroups.find(g => g.group === groupName);
      if (!group) return prev;
      const current = prev[groupName] || group.tags.map(t => t.name);
      const idx = current.indexOf(tagName);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= current.length) return prev;
      const next = [...current];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return { ...prev, [groupName]: next };
    });
  }, [serviceGroups]);

  const toggleGroup = useCallback((group: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }, []);

  const handleToggle = useCallback(async (tagName: string, currentValue: unknown) => {
    try {
      await api.writeTag(tagName, !Boolean(currentValue));
    } catch {
      // ignore
    }
  }, []);

  const handleMomentaryPress = useCallback(async (tagName: string) => {
    try {
      await api.writeTag(tagName, true);
    } catch {
      // ignore
    }
  }, []);

  const handleMomentaryRelease = useCallback(async (tagName: string) => {
    try {
      await api.writeTag(tagName, false);
    } catch {
      // ignore
    }
  }, []);

  const handleWrite = useCallback(async (tagName: string, value: unknown) => {
    try {
      await api.writeTag(tagName, value);
    } catch {
      // ignore
    }
  }, []);

  const openKeypad = useCallback((tagName: string) => {
    const current = tagValues[tagName]?.value;
    const isNumeric = typeof current === 'number' || (typeof current === 'string' && current !== '' && !isNaN(Number(current)));
    setKeypad({ tag: tagName, kind: isNumeric || current == null || current === '' ? 'numeric' : 'alpha' });
  }, [tagValues]);

  if (!canAccess) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-16">
        <Wrench size={40} className="mx-auto mb-4 text-slate-600" />
        <p className="text-base text-slate-400">Service controls require Engineer or Designer access.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Wrench size={28} className="text-slate-400" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-white">Service</h1>
          <p className="text-sm text-slate-400">Manual actuation and I/O monitoring</p>
        </div>
        {!editMode && (
          <button
            onClick={enterEditMode}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors"
          >
            <Pencil size={16} />
            Configure
          </button>
        )}
        {editMode && (
          <div className="flex items-center gap-2">
            <button
              onClick={cancelEdit}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
            >
              <X size={16} />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              <Save size={16} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* I/O Monitor */}
      <div className="mb-8">
        <h2 className="text-lg font-medium text-slate-300 mb-3">I/O Monitor</h2>
        {inputTags.length === 0 && outputTags.length === 0 ? (
          <div className="text-center py-10">
            <TagIcon size={32} className="mx-auto mb-3 text-slate-600" />
            <p className="text-sm text-slate-400">
              No I/O tags found. Add the <span className="text-blue-400 font-medium">{INPUT_LABEL}</span> or <span className="text-blue-400 font-medium">{OUTPUT_LABEL}</span> label to tags in Settings.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Inputs */}
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider">Inputs</h3>
              {inputTags.length === 0 ? (
                <div className="bg-slate-900 rounded-lg border border-slate-700 px-5 py-6 text-center text-sm text-slate-500">
                  No tags labelled &quot;{INPUT_LABEL}&quot;
                </div>
              ) : (
                <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {inputTags.map(tag => {
                        const value = tagValues[tag.name]?.value;
                        const isBool = tag.data_type === 'bool';
                        return (
                          <tr key={tag.name} className="border-b border-slate-700/50 last:border-b-0">
                            <td className="px-4 py-2.5 text-slate-300">{tag.display_name || tag.name}</td>
                            <td className="px-4 py-2.5 text-right">
                              {isBool ? (
                                <span className={`font-medium ${Boolean(value) ? 'text-green-400' : 'text-slate-500'}`}>
                                  {Boolean(value) ? 'ON' : 'OFF'}
                                </span>
                              ) : (
                                <span className="text-slate-200">{formatValue(tag, value)}</span>
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

            {/* Outputs */}
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider">Outputs</h3>
              {outputTags.length === 0 ? (
                <div className="bg-slate-900 rounded-lg border border-slate-700 px-5 py-6 text-center text-sm text-slate-500">
                  No tags labelled &quot;{OUTPUT_LABEL}&quot;
                </div>
              ) : (
                <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {outputTags.map(tag => {
                        const value = tagValues[tag.name]?.value;
                        const isBool = tag.data_type === 'bool';
                        return (
                          <tr key={tag.name} className="border-b border-slate-700/50 last:border-b-0">
                            <td className="px-4 py-2.5 text-slate-300">{tag.display_name || tag.name}</td>
                            <td className="px-4 py-2.5 text-right">
                              {isBool ? (
                                <span className={`font-medium ${Boolean(value) ? 'text-green-400' : 'text-slate-500'}`}>
                                  {Boolean(value) ? 'ON' : 'OFF'}
                                </span>
                              ) : (
                                <span className="text-slate-200">{formatValue(tag, value)}</span>
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
          </div>
        )}
      </div>

      {/* Service Controls */}
      <div>
        <h2 className="text-lg font-medium text-slate-300 mb-3">Service Controls</h2>
        {serviceTags.length === 0 ? (
          <div className="text-center py-10">
            <TagIcon size={32} className="mx-auto mb-3 text-slate-600" />
            <p className="text-sm text-slate-400">
              No service controls found. Add the <span className="text-blue-400 font-medium">{SERVICE_LABEL}</span> label to tags in Settings.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {serviceGroups.map(({ group, tags: groupTags }) => (
              <div key={group}>
                <button
                  onClick={() => toggleGroup(group)}
                  className="flex items-center gap-2 w-full py-3 min-h-[48px] text-sm font-medium text-slate-400 hover:text-slate-200 active:bg-slate-700/50 transition-colors rounded-lg"
                >
                  {collapsed.has(group) ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                  {group}
                  <span className="text-slate-500 ml-1">({groupTags.length})</span>
                </button>
                {!collapsed.has(group) && (
                  <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                    <table className="w-full text-base">
                      <tbody>
                        {groupTags.map((tag, tagIdx) => {
                          const liveValue = tagValues[tag.name]?.value;
                          const isBool = tag.data_type === 'bool';
                          const isWritable = tag.access_mode === 'write' || tag.access_mode === 'read_write';
                          const mode = getMode(tag.name);

                          // Enum mapping
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
                                {editMode ? (
                                  /* Edit mode: show mode selector and reorder buttons */
                                  <div className="flex items-center justify-end gap-2">
                                    {isBool && isWritable && (
                                      <select
                                        value={mode}
                                        onChange={e => setTagMode(tag.name, e.target.value as 'momentary' | 'toggle')}
                                        className="bg-slate-700 border border-slate-600 rounded-md px-2 py-1.5 text-sm text-white"
                                      >
                                        <option value="momentary">Momentary</option>
                                        <option value="toggle">Toggle</option>
                                      </select>
                                    )}
                                    {!isBool && (
                                      <span className="text-sm text-slate-500 mr-2">
                                        {tag.data_type}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => moveTag(group, tag.name, -1)}
                                      disabled={tagIdx === 0}
                                      className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-30 transition-colors"
                                    >
                                      <ArrowUp size={16} className="text-slate-400" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveTag(group, tag.name, 1)}
                                      disabled={tagIdx === groupTags.length - 1}
                                      className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-30 transition-colors"
                                    >
                                      <ArrowDown size={16} className="text-slate-400" />
                                    </button>
                                  </div>
                                ) : isBool && isWritable && mode === 'toggle' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggle(tag.name, liveValue)}
                                    className="inline-flex items-center gap-3 min-h-[48px] px-3 py-2"
                                  >
                                    <div className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${Boolean(liveValue) ? 'bg-green-500' : 'bg-slate-600'}`}>
                                      <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm"
                                        style={{ left: Boolean(liveValue) ? '1.5rem' : '0.125rem' }} />
                                    </div>
                                    <span className={`text-sm font-medium ${Boolean(liveValue) ? 'text-green-400' : 'text-slate-500'}`}>
                                      {Boolean(liveValue) ? 'ON' : 'OFF'}
                                    </span>
                                  </button>
                                ) : isBool && isWritable ? (
                                  <button
                                    type="button"
                                    onPointerDown={() => handleMomentaryPress(tag.name)}
                                    onPointerUp={() => handleMomentaryRelease(tag.name)}
                                    onPointerLeave={() => { if (Boolean(liveValue)) handleMomentaryRelease(tag.name); }}
                                    className={`inline-flex items-center justify-center min-h-[48px] min-w-[100px] px-4 py-2 rounded-lg font-medium text-sm transition-all select-none ${
                                      Boolean(liveValue)
                                        ? 'bg-green-600 text-white shadow-inner'
                                        : 'bg-slate-600 text-slate-300 hover:bg-slate-500 active:bg-green-600 active:text-white'
                                    }`}
                                  >
                                    {Boolean(liveValue) ? 'ON' : 'PRESS'}
                                  </button>
                                ) : isBool ? (
                                  <span className={`font-medium ${Boolean(liveValue) ? 'text-green-400' : 'text-slate-500'}`}>
                                    {Boolean(liveValue) ? 'ON' : 'OFF'}
                                  </span>
                                ) : hasEnum && isWritable ? (
                                  <select
                                    value={String(liveValue ?? '')}
                                    onChange={e => handleWrite(tag.name, parseTypedValue(e.target.value))}
                                    className="min-h-[48px] min-w-[120px] bg-slate-700 border border-slate-600 rounded-md px-3 py-3 text-base text-white hover:border-blue-500 transition-all"
                                  >
                                    <option value="">Select…</option>
                                    {Object.entries(enumMap!).map(([k, label]) => (
                                      <option key={k} value={k}>{label}</option>
                                    ))}
                                  </select>
                                ) : isWritable ? (
                                  <button
                                    type="button"
                                    onClick={() => openKeypad(tag.name)}
                                    className="inline-flex items-center min-h-[48px] min-w-[120px] bg-slate-700 border border-slate-600 rounded-md px-3 py-3 text-base text-white text-left hover:border-blue-500 active:scale-95 transition-all"
                                  >
                                    {liveValue != null && liveValue !== '' ? (
                                      <span>{formatValue(tag, liveValue)}</span>
                                    ) : (
                                      <span className="text-slate-500">Tap to set</span>
                                    )}
                                  </button>
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
        )}
      </div>

      {/* Keypads */}
      {keypad?.kind === 'numeric' && (
        <NumericKeypad
          value={String(tagValues[keypad.tag]?.value ?? '')}
          title={getTagDisplayName(keypad.tag, allTags) || 'Value'}
          onSubmit={val => { handleWrite(keypad.tag, parseTypedValue(val)); setKeypad(null); }}
          onClose={() => setKeypad(null)}
        />
      )}
      {keypad?.kind === 'alpha' && (
        <AlphaKeyboard
          value={String(tagValues[keypad.tag]?.value ?? '')}
          title={getTagDisplayName(keypad.tag, allTags) || 'Value'}
          onSubmit={val => { handleWrite(keypad.tag, parseTypedValue(val)); setKeypad(null); }}
          onClose={() => setKeypad(null)}
        />
      )}
    </div>
  );
}
