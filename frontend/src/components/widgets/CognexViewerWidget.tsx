import { memo, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, ScanBarcode } from 'lucide-react';
import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';
import { api } from '../../lib/api';

interface Props {
  title: string;
  tagPrefix: string;
  showImage?: boolean;
  showTrigger?: boolean;
  tagValues: Record<string, TagValue>;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export const CognexViewerWidget = memo(function CognexViewerWidget({
  title, tagPrefix, showImage = true, showTrigger = false,
  tagValues, titleStyle, valueStyle, chrome = 'full',
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tv = (suffix: string) => tagValues[`${tagPrefix}.${suffix}`]?.value;

  const status = tv('status') as string || 'Unknown';
  const lastResult = tv('last_result') as string || '';
  const lastResultTime = tv('last_result_time') as string || '';
  const totalReads = tv('total_reads') as number ?? 0;

  const statusColor = status === 'Connected'
    ? 'text-green-400'
    : status.startsWith('Error') ? 'text-red-400' : 'text-yellow-400';

  const statusDot = status === 'Connected'
    ? 'bg-green-400'
    : status.startsWith('Error') ? 'bg-red-400' : 'bg-yellow-400';

  // Clean up object URL on unmount or when URL changes
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const handleRefreshImage = useCallback(async () => {
    setLoadingImage(true);
    setError(null);
    try {
      const blob = await api.datamanGetImage();
      if (blob) {
        setImageUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      } else {
        setError('No image available');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load image');
    }
    setLoadingImage(false);
  }, []);

  const handleTrigger = useCallback(async () => {
    setTriggering(true);
    try {
      await api.datamanTrigger();
    } catch {
      // trigger errors are transient
    }
    setTriggering(false);
  }, []);

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col overflow-hidden`}>
      {shouldShowTitle(chrome) && (
        <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>
      )}

      <div className="flex-1 flex flex-col gap-2 min-h-0">
        {/* Status bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${statusDot}`} />
            <span className={`text-xs font-medium ${statusColor}`}>{status}</span>
          </div>
          <span className="text-xs text-slate-500">{totalReads} reads</span>
        </div>

        {/* Last barcode result */}
        <div className="bg-slate-700/50 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1">
            <ScanBarcode size={12} className="text-slate-400" />
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">Last Result</span>
          </div>
          <div className="text-sm font-mono font-medium text-white break-all" style={textStyleToCSS(valueStyle)}>
            {lastResult || '—'}
          </div>
          {lastResultTime && (
            <div className="text-[10px] text-slate-500 mt-0.5">{lastResultTime}</div>
          )}
        </div>

        {/* Image section */}
        {showImage && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wide">Capture</span>
              <button
                onClick={handleRefreshImage}
                disabled={loadingImage}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white disabled:opacity-50"
              >
                <RefreshCw size={10} className={loadingImage ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
            <div className="flex-1 min-h-0 bg-slate-700/50 rounded-lg overflow-hidden flex items-center justify-center">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Cognex capture"
                  className="max-w-full max-h-full object-contain"
                />
              ) : error ? (
                <span className="text-xs text-red-400 px-2 text-center">{error}</span>
              ) : (
                <div className="text-xs text-slate-500 flex flex-col items-center gap-1">
                  <Camera size={16} />
                  <span>Click Refresh</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trigger button */}
        {showTrigger && (
          <button
            onClick={handleTrigger}
            disabled={triggering || status !== 'Connected'}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium"
          >
            <Camera size={12} />
            {triggering ? 'Triggering...' : 'Trigger'}
          </button>
        )}
      </div>
    </div>
  );
});
