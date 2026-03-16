import { useState, useMemo, useCallback } from 'react';
import { Search, Download } from 'lucide-react';
import type { AuditEntry } from '../../types';

export interface AuditLogSettingsProps {
  auditLog: AuditEntry[];
}

export function AuditLogSettings({ auditLog }: AuditLogSettingsProps) {
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');

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

  const exportAuditCsv = useCallback(() => {
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
  }, [filteredAudit]);

  return (
    <div>
      <div className="flex gap-3 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--hmi-text-muted)]" />
          <input
            type="text"
            placeholder="Search audit log..."
            value={auditSearch}
            onChange={e => setAuditSearch(e.target.value)}
            className="w-full bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] rounded-lg pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={auditActionFilter}
          onChange={e => setAuditActionFilter(e.target.value)}
          className="bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] rounded-lg px-3 py-2 text-sm text-[var(--hmi-text-secondary)] outline-none"
        >
          <option value="all">All Actions</option>
          {auditActions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button
          onClick={exportAuditCsv}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--hmi-bg-input)] hover:bg-[var(--hmi-border-subtle)] text-[var(--hmi-text-secondary)] rounded-lg text-sm"
        >
          <Download size={16} /> Export CSV
        </button>
      </div>
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hmi-border)] text-[var(--hmi-text-secondary)]">
              <th className="text-left px-4 py-3 font-medium">Time</th>
              <th className="text-left px-4 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Action</th>
              <th className="text-left px-4 py-3 font-medium">Details</th>
              <th className="text-left px-4 py-3 font-medium">Source IP</th>
            </tr>
          </thead>
          <tbody>
            {filteredAudit.map((entry) => (
              <tr key={entry.id} className="border-b border-[var(--hmi-border)]/50 hover:bg-[var(--hmi-bg-input)]/30">
                <td className="px-4 py-2 text-[var(--hmi-text-secondary)] whitespace-nowrap">{new Date(entry.timestamp).toLocaleString()}</td>
                <td className="px-4 py-2 text-[var(--hmi-text-secondary)]">{entry.user || '\u2014'}</td>
                <td className="px-4 py-2 text-[var(--hmi-text-secondary)]">{entry.action}</td>
                <td className="px-4 py-2 text-[var(--hmi-text-secondary)] truncate max-w-md">{entry.details || '\u2014'}</td>
                <td className="px-4 py-2 text-[var(--hmi-text-muted)] text-xs">{entry.source_ip || '\u2014'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
