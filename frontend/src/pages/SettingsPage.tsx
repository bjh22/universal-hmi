import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { TagsSettings } from '../components/settings/TagsSettings';
import { DataSourcesSettings } from '../components/settings/DataSourcesSettings';
import { UsersSettings } from '../components/settings/UsersSettings';
import { ThemeSettings } from '../components/settings/ThemeSettings';
import { AuditLogSettings } from '../components/settings/AuditLogSettings';
import { IntegrationsSettings, ReportingSettings } from '../components/settings/IntegrationsSettings';
import type { Tag, TagLabel, DataSourceData, AuditEntry, UserData, UserListEntry, TagValue } from '../types';

interface Props {
  user: UserData | null;
  tagValues: Record<string, TagValue>;
  onTagsChanged?: () => void;
}

// ─── Main SettingsPage ───
export function SettingsPage({ user, tagValues, onTagsChanged }: Props) {
  const [tab, setTab] = useState<'branding' | 'preferences' | 'tags' | 'datasources' | 'integrations' | 'reporting' | 'users' | 'audit'>('tags');
  const [tags, setTags] = useState<Tag[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceData[]>([]);
  const [users, setUsers] = useState<UserListEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [allLabels, setAllLabels] = useState<TagLabel[]>([]);

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

    </div>
  );
}
