/**
 * useDesignMode — State machine for the drag-and-drop screen designer/editor.
 *
 * This is the "brain" of the screen editor. It manages widget CRUD (create, read,
 * update, delete), selection, clipboard (copy/cut/paste), undo/redo history,
 * alignment/distribution, z-ordering (which widget is on top), zoom, and locking.
 *
 * All widget mutations flow through `commitWidgets`, which automatically saves
 * undo history before applying changes — the "single source of truth" pattern.
 */

import { useState, useCallback, useMemo } from 'react';
import type { Widget, LayoutMode } from '../types';

export interface GridSettings {
  cellSize: number;
  visible: boolean;
  snap: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

// HistoryEntry stores a snapshot of the entire widget array at a point in time.
// Undo/redo works by swapping between these snapshots rather than trying to
// reverse individual operations (which would be much more complex and error-prone).
interface HistoryEntry {
  widgets: Widget[];
  description: string;
}

export interface DesignModeState {
  editing: boolean;
  layoutMode: LayoutMode;
  widgets: Widget[];
  selectedIds: Set<string>;
  clipboard: Widget[];
  gridSettings: GridSettings;
  dirty: boolean;
  zoom: number;

  // Mode toggle
  enterEditMode: (widgets: Widget[], mode?: LayoutMode) => void;
  exitEditMode: () => void;

  // Selection
  select: (id: string, additive?: boolean) => void;
  selectMultiple: (ids: string[]) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Widget CRUD
  addWidget: (widget: Widget) => void;
  updateWidget: (id: string, patch: Partial<Widget>) => void;
  updateWidgetProps: (id: string, props: Record<string, unknown>) => void;
  deleteSelected: () => void;
  moveWidget: (id: string, x: number, y: number) => void;
  resizeWidget: (id: string, w: number, h: number) => void;

  // Clipboard
  copySelected: () => void;
  cutSelected: () => void;
  paste: () => void;
  duplicateSelected: () => void;

  // Z-order
  bringToFront: () => void;
  sendToBack: () => void;
  bringForward: () => void;
  sendBackward: () => void;

  // Alignment
  align: (direction: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v') => void;
  distribute: (direction: 'horizontal' | 'vertical') => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Grid & zoom
  setGridSettings: (settings: Partial<GridSettings>) => void;
  setZoom: (zoom: number) => void;

  // Lock
  lockedIds: Set<string>;
  toggleLock: (id: string) => void;
}

const DEFAULT_GRID: GridSettings = {
  cellSize: 20,
  visible: true,
  snap: true,
  canvasWidth: 1920,
  canvasHeight: 1080,
};

// Fine-grained snap grid (in pixels) for widgets placed inside containers in grid mode
export const CONTAINER_INNER_GRID = 8;

// MAX_HISTORY caps the undo stack to prevent unbounded memory growth.
// Each entry stores a full copy of the widget array, so 50 entries is a
// reasonable balance between undo depth and memory usage.
const MAX_HISTORY = 50;

let nextWidgetId = 1;
export function generateWidgetId(): string {
  return `w_${Date.now()}_${nextWidgetId++}`;
}

export function useDesignMode(): DesignModeState {
  const [editing, setEditing] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('absolute');
  const [widgets, setWidgets] = useState<Widget[]>([]);
  // Selection uses Set<string> for O(1) lookups — checking "is this widget selected?"
  // with Set.has() is instant, whereas Array.includes() would scan the entire list.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<Widget[]>([]);
  const [gridSettings, setGridSettingsState] = useState<GridSettings>(DEFAULT_GRID);
  const [dirty, setDirty] = useState(false);
  const [zoom, setZoomState] = useState(1);
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());

  // Undo/redo stacks stored as state (not refs) so canUndo/canRedo trigger re-renders
  // when they change, keeping the UI toolbar buttons enabled/disabled correctly.
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  // pushHistory saves a widget snapshot to the undo stack and clears the redo stack.
  // Redo is cleared because once you make a new change after undoing, the old
  // "future" no longer makes sense — this matches how undo/redo works in every editor.
  const pushHistory = useCallback((ws: Widget[], description: string) => {
    setUndoStack(prev => {
      const next = [...prev, { widgets: ws, description }];
      return next.length > MAX_HISTORY ? next.slice(1) : next;
    });
    setRedoStack([]);
  }, []);

