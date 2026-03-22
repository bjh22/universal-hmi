import { useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, X, Plug, Unplug, FolderSearch } from 'lucide-react';
import { api } from '../../lib/api';
import { PROTOCOL_CONFIGS } from '../../lib/protocolConfigs';
import { DeleteConfirmDialog, Field, inputCls } from './shared';
import { TouchTextInput } from '../widgets/TouchTextInput';
import { TagDialog, BrowseTagsDialog } from './TagsSettings';
import type { Tag, TagLabel, DataSourceData, ProtocolType } from '../../types';

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
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--hmi-text-primary)]">{form.id != null ? 'Edit Data Source' : 'New Data Source'}</h2>
          <button onClick={onClose} className="text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Name *">
            <TouchTextInput value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} className={inputCls} placeholder="e.g. PLC-01" title="Data Source Name" />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <label className="flex items-center gap-2 text-sm text-[var(--hmi-text-secondary)] cursor-pointer pt-2">
                <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} className="accent-blue-500" />
                {form.enabled ? 'Yes' : 'No'}
              </label>
            </Field>
          </div>

          {protoFields.length > 0 && (
            <fieldset className="border border-[var(--hmi-border)] rounded-lg p-3">
              <legend className="text-xs text-[var(--hmi-text-secondary)] px-2">Connection Settings</legend>
              <div className="space-y-3">
                {protoFields.map(f => (
                  <Field key={f.key} label={f.label}>
                    <TouchTextInput
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={String((form.config[f.key] as string) ?? '')}
                      onChange={v => setForm(prev => ({
                        ...prev,
                        config: { ...prev.config, [f.key]: f.type === 'number' ? (v ? Number(v) : '') : v },
                      }))}
                      className={inputCls}
                      placeholder={f.placeholder}
                      title={f.label}
                    />
                  </Field>
                ))}
              </div>
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

// ─── Data Sources Settings Tab ───
export interface DataSourcesSettingsProps {
  tags: Tag[];
  dataSources: DataSourceData[];
  allLabels: TagLabel[];
  canManage: boolean;
  loadTags: () => void;
  loadLabels: () => void;
  loadDataSources: () => void;
}

export function DataSourcesSettings({ tags, dataSources, allLabels, canManage, loadTags, loadLabels, loadDataSources }: DataSourcesSettingsProps) {
  const [editDs, setEditDs] = useState<{ id?: number; name: string; protocol: ProtocolType; enabled: boolean; config: Record<string, unknown> } | null>(null);
  const [deleteDsTarget, setDeleteDsTarget] = useState<DataSourceData | null>(null);
  const [browseDs, setBrowseDs] = useState<DataSourceData | null>(null);
  const [connectingId, setConnectingId] = useState<number | null>(null);
  const [editTag, setEditTag] = useState<(Omit<Tag, 'id'> & { id?: number }) | null>(null);

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

  const handleSaveTag = useCallback(async (data: Omit<Tag, 'id'> & { id?: number }) => {
    try {
      if (data.id != null) {
        await api.updateTag(data.id, data);
      } else {
        await api.createTag(data);
      }
      setEditTag(null);
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [loadTags]);

  return (
    <div>
      {canManage && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => setEditDs({ name: '', protocol: 'opcua', enabled: true, config: {} })}
            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] text-white rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> New Data Source
          </button>
        </div>
      )}
      <div className="space-y-2">
        {dataSources.map((ds) => (
          <div key={ds.id} className="bg-[var(--hmi-bg-elevated)] rounded-xl p-4 border border-[var(--hmi-border)] flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${ds.connected ? 'bg-green-400' : 'bg-red-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[var(--hmi-text-primary)]">{ds.name}</div>
              <div className="text-xs text-[var(--hmi-text-secondary)]">
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
                  className="p-1.5 text-[var(--hmi-text-muted)] hover:text-green-400 disabled:opacity-50"
                  title={ds.connected ? 'Reconnect' : 'Connect'}
                >
                  {connectingId === ds.id ? (
                    <span className="inline-block w-4 h-4 border-2 border-[var(--hmi-text-muted)] border-t-blue-400 rounded-full animate-spin" />
                  ) : ds.connected ? (
                    <Unplug size={16} />
                  ) : (
                    <Plug size={16} />
                  )}
                </button>
                {ds.connected && (
                  <button
                    onClick={() => setBrowseDs(ds)}
                    className="p-1.5 text-[var(--hmi-text-muted)] hover:text-blue-400"
                    title="Browse tags"
                  >
                    <FolderSearch size={16} />
                  </button>
                )}
                <button
                  onClick={() => setEditDs({ id: ds.id, name: ds.name, protocol: ds.protocol, enabled: ds.enabled, config: ds.config || {} })}
                  className="p-1.5 text-[var(--hmi-text-muted)] hover:text-blue-400"
                  title="Edit"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setDeleteDsTarget(ds)}
                  className="p-1.5 text-[var(--hmi-text-muted)] hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
        {dataSources.length === 0 && <p className="text-[var(--hmi-text-muted)] text-center py-8">No data sources configured</p>}
      </div>

      {editDs && <DataSourceDialog ds={editDs} onSave={handleSaveDs} onClose={() => setEditDs(null)} />}
      {deleteDsTarget && <DeleteConfirmDialog title="Delete Data Source" name={deleteDsTarget.name} onConfirm={handleDeleteDs} onCancel={() => setDeleteDsTarget(null)} />}
      {browseDs && <BrowseTagsDialog dsId={browseDs.id} dsName={browseDs.name} existingTags={tags} onCreateTag={(tagData) => { setEditTag(tagData); }} onClose={() => setBrowseDs(null)} />}
      {editTag && <TagDialog tag={editTag} dataSources={dataSources} allLabels={allLabels} onSave={handleSaveTag} onClose={() => setEditTag(null)} onLabelCreated={loadLabels} />}
    </div>
  );
}
