import { useCallback, useState } from 'react';
import { Clock, AlertTriangle, Tag } from 'lucide-react';
import type { DowntimePeriod, ReasonCode } from '../../types';
import { api } from '../../lib/api';

interface Props {
  periods: DowntimePeriod[];
  reasonCodes: ReasonCode[];
  onAnnotated: () => void;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function DowntimePeriodsTable({ periods, reasonCodes, onAnnotated }: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const startEdit = useCallback((p: DowntimePeriod) => {
    setEditingKey(p.start_time);
    setEditCode(p.reason_code || '');
    setEditText(p.reason_text || '');
    setError('');
  }, []);

  const doSave = useCallback(async (p: DowntimePeriod) => {
    setSaving(true);
    setError('');
    try {
      await api.annotateDowntimePeriod({
        start_time: p.start_time,
        reason_code: editCode || undefined,
        reason_text: editText || undefined,
      });
      setEditingKey(null);
      onAnnotated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [editCode, editText, onAnnotated]);

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setError('');
  }, []);

  if (periods.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Downtime Periods
        </h3>
        <div className="text-center text-slate-500 py-4">No downtime events in this period</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> Downtime Periods ({periods.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs border-b border-slate-700">
              <th className="pb-2 pr-3">Faults</th>
              <th className="pb-2 pr-3">Start</th>
              <th className="pb-2 pr-3">End</th>
              <th className="pb-2 pr-3">Duration</th>
              <th className="pb-2 pr-3">Reason Code</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p, i) => {
              const isEditing = editingKey === p.start_time;
              const hasException = p.faults.some(f => f.is_exception);
              return (
                <tr key={`${p.start_time}-${i}`} className="border-b border-slate-700/50 hover:bg-slate-700/30 align-top">
                  <td className="py-2 pr-3">
                    <div className="flex flex-col gap-0.5">
                      {p.faults.map((f, fi) => (
                        <div key={`${f.tag_name}-${fi}`} className="flex items-center gap-1.5">
                          {f.is_exception && (
                            <span title="Exception fault (5-min cap)"><Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" /></span>
                          )}
                          <span className="text-slate-200 text-xs">{f.tag_display_name || f.tag_name}</span>
                          {!f.end_time && (
                            <span className="text-[10px] text-amber-400 font-medium">ACTIVE</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-slate-400">{formatTime(p.start_time)}</td>
                  <td className="py-2 pr-3 text-slate-400">{p.end_time ? formatTime(p.end_time) : <span className="text-amber-400">Ongoing</span>}</td>
                  <td className="py-2 pr-3 text-slate-300">
                    {formatDuration(p.capped_duration_seconds)}
                    {hasException && p.duration_seconds > p.capped_duration_seconds && (
                      <span className="text-xs text-amber-400 ml-1" title="Capped at 5 minutes">
                        (of {formatDuration(p.duration_seconds)})
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {isEditing ? (
                      <select
                        value={editCode}
                        onChange={e => setEditCode(e.target.value)}
                        className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 w-32"
                      >
                        <option value="">Unassigned</option>
                        {reasonCodes.map(rc => (
                          <option key={rc.id} value={rc.code}>{rc.code} - {rc.description || rc.code}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={p.reason_code ? 'text-blue-400' : 'text-slate-500 italic'}>
                        {p.reason_code || 'Unassigned'}
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => doSave(p)}
                          disabled={saving}
                          className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-2 py-0.5 bg-slate-600 hover:bg-slate-500 rounded text-xs text-white"
                        >
                          Cancel
                        </button>
                        {error && <span className="text-xs text-red-400 ml-1">{error}</span>}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="flex items-center gap-1 px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300"
                        title="Tag with reason code"
                      >
                        <Tag className="w-3 h-3" /> Tag
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
