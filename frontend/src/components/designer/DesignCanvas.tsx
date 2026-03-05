import { useRef, useState, useCallback, useEffect } from 'react';
import { Lock } from 'lucide-react';
import type { Widget, TagValue } from '../../types';
import type { GridSettings } from '../../hooks/useDesignMode';
import { WidgetRenderer } from '../widgets/WidgetRenderer';

interface Props {
  widgets: Widget[];
  tagValues: Record<string, TagValue>;
  selectedIds: Set<string>;
  lockedIds: Set<string>;
  gridSettings: GridSettings;
  zoom: number;
  onSelect: (id: string, additive?: boolean) => void;
  onClearSelection: () => void;
  onMoveWidget: (id: string, x: number, y: number) => void;
  onResizeWidget: (id: string, w: number, h: number) => void;
}

const COL_COUNT = 12;
const ROW_HEIGHT = 80;
const GAP = 16; // matches gap-4

export function DesignCanvas({
  widgets, tagValues, selectedIds, lockedIds, gridSettings, zoom,
  onSelect, onClearSelection, onMoveWidget, onResizeWidget,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    startY: number;
    origCol: number;
    origRow: number;
  } | null>(null);
  const [resizing, setResizing] = useState<{
    id: string;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);

  // Calculate column width based on canvas container
  const getColWidth = useCallback(() => {
    if (!canvasRef.current) return 80;
    return (canvasRef.current.clientWidth - GAP * (COL_COUNT - 1)) / COL_COUNT;
  }, []);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      onClearSelection();
    }
  };

  const handleWidgetMouseDown = (e: React.MouseEvent, widget: Widget) => {
    e.stopPropagation();
    onSelect(widget.id, e.shiftKey);

    if (lockedIds.has(widget.id)) return;

    setDragging({
      id: widget.id,
      startX: e.clientX,
      startY: e.clientY,
      origCol: widget.x,
      origRow: widget.y,
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, widget: Widget) => {
    e.stopPropagation();
    e.preventDefault();
    if (lockedIds.has(widget.id)) return;

    setResizing({
      id: widget.id,
      startX: e.clientX,
      startY: e.clientY,
      origW: widget.w,
      origH: widget.h,
    });
  };

  useEffect(() => {
    if (!dragging && !resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (dragging) {
        const colW = getColWidth() + GAP;
        const rowH = ROW_HEIGHT + GAP;
        const dx = (e.clientX - dragging.startX) / zoom;
        const dy = (e.clientY - dragging.startY) / zoom;
        const newCol = Math.max(0, Math.round(dragging.origCol + dx / colW));
        const newRow = Math.max(0, Math.round(dragging.origRow + dy / rowH));
        onMoveWidget(dragging.id, newCol, newRow);
      }
      if (resizing) {
        const colW = getColWidth() + GAP;
        const rowH = ROW_HEIGHT + GAP;
        const dx = (e.clientX - resizing.startX) / zoom;
        const dy = (e.clientY - resizing.startY) / zoom;
        const newW = Math.max(1, Math.min(12, Math.round(resizing.origW + dx / colW)));
        const newH = Math.max(1, Math.round(resizing.origH + dy / rowH));
        onResizeWidget(resizing.id, newW, newH);
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
      setResizing(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, resizing, zoom, getColWidth, onMoveWidget, onResizeWidget]);

  return (
    <div className="flex-1 overflow-auto bg-slate-950 p-4">
      <div
        ref={canvasRef}
        className="relative"
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          minHeight: '600px',
        }}
        onClick={handleCanvasClick}
      >
        {/* Grid overlay */}
        {gridSettings.visible && (
          <div
            className="absolute inset-0 pointer-events-none opacity-10"
            style={{
              backgroundImage: `
                linear-gradient(to right, #475569 1px, transparent 1px),
                linear-gradient(to bottom, #475569 1px, transparent 1px)
              `,
              backgroundSize: `${gridSettings.cellSize}px ${gridSettings.cellSize}px`,
            }}
          />
        )}

        {/* Widget grid layout */}
        <div
          className="grid gap-4 relative"
          style={{
            gridTemplateColumns: `repeat(${COL_COUNT}, 1fr)`,
            gridAutoRows: `${ROW_HEIGHT}px`,
          }}
        >
          {widgets.map((w) => {
            const isSelected = selectedIds.has(w.id);
            const isLocked = lockedIds.has(w.id);

            return (
              <div
                key={w.id}
                className={`relative group ${dragging?.id === w.id ? 'opacity-70' : ''}`}
                style={{
                  gridColumn: `${w.x + 1} / span ${w.w}`,
                  gridRow: `${w.y + 1} / span ${w.h}`,
                  cursor: isLocked ? 'default' : 'move',
                }}
                onMouseDown={(e) => handleWidgetMouseDown(e, w)}
              >
                {/* Selection outline */}
                <div className={`absolute inset-0 rounded-xl pointer-events-none z-10 border-2 transition-colors ${
                  isSelected ? 'border-blue-500' : 'border-transparent group-hover:border-blue-500/30'
                }`} />

                {/* Lock indicator */}
                {isLocked && (
                  <div className="absolute top-1 right-1 z-20 bg-yellow-600/80 rounded p-0.5">
                    <Lock size={10} className="text-white" />
                  </div>
                )}

                {/* Resize handle */}
                {isSelected && !isLocked && (
                  <div
                    className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 rounded-tl-md cursor-se-resize z-20"
                    onMouseDown={(e) => handleResizeMouseDown(e, w)}
                  />
                )}

                {/* Widget content */}
                <div className="h-full pointer-events-none">
                  <WidgetRenderer widget={w} tagValues={tagValues} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {widgets.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
            <p className="text-sm">Drag widgets from the palette to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}
