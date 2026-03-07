import { useState, useCallback } from 'react';
import { Printer, Send, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import type { TagValue } from '../../types';

interface Props {
  tagPrefix: string;
  tagValues: Record<string, TagValue>;
}

export function ZebraControls({ tagPrefix, tagValues }: Props) {
  const [speed, setSpeed] = useState('');
  const [darkness, setDarkness] = useState('');
  const [zpl, setZpl] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const tv = (suffix: string) => tagValues[`${tagPrefix}.${suffix}`]?.value;

  const status = tv('status') as string || 'Unknown';
  const labelsInQueue = tv('labels_in_queue') as number ?? 0;
  const headOpen = tv('head_open') as boolean ?? false;
  const paperOut = tv('paper_out') as boolean ?? false;
  const ribbonOut = tv('ribbon_out') as boolean ?? false;
  const paused = tv('paused') as boolean ?? false;
  const currentSpeed = tv('print_speed') as number ?? 0;
  const currentDarkness = tv('darkness') as number ?? 0;

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  const handleSendTestLabel = useCallback(async () => {
    setBusy('test');
    try {
      await api.zebraSendTestLabel();
      showMessage('success', 'Test label sent');
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Failed');
    }
    setBusy('');
  }, [showMessage]);

  const handleSetSpeed = useCallback(async () => {
    const s = parseInt(speed);
    if (isNaN(s) || s < 2 || s > 14) {
      showMessage('error', 'Speed must be 2-14');
      return;
    }
    setBusy('speed');
    try {
      await api.zebraSetSpeed(s);
      showMessage('success', `Speed set to ${s}`);
      setSpeed('');
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Failed');
    }
    setBusy('');
  }, [speed, showMessage]);

  const handleSetDarkness = useCallback(async () => {
    const d = parseInt(darkness);
    if (isNaN(d) || d < 0 || d > 30) {
      showMessage('error', 'Darkness must be 0-30');
      return;
    }
    setBusy('darkness');
    try {
      await api.zebraSetDarkness(d);
      showMessage('success', `Darkness set to ${d}`);
      setDarkness('');
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Failed');
    }
    setBusy('');
  }, [darkness, showMessage]);

  const handleSendZpl = useCallback(async () => {
    if (!zpl.trim()) return;
    setBusy('zpl');
    try {
      await api.zebraSendZpl(zpl);
      showMessage('success', 'ZPL sent');
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Failed');
    }
    setBusy('');
  }, [zpl, showMessage]);

  const faultActive = headOpen || paperOut || ribbonOut || paused;

  return (
    <div className="space-y-4">
      {message && (
        <div className={`text-sm px-3 py-2 rounded-lg ${message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Status Overview */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Status</div>
          <div className={`text-sm font-medium ${status === 'Ready' ? 'text-green-400' : status.startsWith('Error') ? 'text-red-400' : 'text-yellow-400'}`}>
            {status}
          </div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Labels in Queue</div>
          <div className="text-sm font-medium text-slate-200">{labelsInQueue}</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Print Speed</div>
          <div className="text-sm font-medium text-slate-200">{currentSpeed > 0 ? `${currentSpeed} in/s` : '—'}</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Darkness</div>
          <div className="text-sm font-medium text-slate-200">{currentDarkness > 0 ? currentDarkness : '—'}</div>
        </div>
      </div>

      {/* Fault Indicators */}
      {faultActive && (
        <div className="flex flex-wrap gap-2">
          {headOpen && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-500/20 text-red-400">
              <AlertTriangle size={12} /> Head Open
            </span>
          )}
          {paperOut && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-500/20 text-red-400">
              <AlertTriangle size={12} /> Paper Out
            </span>
          )}
          {ribbonOut && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-500/20 text-red-400">
              <AlertTriangle size={12} /> Ribbon Out
            </span>
          )}
          {paused && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400">
              <AlertTriangle size={12} /> Paused
            </span>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="space-y-3">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Controls</div>

        {/* Send Test Label */}
        <button
          onClick={handleSendTestLabel}
          disabled={busy === 'test'}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium w-full justify-center"
        >
          <Printer size={14} />
          {busy === 'test' ? 'Sending...' : 'Send Test Label'}
        </button>

        {/* Print Speed */}
        <div className="flex gap-2">
          <input
            type="number"
            min={2}
            max={14}
            placeholder={`Speed (2-14)${currentSpeed > 0 ? ` — current: ${currentSpeed}` : ''}`}
            value={speed}
            onChange={e => setSpeed(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder:text-slate-500"
          />
          <button
            onClick={handleSetSpeed}
            disabled={busy === 'speed' || !speed}
            className="px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-lg text-sm"
          >
            Set
          </button>
        </div>

        {/* Darkness */}
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            max={30}
            placeholder={`Darkness (0-30)${currentDarkness > 0 ? ` — current: ${currentDarkness}` : ''}`}
            value={darkness}
            onChange={e => setDarkness(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder:text-slate-500"
          />
          <button
            onClick={handleSetDarkness}
            disabled={busy === 'darkness' || !darkness}
            className="px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-lg text-sm"
          >
            Set
          </button>
        </div>

        {/* Raw ZPL */}
        <div>
          <textarea
            placeholder="Enter raw ZPL (e.g. ^XA^FO50,50^A0N,50,50^FDHello^FS^XZ)"
            value={zpl}
            onChange={e => setZpl(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 font-mono"
          />
          <button
            onClick={handleSendZpl}
            disabled={busy === 'zpl' || !zpl.trim()}
            className="mt-1 flex items-center gap-2 px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-lg text-sm w-full justify-center"
          >
            <Send size={14} />
            {busy === 'zpl' ? 'Sending...' : 'Send ZPL'}
          </button>
        </div>
      </div>
    </div>
  );
}
