import { useEffect, useState, useCallback } from 'react';
import {
  GitBranch, GitCommitHorizontal, Upload, Download, RefreshCw,
  ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Info,
  FilePlus, FilePenLine, FileX, FileQuestion,
} from 'lucide-react';
import { api } from '../lib/api';
import type { GitStatus, GitCommitEntry, GitOperationResult, GitChangedFile } from '../types';

interface Props {
  onSaveFirst: () => Promise<void>;
  disabled: boolean;
}

const btnSm = 'px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export function GitPanel({ onSaveFirst, disabled }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [log, setLog] = useState<GitCommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showChanges, setShowChanges] = useState(true);
  const [showCommit, setShowCommit] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GitOperationResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const s = await api.getGitStatus();
      setStatus(s);
      if (s.available) {
        const l = await api.getGitLog(10);
        setLog(l);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const clearResult = useCallback(() => {
    setTimeout(() => setResult(null), 5000);
  }, []);

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      await onSaveFirst();
      const r = await api.gitCommit(commitMsg.trim());
      setResult(r);
      if (r.success) {
        setCommitMsg('');
        setShowCommit(false);
        await refresh();
      }
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : 'Commit failed' });
    } finally {
      setBusy(false);
      clearResult();
    }
  }, [commitMsg, onSaveFirst, refresh, clearResult]);

  const handlePush = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.gitPush();
      setResult(r);
      if (r.success) await refresh();
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : 'Push failed' });
    } finally {
      setBusy(false);
      clearResult();
    }
  }, [refresh, clearResult]);

  const handlePull = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.gitPull();
      setResult(r);
      if (r.success) await refresh();
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : 'Pull failed' });
    } finally {
      setBusy(false);
      clearResult();
    }
  }, [refresh, clearResult]);

  if (loading && !status) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
        <div className="text-sm text-slate-400">Checking version control...</div>
      </div>
    );
  }

  if (!status || !status.available) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch size={16} className="text-slate-500" />
          <span className="text-sm font-medium text-slate-400">Version Control</span>
        </div>
        <div className="bg-slate-900 rounded-md p-3">
          <div className="flex items-start gap-2">
            <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
            <div className="text-xs text-slate-400 space-y-1">
              <p>To share projects with your team via git:</p>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Create a shared GitHub repo (e.g., <code className="text-slate-300">your-org/hmi-projects</code>)</li>
                <li>Clone it to your machine</li>
                <li>Set <code className="text-slate-300">HMI_PROJECTS_DIR</code> to the cloned repo path</li>
                <li>Restart the HMI server</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isBusy = busy || disabled;

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 space-y-3">
      {/* Header + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <GitBranch size={16} className="text-purple-400" />
            <span className="text-sm font-medium text-white">{status.branch}</span>
          </div>
          {status.dirty && (
            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
              Unsaved changes
            </span>
          )}
          {status.has_remote && (status.ahead > 0 || status.behind > 0) && (
            <span className="text-xs text-slate-400">
              {status.ahead > 0 && <span className="text-green-400">{status.ahead} ahead</span>}
              {status.ahead > 0 && status.behind > 0 && ', '}
              {status.behind > 0 && <span className="text-orange-400">{status.behind} behind</span>}
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={isBusy}
          className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          title="Refresh status"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Changed files */}
      {status.dirty && status.changed_files.length > 0 && (
        <div>
          <button
            onClick={() => setShowChanges(!showChanges)}
            className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            {showChanges ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {status.changed_files.length} changed file{status.changed_files.length !== 1 ? 's' : ''}
          </button>
          {showChanges && (
            <div className="mt-1.5 space-y-0.5">
              {status.changed_files.map((f: GitChangedFile) => (
                <div key={f.file} className="flex items-center gap-2 text-xs py-0.5 px-2 rounded bg-slate-900">
                  <FileStatusIcon status={f.status} />
                  <span className="text-slate-300 truncate">{f.file}</span>
                  <span className={`shrink-0 ml-auto ${statusColor(f.status)}`}>{f.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowCommit(!showCommit)}
          disabled={isBusy}
          className={`${btnSm} ${status.dirty ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
        >
          <span className="flex items-center gap-1.5">
            <GitCommitHorizontal size={14} />
            Commit
          </span>
        </button>
        <button
          onClick={handlePush}
          disabled={isBusy || (!status.dirty && status.ahead === 0)}
          className={`${btnSm} bg-blue-600 hover:bg-blue-700 text-white`}
          title={status.ahead > 0 ? `Push ${status.ahead} commit(s) to remote` : 'Nothing to push'}
        >
          <span className="flex items-center gap-1.5">
            <Upload size={14} />
            Push
          </span>
        </button>
        <button
          onClick={handlePull}
          disabled={isBusy}
          className={`${btnSm} bg-slate-700 hover:bg-slate-600 text-slate-200`}
        >
          <span className="flex items-center gap-1.5">
            <Download size={14} />
            Pull
          </span>
        </button>
      </div>

      {/* Commit input */}
      {showCommit && (
        <div className="flex gap-2">
          <input
            type="text"
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCommit(); }}
            placeholder="Commit message..."
            maxLength={200}
            className="flex-1 bg-slate-700 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500"
            disabled={isBusy}
            autoFocus
          />
          <button
            onClick={handleCommit}
            disabled={isBusy || !commitMsg.trim()}
            className={`${btnSm} bg-green-600 hover:bg-green-700 text-white`}
          >
            {busy ? 'Committing...' : 'Confirm'}
          </button>
        </div>
      )}

      {/* Result message */}
      {result && (
        <div className={`flex items-start gap-2 text-xs rounded-md p-2 ${
          result.success
            ? 'bg-green-500/10 text-green-400'
            : 'bg-red-500/10 text-red-400'
        }`}>
          {result.success ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
          <div>
            <div>{result.message}</div>
            {result.details && <div className="text-slate-500 mt-0.5">{result.details}</div>}
          </div>
        </div>
      )}

      {/* Commit history */}
      {log.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
          >
            {showHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Recent commits ({log.length})
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {log.map(c => (
                <div key={c.hash} className="flex items-baseline gap-2 text-xs py-1 px-2 rounded bg-slate-900">
                  <code className="text-purple-400 shrink-0">{c.short}</code>
                  <span className="text-slate-300 truncate">{c.message}</span>
                  <span className="text-slate-500 shrink-0 ml-auto">{formatRelative(c.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'added': case 'new': return <FilePlus size={13} className="text-green-400 shrink-0" />;
    case 'modified': return <FilePenLine size={13} className="text-amber-400 shrink-0" />;
    case 'deleted': return <FileX size={13} className="text-red-400 shrink-0" />;
    default: return <FileQuestion size={13} className="text-slate-400 shrink-0" />;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'added': case 'new': return 'text-green-400';
    case 'modified': return 'text-amber-400';
    case 'deleted': return 'text-red-400';
    default: return 'text-slate-400';
  }
}

function formatRelative(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}
