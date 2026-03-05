import { useState, useCallback, useRef } from 'react';
import type { Widget } from '../types';

export interface GridSettings {
  cellSize: number;
  visible: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

interface HistoryEntry {
  widgets: Widget[];
  description: string;
}

export interface DesignModeState {
  editing: boolean;
  widgets: Widget[];
  selectedIds: Set<string>;
  clipboard: Widget[];
  gridSettings: GridSettings;
  dirty: boolean;
  zoom: number;

  // Mode toggle
  enterEditMode: (widgets: Widget[]) => void;
  exitEditMode: () => void;

  // Selection
  select: (id: string, additive?: boolean) => void;
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
  canvasWidth: 1920,
  canvasHeight: 1080,
};

const MAX_HISTORY = 50;

let nextWidgetId = 1;
export function generateWidgetId(): string {
  return `w_${Date.now()}_${nextWidgetId++}`;
}

export function useDesignMode(): DesignModeState {
  const [editing, setEditing] = useState(false);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<Widget[]>([]);
  const [gridSettings, setGridSettingsState] = useState<GridSettings>(DEFAULT_GRID);
  const [dirty, setDirty] = useState(false);
  const [zoom, setZoomState] = useState(1);
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());

  // Undo/redo stacks
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);

  const pushHistory = useCallback((ws: Widget[], description: string) => {
    undoStack.current.push({ widgets: ws, description });
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const commitWidgets = useCallback((updater: (prev: Widget[]) => Widget[], description: string) => {
    setWidgets(prev => {
      pushHistory(prev, description);
      const next = updater(prev);
      setDirty(true);
      return next;
    });
  }, [pushHistory]);

  // Mode toggle
  const enterEditMode = useCallback((ws: Widget[]) => {
    setWidgets(ws);
    setEditing(true);
    setDirty(false);
    setSelectedIds(new Set());
    undoStack.current = [];
    redoStack.current = [];
    setLockedIds(new Set());
  }, []);

  const exitEditMode = useCallback(() => {
    setEditing(false);
    setSelectedIds(new Set());
  }, []);

  // Selection
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
    commitWidgets(prev => prev.filter(w => !selectedIds.has(w.id) || lockedIds.has(w.id)), 'Delete widgets');
    setSelectedIds(new Set());
  }, [commitWidgets, selectedIds, lockedIds]);

  const moveWidget = useCallback((id: string, x: number, y: number) => {
    if (lockedIds.has(id)) return;
    commitWidgets(prev => prev.map(w => w.id === id ? { ...w, x, y } : w), 'Move widget');
  }, [commitWidgets, lockedIds]);

  const resizeWidget = useCallback((id: string, w: number, h: number) => {
    if (lockedIds.has(id)) return;
    commitWidgets(prev => prev.map(wi => wi.id === id ? { ...wi, w: Math.max(1, w), h: Math.max(1, h) } : wi), 'Resize widget');
  }, [commitWidgets, lockedIds]);

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
    const pasted = clipboard.map(w => ({
      ...w,
      id: generateWidgetId(),
      x: w.x + 1,
      y: w.y + 1,
    }));
    commitWidgets(prev => [...prev, ...pasted], 'Paste widgets');
    setSelectedIds(new Set(pasted.map(w => w.id)));
  }, [clipboard, commitWidgets]);

  const duplicateSelected = useCallback(() => {
    const selected = widgets.filter(w => selectedIds.has(w.id));
    const duped = selected.map(w => ({
      ...w,
      id: generateWidgetId(),
      x: w.x + 1,
      y: w.y + 1,
    }));
    commitWidgets(prev => [...prev, ...duped], 'Duplicate widgets');
    setSelectedIds(new Set(duped.map(w => w.id)));
  }, [widgets, selectedIds, commitWidgets]);

  // Z-order (array index = z-order, later = on top)
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

  // Undo/Redo
  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    setWidgets(prev => {
      redoStack.current.push({ widgets: prev, description: entry.description });
      return entry.widgets;
    });
    setDirty(true);
  }, []);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    setWidgets(prev => {
      undoStack.current.push({ widgets: prev, description: entry.description });
      return entry.widgets;
    });
    setDirty(true);
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

  return {
    editing, widgets, selectedIds, clipboard, gridSettings, dirty, zoom,
    enterEditMode, exitEditMode,
    select, selectAll, clearSelection,
    addWidget, updateWidget, updateWidgetProps, deleteSelected, moveWidget, resizeWidget,
    copySelected, cutSelected, paste, duplicateSelected,
    bringToFront, sendToBack, bringForward, sendBackward,
    undo, redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    setGridSettings, setZoom,
    lockedIds, toggleLock,
  };
}
