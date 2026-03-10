/**
 * DesignCanvas — the main canvas area for the drag-and-drop screen designer.
 *
 * This is the interactive surface where designers place, move, and resize widgets.
 * It handles: widget rendering in their configured positions, drag-to-move,
 * resize handles (bottom-right corner), marquee (rubber-band) selection for
 * selecting multiple widgets by dragging on empty space, right-click context
 * menus, and alignment/distribution tools for multi-selection.
 *
 * Two layout modes are supported:
 *   - Grid mode: uses a 12-column responsive CSS grid (like Bootstrap/Tailwind
 *     grid), where widget positions are in column/row units. Good for layouts
 *     that adapt to different screen sizes.
 *   - Absolute mode: allows free pixel positioning anywhere on a fixed-size
 *     canvas (e.g. 1920x1080). Good for precise control panel layouts that
 *     target a specific display resolution.
 *
 * Mouse events use requestAnimationFrame for throttling to ensure smooth
 * dragging even with many widgets on screen.
 */
import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Lock } from 'lucide-react';
import type { Widget, TagValue, AlarmData, LayoutMode, ScreenResolution } from '../../types';
import type { GridSettings } from '../../hooks/useDesignMode';
import { CONTAINER_INNER_GRID } from '../../hooks/useDesignMode';
import { WidgetRenderer } from '../widgets/WidgetRenderer';

interface ContextMenuState {
  x: number;
  y: number;
  widgetId: string | null; // null = canvas background
}

interface MarqueeState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface Props {
  widgets: Widget[];
  tagValues: Record<string, TagValue>;
  alarms?: AlarmData[];
  selectedIds: Set<string>;
  lockedIds: Set<string>;
  gridSettings: GridSettings;
  zoom: number;
  layoutMode: LayoutMode;
  targetResolution: ScreenResolution | null;
  onSelect: (id: string, additive?: boolean) => void;
  onSelectMultiple: (ids: string[]) => void;
  onClearSelection: () => void;
  onMoveWidget: (id: string, x: number, y: number) => void;
  onResizeWidget: (id: string, w: number, h: number) => void;
  // Context menu actions
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onToggleLock: (id: string) => void;
  onSelectAll: () => void;
  // Alignment
  onAlign: (direction: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v') => void;
  onDistribute: (direction: 'horizontal' | 'vertical') => void;
}

const COL_COUNT = 12;
const ROW_HEIGHT = 80;
const GAP = 16;

export function DesignCanvas({
  widgets, tagValues, alarms = [], selectedIds, lockedIds, gridSettings, zoom,
  layoutMode, targetResolution,
  onSelect, onSelectMultiple, onClearSelection, onMoveWidget, onResizeWidget,
  onCopy, onCut, onPaste, onDuplicate, onDelete,
  onBringToFront, onSendToBack, onBringForward, onSendBackward,
  onToggleLock, onSelectAll, onAlign, onDistribute,
}: Props) {
  const isAbsolute = layoutMode === 'absolute';
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    id: string; startX: number; startY: number; origCol: number; origRow: number;
  } | null>(null);
  const [resizing, setResizing] = useState<{
    id: string; startX: number; startY: number; origW: number; origH: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);