  // commitWidgets wraps EVERY widget mutation. It saves the current state to the undo
  // stack before applying the change, then marks the screen as dirty (unsaved).
  // This guarantees that every change is undoable and that the save indicator is accurate.
  const commitWidgets = useCallback((updater: (prev: Widget[]) => Widget[], description: string) => {
    setWidgets(prev => {
      pushHistory(prev, description);
      const next = updater(prev);
      setDirty(true);
      return next;
    });
  }, [pushHistory]);

  // Mode toggle
  const enterEditMode = useCallback((ws: Widget[], mode: LayoutMode = 'grid') => {
    setWidgets(ws);
    setLayoutMode(mode);
    setEditing(true);
    setDirty(false);
    setSelectedIds(new Set());
    setUndoStack([]);
    setRedoStack([]);
    setLockedIds(new Set());
  }, []);

  const exitEditMode = useCallback(() => {
    setEditing(false);
    setSelectedIds(new Set());
  }, []);

  // Selection — additive mode (Shift+click) toggles individual items in/out of the
  // selection set; non-additive mode replaces the selection with a single item.
  const select = useCallback((id: string, additive = false) => {
    setSelectedIds(prev => {
      if (additive) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      }
      return new Set([id]);
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(widgets.map(w => w.id)));
  }, [widgets]);

  const selectMultiple = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Widget CRUD
  const addWidget = useCallback((widget: Widget) => {
    commitWidgets(prev => [...prev, widget], 'Add widget');
  }, [commitWidgets]);

  const updateWidget = useCallback((id: string, patch: Partial<Widget>) => {
    commitWidgets(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w), 'Update widget');
  }, [commitWidgets]);

  const updateWidgetProps = useCallback((id: string, props: Record<string, unknown>) => {
    commitWidgets(prev => prev.map(w =>
      w.id === id ? { ...w, props: { ...w.props, ...props } } : w
    ), 'Update widget props');
  }, [commitWidgets]);

  const deleteSelected = useCallback(() => {
    const deletingIds = new Set([...selectedIds].filter(id => !lockedIds.has(id)));
    commitWidgets(prev => prev
      // Remove selected (non-locked) widgets AND their children
      .filter(w => !deletingIds.has(w.id) && !(w.parentId && deletingIds.has(w.parentId))),
    'Delete widgets');
    setSelectedIds(new Set());
  }, [commitWidgets, selectedIds, lockedIds]);

  const moveWidget = useCallback((id: string, x: number, y: number) => {
    if (lockedIds.has(id)) return;
    commitWidgets(prev => {
      const target = prev.find(w => w.id === id);
      if (!target) return prev;
      const dx = x - target.x;
      const dy = y - target.y;
      return prev.map(w => {
        if (w.id === id) return { ...w, x, y };
        // Move children along with container
        if (target.type === 'container' && w.parentId === id) {
          return { ...w, x: w.x + dx, y: w.y + dy };
        }
        return w;
      });
    }, 'Move widget');
  }, [commitWidgets, lockedIds]);

  const resizeWidget = useCallback((id: string, w: number, h: number) => {
    if (lockedIds.has(id)) return;
    commitWidgets(prev => {
      const target = prev.find(wi => wi.id === id);
      // Container children in grid mode use pixel sizes (min 40px)
      const isChildInGrid = layoutMode === 'grid' && target?.parentId;
      const minSize = (layoutMode === 'absolute' || isChildInGrid) ? 40 : 1;
      return prev.map(wi => wi.id === id ? { ...wi, w: Math.max(minSize, w), h: Math.max(minSize, h) } : wi);
    }, 'Resize widget');
  }, [commitWidgets, lockedIds, layoutMode]);

  // Clipboard
  const copySelected = useCallback(() => {
    setClipboard(widgets.filter(w => selectedIds.has(w.id)));
  }, [widgets, selectedIds]);

