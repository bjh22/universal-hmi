import { useState, useCallback, useEffect } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import type { TagValue } from '../../types';

interface Props {
  tagPrefix: string;
  tagValues: Record<string, TagValue>;
}

export function DataManControls({ tagPrefix, tagValues }: Props) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const tv = (suffix: string) => tagValues[`${tagPrefix}.${suffix}`]?.value;

  const status = tv('status') as string || 'Unknown';
  const lastResult = tv('last_result') as string || '—';
  const lastResultTime = tv('last_result_time') as string || '';
  const totalReads = tv('total_reads') as number ?? 0;
  const deviceType = tv('device_type') as string || '—';
  const firmware = tv('firmware') as string || '—';

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const handleRefreshImage = useCallback(async () => {
    setBusy('image');
    try {
      const blob = await api.datamanGetImage();
      if (blob) {
        setImageUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      } else {
        showMessage('error', 'No image available');
      }
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Failed to load image');
    }
    setBusy('');
  }, [showMessage]);

  const handleTrigger = useCallback(async () => {
    setBusy('trigger');
    try {
      await api.datamanTrigger();
      showMessage('success', 'Trigger sent');
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Failed');
    }
    setBusy('');
  }, [showMessage]);

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
          <div className={`text-sm font-medium ${status === 'Connected' ? 'text-green-400' : status.startsWith('Error') ? 'text-red-400' : 'text-yellow-400'}`}>
            {status}
          </div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Total Reads</div>
          <div className="text-sm font-medium text-slate-200">{totalReads}</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Device Type</div>
          <div className="text-sm font-medium text-slate-200 truncate" title={deviceType}>{deviceType}</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Firmware</div>
          <div className="text-sm font-medium text-slate-200 truncate" title={firmware}>{firmware}</div>
        </div>
      </div>

      {/* Last Result */}
      <div className="bg-slate-700/50 rounded-lg p-3">
        <div className="text-xs text-slate-400 mb-1">Last Barcode Result</div>
        <div className="text-sm font-mono font-medium text-slate-200 break-all">{lastResult}</div>
        {lastResultTime && (
          <div className="text-xs text-slate-500 mt-1">{lastResultTime}</div>
        )}
      </div>

      {/* Image */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Last Captured Image</div>
          <button
            onClick={handleRefreshImage}
            disabled={busy === 'image'}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={12} className={busy === 'image' ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        {imageUrl ? (
          <div className="bg-slate-700/50 rounded-lg p-2">
            <img
              src={imageUrl}
              alt="Last captured image"
              className="w-full rounded"
            />
          </div>
        ) : (
          <div className="bg-slate-700/50 rounded-lg p-6 text-center text-sm text-slate-500">
            No image loaded. Click Refresh to load the last captured image.
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-3">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Controls</div>
        <button
          onClick={handleTrigger}
          disabled={busy === 'trigger'}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium w-full justify-center"
        >
          <Camera size={14} />
          {busy === 'trigger' ? 'Triggering...' : 'Manual Trigger'}
        </button>
      </div>
    </div>
  );
}
