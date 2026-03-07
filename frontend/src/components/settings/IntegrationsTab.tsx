import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Power, PowerOff, X } from 'lucide-react';
import { api } from '../../lib/api';
import { ZebraControls } from './ZebraControls';
import { DataManControls } from './DataManControls';
import type { IntegrationType, IntegrationData, TagValue } from '../../types';

interface Props {
  tagValues: Record<string, TagValue>;
  canManage: boolean;
}

export function IntegrationsTab({ tagValues, canManage }: Props) {
  const [types, setTypes] = useState<IntegrationType[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationData[]>([]);
  const [editIntegration, setEditIntegration] = useState<Partial<IntegrationData> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IntegrationData | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [t, i] = await Promise.all([
      api.getIntegrationTypes(),
      api.getIntegrations(),
    ]);
    setTypes(t);
    setIntegrations(i);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [t, i] = await Promise.all([
        api.getIntegrationTypes(),
        api.getIntegrations(),
      ]);
      if (!cancelled) {
        setTypes(t);
        setIntegrations(i);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = useCallback(async () => {
    if (!editIntegration) return;
    try {
      if (editIntegration.id) {
        await api.updateIntegration(editIntegration.id, {
          name: editIntegration.name || '',
          enabled: editIntegration.enabled || false,
          config: editIntegration.config || {},
        });
      } else {
        await api.createIntegration({
          type_name: editIntegration.type_name || '',
          name: editIntegration.name || '',
          enabled: editIntegration.enabled || false,
          config: editIntegration.config || {},
        });
      }
      setEditIntegration(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save');
    }
  }, [editIntegration, load]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteIntegration(deleteTarget.id);
      setDeleteTarget(null);
      if (expandedId === deleteTarget.id) setExpandedId(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete');
    }
  }, [deleteTarget, expandedId, load]);

  const handleToggleEnabled = useCallback(async (integ: IntegrationData) => {
    try {
      await api.updateIntegration(integ.id, {
        name: integ.name,
        enabled: !integ.enabled,
        config: integ.config,
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update');
    }
  }, [load]);

  const openNew = useCallback(() => {
    const firstType = types[0];
    if (!firstType) return;
    setEditIntegration({
      type_name: firstType.type_name,
      name: '',
      enabled: false,
      config: { ...firstType.default_config },
    });
  }, [types]);

  const statusColor = (status: string) => {
    if (status === 'running') return 'bg-green-400';
    if (status === 'error') return 'bg-red-400';
    return 'bg-slate-500';
  };

  const statusBadge = (status: string) => {
    if (status === 'running') return 'bg-green-500/20 text-green-400';
    if (status === 'error') return 'bg-red-500/20 text-red-400';
    return 'bg-slate-500/20 text-slate-400';
  };

  const statusLabel = (status: string) => {
    if (status === 'running') return 'Running';
    if (status === 'error') return 'Error';
    return 'Stopped';
  };

  const getTypeDisplayName = (typeName: string) => {
    return types.find(t => t.type_name === typeName)?.display_name || typeName;
  };

  return (
    <div>
      {canManage && (
        <div className="flex justify-end mb-3">
          <button
            onClick={openNew}
            disabled={types.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> Add Integration
          </button>
        </div>
      )}

      <div className="space-y-2">
        {integrations.map((integ) => (
          <div key={integ.id}>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${statusColor(integ.status)}`} />
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => setExpandedId(expandedId === integ.id ? null : integ.id)}
              >
                <div className="font-medium text-slate-200">{integ.name}</div>
                <div className="text-xs text-slate-400">
                  {getTypeDisplayName(integ.type_name)} {'\u2022'} {integ.enabled ? 'Enabled' : 'Disabled'}
                  {integ.status_message && (
                    <span className="ml-1 text-red-400"> {'\u2022'} {integ.status_message}</span>
                  )}
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded flex-shrink-0 ${statusBadge(integ.status)}`}>
                {statusLabel(integ.status)}
              </span>
              {canManage && (
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleToggleEnabled(integ)}
                    className={`p-1.5 ${integ.enabled ? 'text-green-400 hover:text-red-400' : 'text-slate-500 hover:text-green-400'}`}
                    title={integ.enabled ? 'Disable' : 'Enable'}
                  >
                    {integ.enabled ? <Power size={16} /> : <PowerOff size={16} />}
                  </button>
                  <button
                    onClick={() => setEditIntegration({ ...integ })}
                    className="p-1.5 text-slate-500 hover:text-blue-400"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(integ)}
                    className="p-1.5 text-slate-500 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
            {/* Expanded controls */}
            {expandedId === integ.id && (
              <div className="bg-slate-800/50 border border-slate-700 border-t-0 rounded-b-xl p-4">
                {integ.type_name === 'zebra_printer' && (
                  <ZebraControls
                    tagPrefix={(integ.config?.tag_prefix as string) || 'zebra'}
                    tagValues={tagValues}
                  />
                )}
                {integ.type_name === 'ftp_hot_folder' && (
                  <FtpStatusPanel
                    tagPrefix={(integ.config?.tag_prefix as string) || 'ftp'}
                    tagValues={tagValues}
                    ftpPort={integ.config?.ftp_port as number}
                  />
                )}
                {integ.type_name === 'cognex_dataman' && (
                  <DataManControls
                    tagPrefix={(integ.config?.tag_prefix as string) || 'dataman'}
                    tagValues={tagValues}
                  />
                )}
                {integ.type_name !== 'zebra_printer' && integ.type_name !== 'ftp_hot_folder' && integ.type_name !== 'cognex_dataman' && (
                  <p className="text-sm text-slate-500">No controls available for this integration type.</p>
                )}
              </div>
            )}
          </div>
        ))}
        {integrations.length === 0 && (
          <p className="text-slate-500 text-center py-8">
            No integrations configured.
            {types.length > 0 && ' Click "Add Integration" to get started.'}
          </p>
        )}
      </div>

      {/* Edit / Create Dialog */}
      {editIntegration && (
        <IntegrationDialog
          integration={editIntegration}
          types={types}
          onSave={handleSave}
          onChange={setEditIntegration}
          onClose={() => setEditIntegration(null)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-slate-100 font-medium mb-2">Delete Integration</div>
            <p className="text-sm text-slate-400 mb-4">
              Are you sure you want to delete <span className="text-slate-200 font-mono">{deleteTarget.name}</span>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={handleDelete} className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function FtpStatusPanel({ tagPrefix, tagValues, ftpPort }: {
  tagPrefix: string;
  tagValues: Record<string, TagValue>;
  ftpPort?: number;
}) {
  const tv = (suffix: string) => tagValues[`${tagPrefix}.${suffix}`]?.value;

  const status = tv('status') as string || 'Unknown';
  const filesProcessed = tv('files_processed') as number ?? 0;
  const lastFile = tv('last_file') as string || '—';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Status</div>
          <div className={`text-sm font-medium ${status.startsWith('Listening') ? 'text-green-400' : status.startsWith('Error') || status.startsWith('Print error') ? 'text-red-400' : 'text-slate-300'}`}>
            {status}
          </div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Files Processed</div>
          <div className="text-sm font-medium text-slate-200">{filesProcessed}</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Last File</div>
          <div className="text-sm font-medium text-slate-200 truncate" title={lastFile}>{lastFile}</div>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Upload ZPL files via FTP{ftpPort ? ` (port ${ftpPort})` : ''} and they will be sent to the configured printer automatically.
      </p>
    </div>
  );
}


function IntegrationDialog({ integration, types, onSave, onChange, onClose }: {
  integration: Partial<IntegrationData>;
  types: IntegrationType[];
  onSave: () => void;
  onChange: (v: Partial<IntegrationData>) => void;
  onClose: () => void;
}) {
  const isNew = !integration.id;
  const selectedType = types.find(t => t.type_name === integration.type_name);

  const updateConfig = (key: string, value: string) => {
    const config = { ...integration.config };
    // Try to preserve types from default_config
    const defaultVal = selectedType?.default_config?.[key];
    if (typeof defaultVal === 'number') {
      const n = Number(value);
      if (!isNaN(n)) {
        config[key] = n;
      } else {
        config[key] = value;
      }
    } else {
      config[key] = value;
    }
    onChange({ ...integration, config });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-slate-100 font-medium">{isNew ? 'Add Integration' : 'Edit Integration'}</div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          {/* Type selector (only for new) */}
          {isNew && (
            <div>
              <label className="text-xs text-slate-400">Type</label>
              <select
                value={integration.type_name || ''}
                onChange={e => {
                  const t = types.find(t => t.type_name === e.target.value);
                  onChange({
                    ...integration,
                    type_name: e.target.value,
                    config: t ? { ...t.default_config } : {},
                  });
                }}
                className="w-full mt-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200"
              >
                {types.map(t => (
                  <option key={t.type_name} value={t.type_name}>{t.display_name}</option>
                ))}
              </select>
              {selectedType && (
                <p className="text-xs text-slate-500 mt-1">{selectedType.description}</p>
              )}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-xs text-slate-400">Name</label>
            <input
              value={integration.name || ''}
              onChange={e => onChange({ ...integration, name: e.target.value })}
              placeholder="e.g. Line 1 Printer"
              className="w-full mt-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder:text-slate-500"
            />
          </div>

          {/* Enabled */}
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={integration.enabled || false}
              onChange={e => onChange({ ...integration, enabled: e.target.checked })}
              className="rounded"
            />
            Enabled
          </label>

          {/* Dynamic config fields */}
          {selectedType && Object.entries(selectedType.default_config).map(([key, defaultVal]) => (
            <div key={key}>
              <label className="text-xs text-slate-400">{key.replace(/_/g, ' ')}</label>
              <input
                value={String(integration.config?.[key] ?? defaultVal ?? '')}
                onChange={e => updateConfig(key, e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button
            onClick={onSave}
            disabled={!integration.name?.trim()}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg"
          >
            {isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