  const cutSelected = useCallback(() => {
    setClipboard(widgets.filter(w => selectedIds.has(w.id)));
    commitWidgets(prev => prev.filter(w => !selectedIds.has(w.id) || lockedIds.has(w.id)), 'Cut widgets');
    setSelectedIds(new Set());
  }, [widgets, selectedIds, commitWidgets, lockedIds]);

  const paste = useCallback(() => {
    if (clipboard.length === 0) return;
    const pasted = clipboard.map(w => {
      // Container children in grid mode use pixel offsets
      const offset = (layoutMode === 'absolute' || (layoutMode === 'grid' && w.parentId)) ? 20 : 1;
      return { ...w, id: generateWidgetId(), x: w.x + offset, y: w.y + offset };
    });
    commitWidgets(prev => [...prev, ...pasted], 'Paste widgets');
    setSelectedIds(new Set(pasted.map(w => w.id)));
  }, [clipboard, commitWidgets, layoutMode]);

  const duplicateSelected = useCallback(() => {
    const selected = widgets.filter(w => selectedIds.has(w.id));
    const duped = selected.map(w => {
      const offset = (layoutMode === 'absolute' || (layoutMode === 'grid' && w.parentId)) ? 20 : 1;
      return { ...w, id: generateWidgetId(), x: w.x + offset, y: w.y + offset };
    });
    commitWidgets(prev => [...prev, ...duped], 'Duplicate widgets');
    setSelectedIds(new Set(duped.map(w => w.id)));
  }, [widgets, selectedIds, commitWidgets, layoutMode]);

  // Z-order: widgets render in array order — later index = visually on top.
  // bringToFront moves selected widgets to the END of the array so they render last (on top).
  // sendToBack moves them to the START so they render first (behind everything).
  const bringToFront = useCallback(() => {
    commitWidgets(prev => {
      const sel = prev.filter(w => selectedIds.has(w.id));
      const rest = prev.filter(w => !selectedIds.has(w.id));
      return [...rest, ...sel];
    }, 'Bring to front');
  }, [commitWidgets, selectedIds]);

  const sendToBack = useCallback(() => {
    commitWidgets(prev => {
      const sel = prev.filter(w => selectedIds.has(w.id));
      const rest = prev.filter(w => !selectedIds.has(w.id));
      return [...sel, ...rest];
    }, 'Send to back');
  }, [commitWidgets, selectedIds]);

  // bringForward/sendBackward swap adjacent elements one position at a time,
  // like bubble sort — moving a widget one layer up or down in the stack.
  const bringForward = useCallback(() => {
    commitWidgets(prev => {
      const arr = [...prev];
      const ids = new Set(selectedIds);
      for (let i = arr.length - 2; i >= 0; i--) {
        if (ids.has(arr[i].id) && !ids.has(arr[i + 1].id)) {
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        }
      }
      return arr;
    }, 'Bring forward');
  }, [commitWidgets, selectedIds]);

