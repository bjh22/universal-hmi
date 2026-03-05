import { useEffect, useState, useMemo } from 'react';
import { Search, Download, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import type { Tag, DataSourceData, AuditEntry, UserData } from '../types';

interface Props {
  user: UserData | null;
}

export function SettingsPage({ user }: Props) {
  const [tab, setTab] = useState<'tags' | 'datasources' | 'users' | 'audit'>('tags');
  const [tags, setTags] = useState<Tag[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceData[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  // Tag search/filter
  const [tagSearch, setTagSearch] = useState('');
  const [tagGroupFilter, setTagGroupFilter] = useState('all');

  // Audit filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');

  // User create
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', display_name: '', password: '', role: 'operator', login_mode: 'password' });

  useEffect(() => {
    switch (tab) {
      case 'tags': api.getTags().then(setTags).catch(() => {}); break;
      case 'datasources': api.getDataSources().then(setDataSources).catch(() => {}); break;
      case 'users': api.getUsers().then(setUsers).catch(() => {}); break;
      case 'audit': api.getAuditLog(500).then(setAuditLog).catch(() => {}); break;
    }
  }, [tab]);

  const tagGroups = useMemo(() => {
    const groups = new Set(tags.map(t => t.group_name).filter(Boolean));
    return Array.from(groups).sort() as string[];
  }, [tags]);

  const filteredTags = useMemo(() => {
    return tags.filter(t => {
      if (tagGroupFilter !== 'all' && t.group_name !== tagGroupFilter) return false;
      if (tagSearch) {
        const q = tagSearch.toLowerCase();
        return t.name.toLowerCase().includes(q) ||
               (t.description || '').toLowerCase().includes(q) ||
               (t.group_name || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [tags, tagSearch, tagGroupFilter]);

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
    } catch (err: any) {
      alert(err.message);
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
        <div>
          <div className="flex gap-3 mb-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search tags..."
                value={tagSearch}
                onChange={e => setTagSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>
            <select
              value={tagGroupFilter}
              onChange={e => setTagGroupFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none"
            >
              <option value="all">All Groups</option>
              {tagGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <span className="self-center text-xs text-slate-500">{filteredTags.length} / {tags.length} tags</span>
          </div>
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
                {filteredTags.map((tag) => (
                  <tr key={tag.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-4 py-2">
                      <div className="text-slate-200">{tag.name}</div>
                      {tag.description && <div className="text-[10px] text-slate-500 truncate max-w-48">{tag.description}</div>}
                    </td>
                    <td className="px-4 py-2 text-slate-400">{tag.group_name || '\u2014'}</td>
                    <td className="px-4 py-2 text-slate-400">{tag.data_type}</td>
                    <td className="px-4 py-2 text-slate-400">{tag.access_mode}</td>
                    <td className="px-4 py-2 text-slate-400">{tag.engineering_units || '\u2014'}</td>
                    <td className="px-4 py-2 text-center">{tag.trending_enabled ? '\u2713' : ''}</td>
                    <td className="px-4 py-2 text-center">{tag.alarm_enabled ? '\u2713' : ''}</td>
                    <td className="px-4 py-2 text-center">{tag.simulation_enabled ? '\u2713' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                <div className="text-xs text-slate-400">{ds.protocol} {'\u2022'} {ds.enabled ? 'Enabled' : 'Disabled'}</div>
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
        <div>
          <div className="flex justify-end mb-3">
            {['engineer', 'designer'].includes(user?.role || '') && (
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
                {users.map((u: any) => (
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

      {/* Audit Trail */}
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
