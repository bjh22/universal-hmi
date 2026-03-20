import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { TagsSettings } from '../components/settings/TagsSettings';
import { DataSourcesSettings } from '../components/settings/DataSourcesSettings';
import { UsersSettings } from '../components/settings/UsersSettings';
import { ThemeSettings } from '../components/settings/ThemeSettings';
import { AuditLogSettings } from '../components/settings/AuditLogSettings';
import { IntegrationsSettings, ReportingSettings } from '../components/settings/IntegrationsSettings';
import { TagPicker } from '../components/designer/TagPickerField';
import type { Tag, TagLabel, DataSourceData, AuditEntry, UserData, UserListEntry, TagValue } from '../types';

interface Props {
  user: UserData | null;
  tagValues: Record<string, TagValue>;
  onTagsChanged?: () => void;
}

// ─── Main SettingsPage ───
export function SettingsPage({ user, tagValues, onTagsChanged }: Props) {
  const [tab, setTab] = useState<'branding' | 'preferences' | 'tags' | 'datasources' | 'integrations' | 'reporting' | 'users' | 'audit' | 'system'>('tags');
  const [systemInfo, setSystemInfo] = useState<{
    app_version: string; platform: string; python_version: string;
    install_path: string; database_path: string; is_compiled: boolean;
    uptime_seconds: number | null;
  } | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceData[]>([]);
  const [users, setUsers] = useState<UserListEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [allLabels, setAllLabels] = useState<TagLabel[]>([]);
  const [plcVersionTag, setPlcVersionTag] = useState('');
  const [plcVersionSaved, setPlcVersionSaved] = useState(false);

  const canManage = ['engineer', 'designer'].includes(user?.role || '');

  const loadTags = useCallback(() => { api.getTags().then(t => { setTags(t); onTagsChanged?.(); }).catch(() => {}); }, [onTagsChanged]);
  const loadLabels = useCallback(() => { api.getTagLabels().then(setAllLabels).catch(() => {}); }, []);
  const loadDataSources = useCallback(() => { api.getDataSources().then(setDataSources).catch(() => {}); }, []);
  const refreshUsers = useCallback(() => { api.getUsers().then(setUsers).catch(() => {}); }, []);

  useEffect(() => {
    // Always load data sources so tag dialog can use them
    loadDataSources();
  }, [loadDataSources]);

  useEffect(() => {
    switch (tab) {
      case 'tags': loadTags(); loadLabels(); break;
      case 'datasources': loadDataSources(); loadTags(); break;
      case 'users': refreshUsers(); break;
      case 'audit': api.getAuditLog(500).then(setAuditLog).catch(() => {}); break;
      case 'system':
        api.getSystemInfo().then(setSystemInfo).catch(() => {});
        api.getSystemSettings().then(s => setPlcVersionTag(s.plc_version_tag || '')).catch(() => {});
        break;
    }
  }, [tab, loadTags, loadLabels, loadDataSources, refreshUsers]);

  const tabList = [
    { key: 'branding' as const, label: 'Branding' },
    { key: 'preferences' as const, label: 'Preferences' },
    { key: 'tags' as const, label: 'Tags' },
    { key: 'datasources' as const, label: 'Data Sources' },
    { key: 'integrations' as const, label: 'Integrations' },
    { key: 'reporting' as const, label: 'Reporting' },
    { key: 'users' as const, label: 'Users' },
    { key: 'audit' as const, label: 'Audit Trail' },
    { key: 'system' as const, label: 'System' },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--hmi-text-primary)] mb-4">Settings</h1>

      <div className="flex gap-2 mb-4 flex-wrap">
        {tabList.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-[var(--hmi-accent)] text-white' : 'bg-[var(--hmi-bg-elevated)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Branding & Preferences ═══ */}
      {(tab === 'branding' || tab === 'preferences') && (
        <ThemeSettings />
      )}

      {/* ═══ Tags ═══ */}
      {tab === 'tags' && (
        <TagsSettings
          tags={tags}
          dataSources={dataSources}
          allLabels={allLabels}
          tagValues={tagValues}
          canManage={canManage}
          loadTags={loadTags}
          loadLabels={loadLabels}
        />
      )}

      {/* ═══ Data Sources ═══ */}
      {tab === 'datasources' && (
        <DataSourcesSettings
          tags={tags}
          dataSources={dataSources}
          allLabels={allLabels}
          canManage={canManage}
          loadTags={loadTags}
          loadLabels={loadLabels}
          loadDataSources={loadDataSources}
        />
      )}

      {/* ═══ Integrations ═══ */}
      {tab === 'integrations' && (
        <IntegrationsSettings tagValues={tagValues} canManage={canManage} />
      )}

      {/* ═══ Reporting ═══ */}
      {tab === 'reporting' && (
        <ReportingSettings />
      )}

      {/* ═══ Users ═══ */}
      {tab === 'users' && (
        <UsersSettings
          user={user}
          users={users}
          canManage={canManage}
          refreshUsers={refreshUsers}
        />
      )}

      {/* ═══ Audit Trail ═══ */}
      {tab === 'audit' && (
        <AuditLogSettings auditLog={auditLog} />
      )}

      {/* ═══ System ═══ */}
      {tab === 'system' && (
        <div className="space-y-6 max-w-2xl">
          <div className="bg-[var(--hmi-bg-surface)] rounded-lg border border-[var(--hmi-border)] p-6">
            <h2 className="text-lg font-semibold text-[var(--hmi-text-primary)] mb-4">System Information</h2>
            {systemInfo ? (
              <div className="space-y-0">
                {([
                  ['HMI Version', systemInfo.app_version],
                  ['PLC Program Version', plcVersionTag ? (tagValues[plcVersionTag]?.value ?? '—') : '—'],
                  ['Platform', systemInfo.platform],
                  ['Python', systemInfo.python_version],
                  ['Install Type', systemInfo.is_compiled ? 'Compiled' : 'Source'],
                  ['Install Path', systemInfo.install_path],
                  ['Database', systemInfo.database_path],
                  ['Uptime', systemInfo.uptime_seconds != null
                    ? `${Math.floor(systemInfo.uptime_seconds / 3600)}h ${Math.floor((systemInfo.uptime_seconds % 3600) / 60)}m`
                    : 'N/A'],
                ] as const).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between py-3 border-b border-[var(--hmi-border-subtle)]">
                    <span className="text-sm text-[var(--hmi-text-secondary)]">{label}</span>
                    <span className="text-sm font-mono text-[var(--hmi-text-primary)]">{String(value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--hmi-text-muted)]">Loading...</p>
            )}
          </div>

          {canManage && (
            <div className="bg-[var(--hmi-bg-surface)] rounded-lg border border-[var(--hmi-border)] p-6">
              <h2 className="text-lg font-semibold text-[var(--hmi-text-primary)] mb-4">System Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--hmi-text-secondary)] mb-1">PLC Version Tag</label>
                  <p className="text-xs text-[var(--hmi-text-muted)] mb-2">Select a string tag from your PLC that contains the program version.</p>
                  <TagPicker value={plcVersionTag} onChange={(v) => { setPlcVersionTag(v); setPlcVersionSaved(false); }} />
                </div>
                <button
                  onClick={() => {
                    api.updateSystemSettings({ plc_version_tag: plcVersionTag || null })
                      .then(() => { setPlcVersionSaved(true); setTimeout(() => setPlcVersionSaved(false), 2000); })
                      .catch(() => {});
                  }}
                  className="px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-medium bg-[var(--hmi-accent)] text-white hover:opacity-90 transition-opacity"
                >
                  {plcVersionSaved ? 'Saved!' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