  const getColWidth = useCallback(() => {
    if (!canvasRef.current) return 80;
    return (canvasRef.current.clientWidth - GAP * (COL_COUNT - 1)) / COL_COUNT;
  }, []);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // left click only
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest('[data-canvas-grid]') && !(e.target as HTMLElement).closest('[data-canvas-absolute]')) return;
    onClearSelection();
    setContextMenu(null);
    // Start marquee selection
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setMarquee({
        startX: (e.clientX - rect.left) / zoom,
        startY: (e.clientY - rect.top) / zoom,
        currentX: (e.clientX - rect.left) / zoom,
        currentY: (e.clientY - rect.top) / zoom,
      });
    }
  };

  const handleWidgetMouseDown = (e: React.MouseEvent, widget: Widget) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setContextMenu(null);
    onSelect(widget.id, e.shiftKey);
    if (lockedIds.has(widget.id)) return;
    setDragging({ id: widget.id, startX: e.clientX, startY: e.clientY, origCol: widget.x, origRow: widget.y });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, widget: Widget) => {
    e.stopPropagation();
    e.preventDefault();
    if (lockedIds.has(widget.id)) return;
    setResizing({ id: widget.id, startX: e.clientX, startY: e.clientY, origW: widget.w, origH: widget.h });
  };

  // Context menu
  const handleContextMenu = (e: React.MouseEvent, widgetId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (widgetId && !selectedIds.has(widgetId)) {
      onSelect(widgetId);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, widgetId });
  };

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  // Drag/resize/marquee mouse events (throttled with requestAnimationFrame)
  useEffect(() => {
    if (!dragging && !resizing && !marquee) return;

    let rafId: number | null = null;
    let lastEvent: MouseEvent | null = null;

    const processMouseMove = () => {
      rafId = null;
      const e = lastEvent;
      if (!e) return;

      if (dragging) {
        if (isAbsolute) {
          const dx = (e.clientX - dragging.startX) / zoom;
          const dy = (e.clientY - dragging.startY) / zoom;
          let newX = dragging.origCol + dx;
          let newY = dragging.origRow + dy;
          if (gridSettings.snap) {
            const snapSize = gridSettings.cellSize;
            newX = Math.round(newX / snapSize) * snapSize;
            newY = Math.round(newY / snapSize) * snapSize;
          }
          newX = Math.max(0, Math.round(newX));
          newY = Math.max(0, Math.round(newY));
          onMoveWidget(dragging.id, newX, newY);
        } else {
          // Check if this is a container child — use pixel-based movement with fine snapping
          const dragWidget = widgets.find(w => w.id === dragging.id);
          if (dragWidget?.parentId) {
            const dx = (e.clientX - dragging.startX) / zoom;
            const dy = (e.clientY - dragging.startY) / zoom;
            let newX = dragging.origCol + dx;
            let newY = dragging.origRow + dy;
            const snap = CONTAINER_INNER_GRID;
            newX = Math.max(0, Math.round(newX / snap) * snap);
            newY = Math.max(0, Math.round(newY / snap) * snap);
            onMoveWidget(dragging.id, newX, newY);
          } else {
            const colW = getColWidth() + GAP;
            const rowH = ROW_HEIGHT + GAP;
            const dx = (e.clientX - dragging.startX) / zoom;
            const dy = (e.clientY - dragging.startY) / zoom;
            const newCol = Math.max(0, Math.round(dragging.origCol + dx / colW));
            const newRow = Math.max(0, Math.round(dragging.origRow + dy / rowH));
            onMoveWidget(dragging.id, newCol, newRow);
          }
        }
      }
      if (resizing) {
        if (isAbsolute) {
          const dx = (e.clientX - resizing.startX) / zoom;
          const dy = (e.clientY - resizing.startY) / zoom;
          let newW = resizing.origW + dx;
          let newH = resizing.origH + dy;
          if (gridSettings.snap) {
            const snapSize = gridSettings.cellSize;
            newW = Math.round(newW / snapSize) * snapSize;
            newH = Math.round(newH / snapSize) * snapSize;
          }
          newW = Math.max(40, Math.round(newW));
          newH = Math.max(40, Math.round(newH));
          onResizeWidget(resizing.id, newW, newH);
        } else {
          // Check if resizing a container child — use pixel-based resize
          const resizeWidget = widgets.find(w => w.id === resizing.id);
          if (resizeWidget?.parentId) {
            const dx = (e.clientX - resizing.startX) / zoom;
            const dy = (e.clientY - resizing.startY) / zoom;
            let newW = resizing.origW + dx;
            let newH = resizing.origH + dy;
            const snap = CONTAINER_INNER_GRID;
            newW = Math.max(40, Math.round(newW / snap) * snap);
            newH = Math.max(40, Math.round(newH / snap) * snap);
            onResizeWidget(resizing.id, newW, newH);
          } else {
            const colW = getColWidth() + GAP;
            const rowH = ROW_HEIGHT + GAP;
            const dx = (e.clientX - resizing.startX) / zoom;
            const dy = (e.clientY - resizing.startY) / zoom;
            const newW = Math.max(1, Math.min(12, Math.round(resizing.origW + dx / colW)));
            const newH = Math.max(1, Math.round(resizing.origH + dy / rowH));
            onResizeWidget(resizing.id, newW, newH);
          }
        }
      }
      if (marquee) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          setMarquee(prev => prev ? {
            ...prev,
            currentX: (e.clientX - rect.left) / zoom,
            currentY: (e.clientY - rect.top) / zoom,
          } : null);
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastEvent = e;
      if (rafId === null) {
        rafId = requestAnimationFrame(processMouseMove);
      }
    };

    const handleMouseUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (marquee) {
        // Calculate which widgets intersect the marquee
        const mx1 = Math.min(marquee.startX, marquee.currentX);
        const my1 = Math.min(marquee.startY, marquee.currentY);
        const mx2 = Math.max(marquee.startX, marquee.currentX);
        const my2 = Math.max(marquee.startY, marquee.currentY);
        // Only select if marquee is large enough (> 5px)
        if (mx2 - mx1 > 5 || my2 - my1 > 5) {
          let ids: string[];
          if (isAbsolute) {
            ids = widgets.filter(w => {
              const wx1 = w.x;
              const wy1 = w.y;
              const wx2 = w.x + w.w;
              const wy2 = w.y + w.h;
              return wx1 < mx2 && wx2 > mx1 && wy1 < my2 && wy2 > my1;
            }).map(w => w.id);
          } else {
            const colW = getColWidth() + GAP;
            const rowH = ROW_HEIGHT + GAP;
            ids = widgets.filter(w => {
              const wx1 = w.x * colW;
              const wy1 = w.y * rowH;
              const wx2 = wx1 + w.w * colW - GAP;
              const wy2 = wy1 + w.h * rowH - GAP;
              return wx1 < mx2 && wx2 > mx1 && wy1 < my2 && wy2 > my1;
            }).map(w => w.id);
          }
          if (ids.length > 0) onSelectMultiple(ids);
        }
        setMarquee(null);
      }
      setDragging(null);
      setResizing(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, resizing, marquee, zoom, getColWidth, onMoveWidget, onResizeWidget, onSelectMultiple, widgets, isAbsolute, gridSettings]);

  const hasMultipleSelected = selectedIds.size > 1;

  // Memoize grid overlay style to avoid recalculating CSS gradient on every render
  const gridStyle = useMemo(() => ({
    backgroundImage: `
      linear-gradient(to right, #475569 1px, transparent 1px),
      linear-gradient(to bottom, #475569 1px, transparent 1px)
    `,
    backgroundSize: `${gridSettings.cellSize}px ${gridSettings.cellSize}px`,
  }), [gridSettings.cellSize]);

  return (
    <div className="flex-1 overflow-auto bg-slate-950 p-4 flex flex-col">
      {/* Alignment toolbar - shows when multiple selected */}
      {hasMultipleSelected && (
        <div className="flex items-center gap-1 mb-2 px-1">
          <span className="text-[10px] text-slate-500 mr-1">Align:</span>
          {(['left', 'center-h', 'right', 'top', 'center-v', 'bottom'] as const).map(dir => (
            <button key={dir} onClick={() => onAlign(dir)}
              className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              title={`Align ${dir}`}>
              {dir === 'left' ? 'L' : dir === 'right' ? 'R' : dir === 'top' ? 'T' : dir === 'bottom' ? 'B' : dir === 'center-h' ? 'CH' : 'CV'}
            </button>
          ))}
          <div className="w-px h-4 bg-slate-700 mx-1" />
          <span className="text-[10px] text-slate-500 mr-1">Distribute:</span>
          <button onClick={() => onDistribute('horizontal')}
            className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            title="Distribute horizontally">H</button>
          <button onClick={() => onDistribute('vertical')}
            className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            title="Distribute vertically">V</button>
        </div>
      )}

      <div className="flex-1 relative">
        <div
          ref={canvasRef}
          className="relative"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            minHeight: '600px',
          }}
          onMouseDown={handleCanvasMouseDown}
          onContextMenu={e => handleContextMenu(e, null)}
        >
          {/* Grid overlay */}
          {gridSettings.visible && (
            <div
              className="absolute inset-0 pointer-events-none opacity-10"
              style={gridStyle}
            />
          )}

          {/* Widget layout */}
          {isAbsolute ? (
            /* Absolute positioning layout */
            <div
              data-canvas-absolute
              className="relative"
              style={{
                width: targetResolution?.width ?? 1920,
                height: targetResolution?.height ?? 1080,
              }}
            >
              {widgets.map((w, index) => {
                const isSelected = selectedIds.has(w.id);
                const isLocked = lockedIds.has(w.id);
                return (
                  <div
                    key={w.id}
                    className={`absolute group ${dragging?.id === w.id ? 'opacity-70' : ''}`}
                    style={{
                      left: w.x,
                      top: w.y,
                      width: w.w,
                      height: w.h,
                      zIndex: index,
                      cursor: isLocked ? 'default' : 'move',
                    }}
                    onMouseDown={e => handleWidgetMouseDown(e, w)}
                    onContextMenu={e => handleContextMenu(e, w.id)}
                  >
                    <div className={`absolute inset-0 rounded-xl pointer-events-none border-2 transition-colors ${
                      isSelected ? 'border-blue-500' : 'border-transparent group-hover:border-blue-500/30'
                    }`} style={{ zIndex: 10 }} />
                    {isLocked && (
                      <div className="absolute top-1 right-1 bg-yellow-600/80 rounded p-0.5" style={{ zIndex: 20 }}>
                        <Lock size={10} className="text-white" />
                      </div>
                    )}
                    {isSelected && !isLocked && (
                      <div className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 rounded-tl-md cursor-se-resize"
                        style={{ zIndex: 20 }}
                        onMouseDown={e => handleResizeMouseDown(e, w)} />
                    )}
                    <div className="h-full pointer-events-none">
                      <WidgetRenderer widget={w} tagValues={tagValues} alarms={alarms} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* CSS Grid layout */
            <div
              data-canvas-grid
              className="grid gap-4 relative"
              style={{
                gridTemplateColumns: `repeat(${COL_COUNT}, 1fr)`,
                gridAutoRows: `${ROW_HEIGHT}px`,
              }}
            >
              {widgets.filter(w => !w.parentId).map((w) => {
                const isSelected = selectedIds.has(w.id);
                const isLocked = lockedIds.has(w.id);
                const isContainer = w.type === 'container' || w.type === 'collapsible_container';
                const children = isContainer ? widgets.filter(c => c.parentId === w.id) : [];
                return (
                  <div
                    key={w.id}
                    className={`relative group ${dragging?.id === w.id ? 'opacity-70' : ''}`}
                    style={{
                      gridColumn: `${w.x + 1} / span ${w.w}`,
                      gridRow: `${w.y + 1} / span ${w.h}`,
                      cursor: isLocked ? 'default' : 'move',
                    }}
                    onMouseDown={e => handleWidgetMouseDown(e, w)}
                    onContextMenu={e => handleContextMenu(e, w.id)}
                  >
                    <div className={`absolute inset-0 rounded-xl pointer-events-none z-10 border-2 transition-colors ${
                      isSelected ? 'border-blue-500' : 'border-transparent group-hover:border-blue-500/30'
                    }`} />
                    {isLocked && (
                      <div className="absolute top-1 right-1 z-20 bg-yellow-600/80 rounded p-0.5">
                        <Lock size={10} className="text-white" />
                      </div>
                    )}
                    {isSelected && !isLocked && (
                      <div className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 rounded-tl-md cursor-se-resize z-20"
                        onMouseDown={e => handleResizeMouseDown(e, w)} />
                    )}
                    <div className={`h-full ${isContainer ? '' : 'pointer-events-none'}`}>
                      <WidgetRenderer widget={w} tagValues={tagValues} alarms={alarms} />
                    </div>
                    {/* Render container children with pixel-based positioning inside the container */}
                    {children.map((child) => {
                      const childSelected = selectedIds.has(child.id);
                      const childLocked = lockedIds.has(child.id);
                      return (
                        <div
                          key={child.id}
                          className={`absolute group/child ${dragging?.id === child.id ? 'opacity-70' : ''}`}
                          style={{
                            left: child.x,
                            top: child.y,
                            width: child.w,
                            height: child.h,
                            zIndex: 15,
                            cursor: childLocked ? 'default' : 'move',
                          }}
                          onMouseDown={e => handleWidgetMouseDown(e, child)}
                          onContextMenu={e => handleContextMenu(e, child.id)}
                        >
                          <div className={`absolute inset-0 rounded-lg pointer-events-none border-2 transition-colors ${
                            childSelected ? 'border-blue-500' : 'border-transparent group-hover/child:border-blue-500/30'
                          }`} style={{ zIndex: 10 }} />
                          {childLocked && (
                            <div className="absolute top-1 right-1 bg-yellow-600/80 rounded p-0.5" style={{ zIndex: 20 }}>
                              <Lock size={10} className="text-white" />
                            </div>
                          )}
                          {childSelected && !childLocked && (
                            <div className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 rounded-tl-md cursor-se-resize"
                              style={{ zIndex: 20 }}
                              onMouseDown={e => handleResizeMouseDown(e, child)} />
                          )}
                          <div className="h-full pointer-events-none">
                            <WidgetRenderer widget={child} tagValues={tagValues} alarms={alarms} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Marquee selection rectangle */}
          {marquee && (
            <div
              className="absolute border border-blue-400 bg-blue-400/10 pointer-events-none z-30"
              style={{
                left: Math.min(marquee.startX, marquee.currentX),
                top: Math.min(marquee.startY, marquee.currentY),
                width: Math.abs(marquee.currentX - marquee.startX),
                height: Math.abs(marquee.currentY - marquee.startY),
              }}
            />
          )}

          {/* Empty state */}
          {widgets.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 pointer-events-none">
              <p className="text-sm">Drag widgets from the palette to get started</p>
            </div>
          )}
        </div>

        {/* Context menu */}
        {contextMenu && (
          <div
            className="fixed bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={() => setContextMenu(null)}
          >
            {contextMenu.widgetId ? (
              <>
                <ContextMenuItem label="Cut" shortcut="Ctrl+X" onClick={onCut} />
                <ContextMenuItem label="Copy" shortcut="Ctrl+C" onClick={onCopy} />
                <ContextMenuItem label="Paste" shortcut="Ctrl+V" onClick={onPaste} />
                <ContextMenuItem label="Duplicate" shortcut="Ctrl+D" onClick={onDuplicate} />
                <ContextMenuDivider />
                <ContextMenuItem label="Bring to Front" shortcut="Ctrl+Shift+]" onClick={onBringToFront} />
                <ContextMenuItem label="Bring Forward" shortcut="Ctrl+]" onClick={onBringForward} />
                <ContextMenuItem label="Send Backward" shortcut="Ctrl+[" onClick={onSendBackward} />
                <ContextMenuItem label="Send to Back" shortcut="Ctrl+Shift+[" onClick={onSendToBack} />
                <ContextMenuDivider />
                <ContextMenuItem
                  label={lockedIds.has(contextMenu.widgetId) ? 'Unlock Position' : 'Lock Position'}
                  onClick={() => contextMenu.widgetId && onToggleLock(contextMenu.widgetId)}
                />
                <ContextMenuDivider />
                <ContextMenuItem label="Delete" shortcut="Del" onClick={onDelete} danger />
              </>
            ) : (
              <>
                <ContextMenuItem label="Paste" shortcut="Ctrl+V" onClick={onPaste} />
                <ContextMenuItem label="Select All" shortcut="Ctrl+A" onClick={onSelectAll} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ContextMenuItem({ label, shortcut, onClick, danger }: {
  label: string; shortcut?: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-slate-700 transition-colors ${
        danger ? 'text-red-400' : 'text-slate-300'
      }`}
    >
      <span>{label}</span>
      {shortcut && <span className="text-[10px] text-slate-500 ml-4">{shortcut}</span>}
    </button>
  );
}

function ContextMenuDivider() {
  return <div className="h-px bg-slate-700 my-1" />;
}