  const sendBackward = useCallback(() => {
    commitWidgets(prev => {
      const arr = [...prev];
      const ids = new Set(selectedIds);
      for (let i = 1; i < arr.length; i++) {
        if (ids.has(arr[i].id) && !ids.has(arr[i - 1].id)) {
          [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        }
      }
      return arr;
    }, 'Send backward');
  }, [commitWidgets, selectedIds]);

  // Alignment
  const align = useCallback((direction: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v') => {
    if (selectedIds.size < 2) return;
    commitWidgets(prev => {
      const selected = prev.filter(w => selectedIds.has(w.id));
      const minX = Math.min(...selected.map(w => w.x));
      const maxX = Math.max(...selected.map(w => w.x + w.w));
      const minY = Math.min(...selected.map(w => w.y));
      const maxY = Math.max(...selected.map(w => w.y + w.h));
      return prev.map(w => {
        if (!selectedIds.has(w.id) || lockedIds.has(w.id)) return w;
        switch (direction) {
          case 'left': return { ...w, x: minX };
          case 'right': return { ...w, x: maxX - w.w };
          case 'top': return { ...w, y: minY };
          case 'bottom': return { ...w, y: maxY - w.h };
          case 'center-h': return { ...w, x: Math.round(minX + (maxX - minX - w.w) / 2) };
          case 'center-v': return { ...w, y: Math.round(minY + (maxY - minY - w.h) / 2) };
          default: return w;
        }
      });
    }, `Align ${direction}`);
  }, [commitWidgets, selectedIds, lockedIds]);

  const distribute = useCallback((direction: 'horizontal' | 'vertical') => {
    if (selectedIds.size < 3) return;
    commitWidgets(prev => {
      const selected = prev.filter(w => selectedIds.has(w.id) && !lockedIds.has(w.id));
      if (selected.length < 3) return prev;
      if (direction === 'horizontal') {
        const sorted = [...selected].sort((a, b) => a.x - b.x);
        const min = sorted[0].x;
        const max = sorted[sorted.length - 1].x;
        const step = (max - min) / (sorted.length - 1);
        const updates = new Map(sorted.map((w, i) => [w.id, Math.round(min + step * i)]));
        return prev.map(w => updates.has(w.id) ? { ...w, x: updates.get(w.id)! } : w);
      } else {
        const sorted = [...selected].sort((a, b) => a.y - b.y);
        const min = sorted[0].y;
        const max = sorted[sorted.length - 1].y;
        const step = (max - min) / (sorted.length - 1);
        const updates = new Map(sorted.map((w, i) => [w.id, Math.round(min + step * i)]));
        return prev.map(w => updates.has(w.id) ? { ...w, y: updates.get(w.id)! } : w);
      }
    }, `Distribute ${direction}`);
  }, [commitWidgets, selectedIds, lockedIds]);

  // Undo: pop the most recent snapshot from undoStack, save current state to redoStack,
  // then restore the snapshot. Redo does the exact reverse.
  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const entry = prev[prev.length - 1];
      setWidgets(current => {
        setRedoStack(rs => [...rs, { widgets: current, description: entry.description }]);
        return entry.widgets;
      });
      setDirty(true);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const entry = prev[prev.length - 1];
      setWidgets(current => {
        setUndoStack(us => [...us, { widgets: current, description: entry.description }]);
        return entry.widgets;
      });
      setDirty(true);
      return prev.slice(0, -1);
    });
  }, []);

  // Grid & zoom
  const setGridSettings = useCallback((patch: Partial<GridSettings>) => {
    setGridSettingsState(prev => ({ ...prev, ...patch }));
  }, []);

  const setZoom = useCallback((z: number) => {
    setZoomState(Math.max(0.5, Math.min(2, z)));
  }, []);

  // Lock
  const toggleLock = useCallback((id: string) => {
    setLockedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  // useMemo creates a stable object reference that only changes when its dependencies
  // change. Without this, returning a new object literal `{ editing, widgets, ... }`
  // every render would cause every component consuming this hook to re-render, even
  // if none of the actual values changed.
  return useMemo(() => ({
    editing, layoutMode, widgets, selectedIds, clipboard, gridSettings, dirty, zoom,
    enterEditMode, exitEditMode,
    select, selectMultiple, selectAll, clearSelection,
    addWidget, updateWidget, updateWidgetProps, deleteSelected, moveWidget, resizeWidget,
    copySelected, cutSelected, paste, duplicateSelected,
    bringToFront, sendToBack, bringForward, sendBackward,
    align, distribute,
    undo, redo,
    canUndo, canRedo,
    setGridSettings, setZoom,
    lockedIds, toggleLock,
  }), [
    editing, layoutMode, widgets, selectedIds, clipboard, gridSettings, dirty, zoom,
    enterEditMode, exitEditMode,
    select, selectMultiple, selectAll, clearSelection,
    addWidget, updateWidget, updateWidgetProps, deleteSelected, moveWidget, resizeWidget,
    copySelected, cutSelected, paste, duplicateSelected,
    bringToFront, sendToBack, bringForward, sendBackward,
    align, distribute,
    undo, redo,
    canUndo, canRedo,
    setGridSettings, setZoom,
    lockedIds, toggleLock,
  ]);
}
