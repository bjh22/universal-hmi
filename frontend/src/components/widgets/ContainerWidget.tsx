import { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import type { TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';

export type ContainerMode = 'standard' | 'collapsible' | 'carousel';

interface Props {
  title: string;
  description?: string;
  titleStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
  containerMode?: ContainerMode;
  // Collapsible mode
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: (collapsed: boolean) => void;
  // Carousel mode
  pageCount?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  autoRotateSeconds?: number;
  showDots?: boolean;
  showArrows?: boolean;
}

export function ContainerWidget({
  title, titleStyle, chrome = 'full',
  containerMode = 'standard',
  defaultCollapsed = false, collapsed: controlledCollapsed, onToggleCollapsed,
  pageCount = 1, currentPage = 0, onPageChange,
  autoRotateSeconds = 0, showDots = true, showArrows = true,
}: Props) {
  // Collapsible state
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isCollapsed = controlledCollapsed ?? internalCollapsed;

  const toggleCollapse = useCallback(() => {
    const next = !isCollapsed;
    setInternalCollapsed(next);
    onToggleCollapsed?.(next);
  }, [isCollapsed, onToggleCollapsed]);

  // Auto-rotate for carousel
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastInteractionRef = useRef(0);

  useEffect(() => {
    if (containerMode !== 'carousel' || autoRotateSeconds <= 0 || pageCount <= 1) return;
    timerRef.current = setInterval(() => {
      // Skip rotation if user recently interacted
      if (Date.now() - lastInteractionRef.current < autoRotateSeconds * 1000) return;
      onPageChange?.(((currentPage ?? 0) + 1) % pageCount);
    }, autoRotateSeconds * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [containerMode, autoRotateSeconds, pageCount, currentPage, onPageChange]);

  const handlePageChange = useCallback((page: number) => {
    lastInteractionRef.current = Date.now();
    onPageChange?.(page);
  }, [onPageChange]);

  const containerClasses = (() => {
    switch (chrome) {
      case 'full':
        return 'bg-slate-800/40 rounded-xl border-2 border-slate-600 p-3';
      case 'compact':
        return 'bg-slate-800/20 rounded-lg border border-slate-600/50 p-1.5';
      case 'none':
        return 'border border-dashed border-slate-600/30';
    }
  })();

  const iconSize = chrome === 'compact' ? 12 : 14;

  return (
    <div className={`${containerClasses} h-full flex flex-col`}>
      {/* Title bar */}
      {shouldShowTitle(chrome) && (
        containerMode === 'collapsible' ? (
          <button
            type="button"
            onClick={toggleCollapse}
            className={`${getTitleClasses(chrome)} flex items-center gap-1 cursor-pointer select-none hover:text-slate-300 transition-colors w-full text-left`}
            style={textStyleToCSS(titleStyle)}
          >
            {isCollapsed ? <ChevronRight size={iconSize} className="shrink-0" /> : <ChevronDown size={iconSize} className="shrink-0" />}
            {title}
          </button>
        ) : (
          <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>
            {title}
          </div>
        )
      )}

      {/* Carousel navigation */}
      {containerMode === 'carousel' && pageCount > 1 && (
        <>
          {/* Left/right arrows */}
          {showArrows && (
            <>
              <button
                type="button"
                onClick={() => handlePageChange((currentPage - 1 + pageCount) % pageCount)}
                className="absolute left-1 top-1/2 -translate-y-1/2 z-20 p-1 rounded-full bg-slate-700/80 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => handlePageChange((currentPage + 1) % pageCount)}
                className="absolute right-1 top-1/2 -translate-y-1/2 z-20 p-1 rounded-full bg-slate-700/80 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </>
          )}

          {/* Dot indicators */}
          {showDots && (
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
              {Array.from({ length: pageCount }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handlePageChange(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === currentPage ? 'bg-blue-400' : 'bg-slate-500 hover:bg-slate-400'
                  }`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
