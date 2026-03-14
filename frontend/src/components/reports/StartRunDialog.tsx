import { useState, useCallback } from 'react';
import { api } from '../../lib/api';
import { Dialog } from '../Dialog';
import type { JobData } from '../../types';

interface Props {
  jobs: JobData[];
  onClose: () => void;
  onStarted: () => void;
}

export function StartRunDialog({ jobs, onClose, onStarted }: Props) {
  const [jobName, setJobName] = useState('');
  const [shift, setShift] = useState('');
  const [targetCount, setTargetCount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.startProductionRun({
        job_name: jobName || undefined,
        shift: shift || undefined,
        target_count: targetCount ? parseInt(targetCount, 10) : undefined,
      });
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start run');
      setSubmitting(false);
    }
  }, [jobName, shift, targetCount, onStarted]);

  return (
    <Dialog title="Start Production Run" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Job</label>
          <select
            value={jobName}
            onChange={e => setJobName(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            <option value="">No job selected</option>
            {jobs.map(j => <option key={j.id} value={j.name}>{j.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Shift</label>
          <input
            type="text"
            value={shift}
            onChange={e => setShift(e.target.value)}
            placeholder="e.g. Day, Night, A, B, C"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Target Count (optional)</label>
          <input
            type="number"
            value={targetCount}
            onChange={e => setTargetCount(e.target.value)}
            placeholder="0"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
          />
        </div>
      </div>
      {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancel</button>
        <button onClick={handleSubmit} disabled={submitting} className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm disabled:opacity-50">
          {submitting ? 'Starting...' : 'Start Run'}
        </button>
      </div>
    </Dialog>
  );
}
