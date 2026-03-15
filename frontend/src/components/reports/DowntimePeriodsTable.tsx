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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = useCallback((p: DowntimePeriod) => {
    if (!p.alarm_history_id) return;
    setEditingId(p.alarm_history_id);
    setEditCode(p.reason_code || '');
    setEditText(p.reason_text || '');
  }, []);

  const saveAnnotation = useCallback(async () => {
    if (editingId == null) return;
    setSaving(true);
    try {
      await api.annotateDowntimePeriod(editingId, {
        reason_code: editCode || undefined,
        reason_text: editText || undefined,
      });
      setEditingId(null);
      onAnnotated();
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }, [editingId, editCode, editText, onAnnotated]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
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
              <th className="pb-2 pr-3">Fault</th>
              <th className="pb-2 pr-3">Start</th>
              <th className="pb-2 pr-3">End</th>
              <th className="pb-2 pr-3">Duration</th>
              <th className="pb-2 pr-3">Reason Code</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p, i) => (
              <tr key={`${p.alarm_history_id}-${i}`} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-1.5">
                    {p.is_exception && (
                      <span title="Exception fault (5-min cap)"><Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" /></span>
                    )}
                    <span className="text-slate-200">{p.tag_display_name || p.tag_name}</span>
                  </div>
                </td>
                <td className="py-2 pr-3 text-slate-400">{formatTime(p.start_time)}</td>
                <td className="py-2 pr-3 text-slate-400">{p.end_time ? formatTime(p.end_time) : <span className="text-amber-400">Ongoing</span>}</td>
                <td className="py-2 pr-3 text-slate-300">
                  {formatDuration(p.capped_duration_seconds)}
                  {p.is_exception && p.duration_seconds > p.capped_duration_seconds && (
                    <span className="text-xs text-amber-400 ml-1" title="Capped at 5 minutes">
                      (of {formatDuration(p.duration_seconds)})
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {editingId === p.alarm_history_id ? (
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
                  {editingId === p.alarm_history_id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={saveAnnotation}
                        disabled={saving}
                        className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-2 py-0.5 bg-slate-600 hover:bg-slate-500 rounded text-xs text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    p.alarm_history_id && (
                      <button
                        onClick={() => startEdit(p)}
                        className="flex items-center gap-1 px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300"
                        title="Tag with reason code"
                      >
                        <Tag className="w-3 h-3" /> Tag
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
