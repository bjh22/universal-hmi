import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Tag, DataSourceData, AuditEntry } from '../types';

export function SettingsPage() {
  const [tab, setTab] = useState<'tags' | 'datasources' | 'users' | 'audit'>('tags');
  const [tags, setTags] = useState<Tag[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceData[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  useEffect(() => {
    switch (tab) {
      case 'tags': api.getTags().then(setTags).catch(() => {}); break;
      case 'datasources': api.getDataSources().then(setDataSources).catch(() => {}); break;
      case 'users': api.getUsers().then(setUsers).catch(() => {}); break;
      case 'audit': api.getAuditLog().then(setAuditLog).catch(() => {}); break;
    }
  }, [tab]);

  const tabs = [
    { key: 'tags' as const, label: 'Tags' },
    { key: 'datasources' as const, label: 'Data Sources' },
    { key: 'users' as const, label: 'Users' },
    { key: 'audit' as const, label: 'Audit Trail' },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-100 mb-4">Settings</h1>

      <div className="flex gap-1 mb-4">
        {tabs.map((t) => (
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

      {/* Tags */}
      {tab === 'tags' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Group</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Access</th>
                <th className="text-left px-4 py-3 font-medium">Units</th>
                <th className="text-center px-4 py-3 font-medium">Trend</th>
                <th className="text-center px-4 py-3 font-medium">Alarm</th>
                <th className="text-center px-4 py-3 font-medium">Sim</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="px-4 py-2 text-slate-200">{tag.name}</td>
                  <td className="px-4 py-2 text-slate-400">{tag.group_name || '—'}</td>
                  <td className="px-4 py-2 text-slate-400">{tag.data_type}</td>
                  <td className="px-4 py-2 text-slate-400">{tag.access_mode}</td>
                  <td className="px-4 py-2 text-slate-400">{tag.engineering_units || '—'}</td>
                  <td className="px-4 py-2 text-center">{tag.trending_enabled ? '✓' : ''}</td>
                  <td className="px-4 py-2 text-center">{tag.alarm_enabled ? '✓' : ''}</td>
                  <td className="px-4 py-2 text-center">{tag.simulation_enabled ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Data Sources */}
      {tab === 'datasources' && (
        <div className="space-y-2">
          {dataSources.map((ds) => (
            <div key={ds.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full ${ds.connected ? 'bg-green-400' : 'bg-red-400'}`} />
              <div className="flex-1">
                <div className="font-medium text-slate-200">{ds.name}</div>
                <div className="text-xs text-slate-400">{ds.protocol} • {ds.enabled ? 'Enabled' : 'Disabled'}</div>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${ds.connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {ds.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          ))}
          {dataSources.length === 0 && <p className="text-slate-500 text-center py-8">No data sources configured</p>}
        </div>
      )}

      {/* Users */}
      {tab === 'users' && (
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
              {users.map((u: any) => (
                <tr key={u.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="px-4 py-2 text-slate-200">{u.username}</td>
                  <td className="px-4 py-2 text-slate-300">{u.display_name}</td>
                  <td className="px-4 py-2 capitalize text-slate-400">{u.role}</td>
                  <td className="px-4 py-2 text-center">{u.is_active ? '✓' : '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit Trail */}
      {tab === 'audit' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-left px-4 py-3 font-medium">Time</th>
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
                <th className="text-left px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="px-4 py-2 text-slate-300 whitespace-nowrap">{new Date(entry.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-2 text-slate-300">{entry.user || '—'}</td>
                  <td className="px-4 py-2 text-slate-400">{entry.action}</td>
                  <td className="px-4 py-2 text-slate-400 truncate max-w-md">{entry.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
