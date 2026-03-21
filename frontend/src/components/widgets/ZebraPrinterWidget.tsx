import { memo, useState, useCallback } from 'react';
import { AlertTriangle, Pause, Send } from 'lucide-react';
import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';
import { api } from '../../lib/api';

interface Props {
  title: string;
  tagPrefix: string;
  showControls?: boolean;
  showFaults?: boolean;
  tagValues: Record<string, TagValue>;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export const ZebraPrinterWidget = memo(function ZebraPrinterWidget({
  title, tagPrefix, showControls = false, showFaults = true,
  tagValues, titleStyle, valueStyle, chrome = 'full',
}: Props) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const tv = (suffix: string) => tagValues[`${tagPrefix}.${suffix}`]?.value;

  const status = tv('status') as string || 'Unknown';
  const labelsInQueue = tv('labels_in_queue') as number ?? 0;
  const printSpeed = tv('print_speed') as number ?? 0;
  const darkness = tv('darkness') as number ?? 0;
  const headOpen = tv('head_open') as boolean ?? false;
  const paperOut = tv('paper_out') as boolean ?? false;
  const ribbonOut = tv('ribbon_out') as boolean ?? false;
  const paused = tv('paused') as boolean ?? false;

  const isReady = status === 'Ready' || status === 'Connected';
  const hasError = status.startsWith('Error');
  const hasFault = headOpen || paperOut || ribbonOut;

  const statusColor = isReady
    ? 'text-green-400'
    : hasError || hasFault ? 'text-red-400' : 'text-yellow-400';

  const statusDot = isReady
    ? 'bg-green-400'
    : hasError || hasFault ? 'bg-red-400' : 'bg-yellow-400';

  const clearMsg = useCallback(() => {
    setTimeout(() => { setError(null); setSuccess(null); }, 3000);
  }, []);

  const handleTestLabel = useCallback(async () => {
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      await api.zebraSendTestLabel();
      setSuccess('Test label sent');
      clearMsg();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
      clearMsg();
    }
    setSending(false);
  }, [clearMsg]);

  const handleSetSpeed = useCallback(async (speed: number) => {
    try {
      await api.zebraSetSpeed(speed);
    } catch {
      // transient
    }
  }, []);

  const handleSetDarkness = useCallback(async (dark: number) => {
    try {
      await api.zebraSetDarkness(dark);
    } catch {
      // transient
    }
  }, []);

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col overflow-hidden`}>
      {shouldShowTitle(chrome) && (
        <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>
      )}

      <div className="flex-1 flex flex-col gap-2 min-h-0" style={textStyleToCSS(valueStyle)}>
        {/* Status bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${statusDot}`} />
            <span className={`text-xs font-medium ${statusColor}`}>{status}</span>
          </div>
          {paused && (
            <span className="flex items-center gap-1 text-xs text-yellow-400">
              <Pause size={10} /> Paused
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="bg-slate-700/50 rounded-lg px-2 py-1.5 text-center">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Queue</div>
            <div className="text-sm font-mono font-medium text-white">{labelsInQueue}</div>
          </div>
          <div className="bg-slate-700/50 rounded-lg px-2 py-1.5 text-center">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Speed</div>
            <div className="text-sm font-mono font-medium text-white">{printSpeed} in/s</div>
          </div>
          <div className="bg-slate-700/50 rounded-lg px-2 py-1.5 text-center">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Dark</div>
            <div className="text-sm font-mono font-medium text-white">{darkness}</div>
          </div>
        </div>

        {/* Fault indicators */}
        {showFaults && hasFault && (
          <div className="flex flex-wrap gap-1.5">
            {headOpen && (
              <span className="flex items-center gap-1 text-[10px] bg-red-900/50 text-red-300 rounded px-1.5 py-0.5">
                <AlertTriangle size={10} /> Head Open
              </span>
            )}
            {paperOut && (
              <span className="flex items-center gap-1 text-[10px] bg-red-900/50 text-red-300 rounded px-1.5 py-0.5">
                <AlertTriangle size={10} /> Paper Out
              </span>
            )}
            {ribbonOut && (
              <span className="flex items-center gap-1 text-[10px] bg-red-900/50 text-red-300 rounded px-1.5 py-0.5">
                <AlertTriangle size={10} /> Ribbon Out
              </span>
            )}
          </div>
        )}

        {/* Controls section */}
        {showControls && (
          <div className="flex flex-col gap-2 mt-auto">
            {/* Speed slider */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 w-10 shrink-0">Speed</span>
              <input
                type="range" min={2} max={14} step={1}
                value={printSpeed || 6}
                onChange={e => handleSetSpeed(Number(e.target.value))}
                className="flex-1 accent-blue-500 h-1"
              />
              <span className="text-[10px] text-slate-300 w-8 text-right">{printSpeed || 6}</span>
            </div>
            {/* Darkness slider */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 w-10 shrink-0">Dark</span>
              <input
                type="range" min={0} max={30} step={1}
                value={darkness || 15}
                onChange={e => handleSetDarkness(Number(e.target.value))}
                className="flex-1 accent-blue-500 h-1"
              />
              <span className="text-[10px] text-slate-300 w-8 text-right">{darkness || 15}</span>
            </div>
            {/* Test label button */}
            <button
              onClick={handleTestLabel}
              disabled={sending || (!isReady && !paused)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium"
            >
              <Send size={12} />
              {sending ? 'Sending...' : 'Test Label'}
            </button>
            {/* Feedback */}
            {error && <span className="text-[10px] text-red-400 text-center">{error}</span>}
            {success && <span className="text-[10px] text-green-400 text-center">{success}</span>}
          </div>
        )}
      </div>
    </div>
  );
});
