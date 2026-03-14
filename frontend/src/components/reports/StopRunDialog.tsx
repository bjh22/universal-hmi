import { useState, useCallback } from 'react';
import { api } from '../../lib/api';
import { Dialog } from '../Dialog';
import type { ProductionRun } from '../../types';

interface Props {
  run: ProductionRun;
  onClose: () => void;
  onStopped: () => void;
}

export function StopRunDialog({ run, onClose, onStopped }: Props) {
  const isTagDriven = !!run.good_count_tag;
  const [goodCount, setGoodCount] = useState(String(run.good_count));
  const [rejectCount, setRejectCount] = useState(String(run.reject_count));
  const [targetCount, setTargetCount] = useState(run.target_count != null ? String(run.target_count) : '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await api.stopProductionRun(run.id, {
        good_count: parseInt(goodCount, 10) || 0,
        reject_count: parseInt(rejectCount, 10) || 0,
        target_count: targetCount ? parseInt(targetCount, 10) : undefined,
      });
      onStopped();
    } catch {
      setSubmitting(false);
    }
  }, [run.id, goodCount, rejectCount, targetCount, onStopped]);

  return (
    <Dialog title="Stop Production Run" onClose={onClose}>
      <p className="text-xs text-slate-400 mb-3">Finalize counts for: {run.job_name || `Run #${run.id}`}</p>
      {isTagDriven && (
        <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-2.5 mb-3">
          <p className="text-xs text-blue-300">
            Good count will be computed automatically from tag <span className="font-mono">{run.good_count_tag}</span>.
            Enter a value below to override.
          </p>
        </div>
      )}
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Good Count {isTagDriven && '(override)'}
          </label>
          <input type="number" value={goodCount} onChange={e => setGoodCount(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Reject Count</label>
          <input type="number" value={rejectCount} onChange={e => setRejectCount(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Target Count (optional)</label>
          <input type="number" value={targetCount} onChange={e => setTargetCount(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancel</button>
        <button onClick={handleSubmit} disabled={submitting} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm disabled:opacity-50">
          {submitting ? 'Stopping...' : 'Stop Run'}
        </button>
      </div>
    </Dialog>
  );
}
