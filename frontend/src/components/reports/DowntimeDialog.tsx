import { useState, useCallback } from 'react';
import { api } from '../../lib/api';
import { Dialog } from '../Dialog';
import type { DowntimeEvent, ReasonCode } from '../../types';

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Props {
  runId: number;
  existing: DowntimeEvent | null;
  runStart: string;
  reasonCodes: ReasonCode[];
  onClose: () => void;
  onSaved: () => void;
}

export function DowntimeDialog({ runId, existing, runStart, reasonCodes, onClose, onSaved }: Props) {
  const defaultStart = existing?.start_time
    ? toLocalInput(existing.start_time)
    : toLocalInput(runStart);
  const defaultEnd = existing?.end_time
    ? toLocalInput(existing.end_time)
    : '';

  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const [reasonCode, setReasonCode] = useState(existing?.reason_code || '');
  const [reasonText, setReasonText] = useState(existing?.reason_text || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      if (existing) {
        await api.updateDowntimeEvent(existing.id, {
          start_time: new Date(startTime).toISOString(),
          end_time: endTime ? new Date(endTime).toISOString() : undefined,
          reason_code: reasonCode,
          reason_text: reasonText,
        });
      } else {
        await api.createDowntimeEvent({
          production_run_id: runId,
          start_time: new Date(startTime).toISOString(),
          end_time: endTime ? new Date(endTime).toISOString() : undefined,
          reason_code: reasonCode || undefined,
          reason_text: reasonText || undefined,
        });
      }
      onSaved();
    } catch {
      setSubmitting(false);
    }
  }, [existing, runId, startTime, endTime, reasonCode, reasonText, onSaved]);

  return (
    <Dialog title={existing ? 'Edit Downtime Event' : 'Add Downtime Event'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Start Time</label>
          <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">End Time</label>
          <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Reason Code</label>
          {reasonCodes.length > 0 ? (
            <select
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
            >
              <option value="">Select reason...</option>
              {reasonCodes.map(rc => (
                <option key={rc.id} value={rc.code}>
                  {rc.code}{rc.description ? ` — ${rc.description}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <input type="text" value={reasonCode} onChange={e => setReasonCode(e.target.value)} placeholder="e.g. MECH_FAIL, MATERIAL, CHANGEOVER" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
          )}
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Notes</label>
          <textarea value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="Description of downtime reason" rows={2} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancel</button>
        <button onClick={handleSubmit} disabled={submitting} className="px-3 py-1.5 bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-hover)] text-white rounded-lg text-sm disabled:opacity-50">
          {submitting ? 'Saving...' : existing ? 'Update' : 'Add'}
        </button>
      </div>
    </Dialog>
  );
}
