import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';
import { api } from '../../lib/api';

interface Props {
  title: string;
  tag: string;
  staticZpl: string;
  dpi: number;
  refreshOnTagChange: boolean;
  tagValues: Record<string, TagValue>;
  titleStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export const ZplPreviewWidget = memo(function ZplPreviewWidget({
  title, tag, staticZpl, dpi = 203, refreshOnTagChange = true,
  tagValues, titleStyle, chrome = 'full',
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);
  const lastRenderedZpl = useRef('');

  const zplContent = (tag && tagValues[tag]?.value != null)
    ? String(tagValues[tag].value)
    : staticZpl || '';

  // Clean up on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const renderPreview = useCallback(async (zpl: string) => {
    if (!zpl.trim()) {
      setError(null);
      setImageUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      lastRenderedZpl.current = '';
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const blob = await api.zplPreviewRender(zpl, dpi);
      if (!mountedRef.current) return;
      setImageUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      lastRenderedZpl.current = zpl;
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Render failed');
    }
    setLoading(false);
  }, [dpi]);

  // Render when ZPL content changes (debounced)
  useEffect(() => {
    if (!zplContent.trim()) return;
    // Skip if content hasn't changed
    if (zplContent === lastRenderedZpl.current && !refreshOnTagChange) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Use short delay for initial render, longer for subsequent
    const delay = lastRenderedZpl.current ? 2000 : 100;
    debounceRef.current = setTimeout(() => {
      renderPreview(zplContent);
    }, delay);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [zplContent, refreshOnTagChange, renderPreview]);

  const handleRefresh = useCallback(() => {
    renderPreview(zplContent);
  }, [zplContent, renderPreview]);

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col overflow-hidden`}>
      {shouldShowTitle(chrome) && (
        <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>
      )}

      <div className="flex-1 flex flex-col gap-1.5 min-h-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-400 uppercase tracking-wide">Label Preview</span>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        <div className="flex-1 min-h-0 bg-slate-700/50 rounded-lg overflow-hidden flex items-center justify-center">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="ZPL label preview"
              className="max-w-full max-h-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : error ? (
            <span className="text-xs text-red-400 px-2 text-center">{error}</span>
          ) : (
            <div className="text-xs text-slate-500 flex flex-col items-center gap-1">
              <Printer size={16} />
              <span>{zplContent ? 'Rendering...' : 'No ZPL configured'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
