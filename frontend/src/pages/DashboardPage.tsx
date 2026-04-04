/**
 * DashboardPage — the main screen viewer and editor for the HMI.
 *
 * This page has two modes:
 *   1. Runtime mode: renders the active screen's widgets with live tag values
 *      from the WebSocket. Operators use this to monitor and control equipment.
 *   2. Design mode (Ctrl+E): opens the full screen editor with a widget palette,
 *      drag-and-drop canvas, and property panel. Only users with the 'designer'
 *      role can enter design mode.
 *
 * Screens can use two layout modes:
 *   - Grid: responsive 12-column CSS grid (default, adapts to screen size)
 *   - Absolute: fixed pixel positions on a target resolution canvas, scaled to fit
 *     the viewport with letterboxing (used for dedicated panel PCs)
 *
 * The URL pattern is /screen/:slug — each screen has a URL-friendly slug.
 * Tabs at the top let users switch between screens.
 */
import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Pencil, Plus, Trash2, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { TouchTextInput } from '../components/widgets/TouchTextInput';
import { api } from '../lib/api';
import { WidgetRenderer } from '../components/widgets/WidgetRenderer';
import { InfoButton } from '../components/widgets/InfoButton';
import { WidgetPalette } from '../components/designer/WidgetPalette';
import { PropertyPanel } from '../components/designer/PropertyPanel';
import { EditorToolbar } from '../components/designer/EditorToolbar';
import { SaveConfirmDialog } from '../components/designer/SaveConfirmDialog';
import { DesignCanvas } from '../components/designer/DesignCanvas';
import { useDesignMode, generateWidgetId } from '../hooks/useDesignMode';
import type { WidgetTypeInfo } from '../components/designer/WidgetPalette';
import { RESOLUTION_PRESETS, findPreset, computeCanvasDimensions } from '../components/designer/resolutionPresets';
import { getScaledDefaults } from '../components/designer/widgetTypes';
import { isTagVisible } from '../lib/tagVisibility';
import type { TagVisibilityMap } from '../lib/tagVisibility';
import { resolveWidgetTags, resolveTag } from '../lib/resolveTagPrefix';
import type { ScreenData, Widget, TagValue, AlarmData, LayoutMode, ScreenResolution, WidgetTemplate } from '../types';

interface Props {
  tagValues: Record<string, TagValue>;
  alarms?: AlarmData[];
  userRole?: string;
  tagVisibilityMap?: TagVisibilityMap;
}

export function DashboardPage({ tagValues, alarms = [], userRole, tagVisibilityMap = {} }: Props) {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [screens, setScreens] = useState<ScreenData[]>([]);
  const [activeScreen, setActiveScreen] = useState<ScreenData | null>(null);
  const [runtimeWidgets, setRuntimeWidgets] = useState<Widget[]>([]);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [showNewScreenDialog, setShowNewScreenDialog] = useState(false);
  const [newScreenName, setNewScreenName] = useState('');
  const [defaultLayout, setDefaultLayout] = useState<LayoutMode>('grid');
  const [defaultResolution, setDefaultResolution] = useState('1920x1080');
  const [newScreenMode, setNewScreenMode] = useState<LayoutMode>('grid');
  const [newScreenResolution, setNewScreenResolution] = useState('1920x1080');
  const [newScreenCustomW, setNewScreenCustomW] = useState(1920);
  const [newScreenCustomH, setNewScreenCustomH] = useState(1080);
  const [createScreenError, setCreateScreenError] = useState<string | null>(null);
  const [saveConfirm, setSaveConfirm] = useState<'save' | 'save-exit' | null>(null);
  const absContainerRef = useRef<HTMLDivElement>(null);
  const [absScale, setAbsScale] = useState(1);
  const [absOffset, setAbsOffset] = useState({ x: 0, y: 0 });
  const [collapsedContainerIds, setCollapsedContainerIds] = useState<Set<string>>(new Set());
  const [carouselPageMap, setCarouselPageMap] = useState<Record<string, number>>({});

  const handleCarouselPageChange = useCallback((id: string, page: number) => {
    setCarouselPageMap(prev => ({ ...prev, [id]: page }));
  }, []);
  const [dragTabId, setDragTabId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);

  const toggleContainerCollapsed = useCallback((id: string, collapsed: boolean) => {
    setCollapsedContainerIds(prev => {
      const next = new Set(prev);
      if (collapsed) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const [absPlacementOffset, setAbsPlacementOffset] = useState(0);

  // Widget templates for template_instance widgets
  const [widgetTemplates, setWidgetTemplates] = useState<WidgetTemplate[]>([]);
  const templateMap = useMemo(() => {
    const map = new Map<string, WidgetTemplate>();
    for (const t of widgetTemplates) map.set(t.name, t);
    return map;
  }, [widgetTemplates]);
  useEffect(() => {
    api.getWidgetTemplates().then(setWidgetTemplates).catch(() => {});
  }, []);

  const dm = useDesignMode();
  const isDesigner = userRole === 'designer';

  const handleSaveAsTemplate = useCallback(async (widgetId: string) => {
    const container = dm.widgets.find(w => w.id === widgetId);
    if (!container || container.type !== 'container') return;
    const children = dm.widgets.filter(w => w.parentId === widgetId);
    const name = prompt('Template name:', (container.props as Record<string, unknown>).title as string || 'New Template');
    if (!name) return;
    const layout = children.map(child => ({
      ...child,
      x: child.x - container.x,
      y: child.y - container.y,
      parentId: undefined,
    }));
    try {
      await api.createWidgetTemplate({ name, layout });
      api.getWidgetTemplates().then(setWidgetTemplates).catch(() => {});
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [dm.widgets]);

  // Parse screen layout mode and resolution
  const screenLayoutMode: LayoutMode = activeScreen?.layout_mode || 'grid';
  // editResolution resets when the screen or editing mode changes via resetKey
  const editResResetKey = `${activeScreen?.id}_${dm.editing}`;
  const [editResState, setEditResState] = useState<{ key: string; value: ScreenResolution | null }>({ key: editResResetKey, value: null });
  const editResolution = editResState.key === editResResetKey ? editResState.value : null;
  const setEditResolution = useCallback((v: ScreenResolution | null) => setEditResState({ key: editResResetKey, value: v }), [editResResetKey]);
  const screenResolution: ScreenResolution | null = editResolution ?? (() => {
    if (!activeScreen?.target_resolution) return null;
    try { return JSON.parse(activeScreen.target_resolution); } catch { return null; }
  })();

  const refreshScreens = useCallback(() => {
    api.getScreens().then(setScreens).catch(() => {});
  }, []);

  // Load preferences for default screen layout
  useEffect(() => {
    api.getPreferences().then((p) => {
      const layout = (p.default_screen_layout === 'absolute' ? 'absolute' : 'grid') as LayoutMode;
      setDefaultLayout(layout);
      setDefaultResolution(p.default_screen_resolution || '1920x1080');
      setNewScreenMode(layout);
      setNewScreenResolution(p.default_screen_resolution || '1920x1080');
    }).catch(() => {});
  }, []);

  // Load screens
  useEffect(() => {
    refreshScreens();
  }, [refreshScreens]);

  // Load active screen; if no slug provided, pick the default or first available screen
  useEffect(() => {
    if (slug) {
      api.getScreenBySlug(slug)
        .then((s) => {
          setActiveScreen(s);
          try {
            const widgets: Widget[] = JSON.parse(s.layout || '[]');
            setRuntimeWidgets(widgets);
            // Initialize collapsed state from defaultCollapsed props
            const collapsed = new Set<string>();
            for (const w of widgets) {
              if (w.type === 'container' && (w.props as Record<string, unknown>).containerMode === 'collapsible' && (w.props as Record<string, unknown>).defaultCollapsed) {
                collapsed.add(w.id);
              }
            }
            setCollapsedContainerIds(collapsed);
          } catch { setRuntimeWidgets([]); }
        })
        .catch(() => {
          setActiveScreen(null);
          setRuntimeWidgets([]);
        });
    } else {
      // No slug — find the default or first screen and redirect
      api.getScreens().then((all) => {
        if (all.length > 0) {
          const def = all.find(s => s.is_default) || all[0];
          navigate(`/screen/${def.slug}`, { replace: true });
        } else {
          setActiveScreen(null);
          setRuntimeWidgets([]);
        }
      }).catch(() => {
        setActiveScreen(null);
        setRuntimeWidgets([]);
      });
    }
  }, [slug, navigate, screens]);

  // Enter edit mode
  const handleEnterEdit = useCallback(() => {
    if (!activeScreen) return;
    dm.enterEditMode(runtimeWidgets, screenLayoutMode);
    setAbsPlacementOffset(0);
  }, [activeScreen, runtimeWidgets, dm, screenLayoutMode]);

  // Change canvas resolution while editing
  const handleResolutionChange = useCallback((resolution: ScreenResolution) => {
    setEditResolution(resolution);
    dm.markDirty();
  }, [dm, setEditResolution]);

  // Perform the actual save (called after confirmation)
  const performSave = useCallback(async () => {
    if (!activeScreen) return;
    const targetRes = editResolution
      ? JSON.stringify(editResolution)
      : activeScreen.target_resolution;
    await api.saveScreen(activeScreen.id, {
      name: activeScreen.name,
      slug: activeScreen.slug,
      layout: dm.widgets,
      layout_mode: screenLayoutMode,
      target_resolution: targetRes,
      is_default: activeScreen.is_default,
      sort_order: activeScreen.sort_order,
    });
    // Update activeScreen in state so the new resolution persists
    setActiveScreen(prev => prev ? { ...prev, target_resolution: targetRes } : prev);
    setRuntimeWidgets(dm.widgets);
  }, [activeScreen, dm.widgets, screenLayoutMode, editResolution]);

  // Save — show confirmation dialog
  const handleSave = useCallback(() => {
    if (!activeScreen || !dm.dirty) return;
    setSaveConfirm('save');
  }, [activeScreen, dm.dirty]);

  // Save & exit — show confirmation dialog
  const handleSaveAndExit = useCallback(() => {
    if (!activeScreen || !dm.dirty) return;
    setSaveConfirm('save-exit');
  }, [activeScreen, dm.dirty]);

  // Confirm save from dialog
  const handleSaveConfirm = useCallback(async () => {
    const mode = saveConfirm;
    setSaveConfirm(null);
    await performSave();
    if (mode === 'save-exit') dm.exitEditMode();
  }, [saveConfirm, performSave, dm]);

  // Discard
  const handleDiscard = useCallback(() => {
    if (dm.dirty && !window.confirm('Discard unsaved changes?')) return;
    dm.exitEditMode();
  }, [dm]);

  // Add widget from palette.
  // In absolute mode, each new widget is offset by 20px from the last so they don't
  // stack directly on top of each other — this makes it obvious that a new widget
  // was added and lets the designer immediately drag it to the desired position.
  const handleAddWidget = useCallback((typeInfo: WidgetTypeInfo) => {
    const isAbs = dm.layoutMode === 'absolute';
    const scaled = isAbs && screenResolution
      ? getScaledDefaults(typeInfo, screenResolution.width)
      : null;
    const widget: Widget = {
      id: generateWidgetId(),
      type: typeInfo.type,
      x: isAbs ? absPlacementOffset : 0,
      y: isAbs ? absPlacementOffset : 0,
      w: isAbs ? (scaled?.absW ?? typeInfo.defaultAbsW) : typeInfo.defaultW,
      h: isAbs ? (scaled?.absH ?? typeInfo.defaultAbsH) : typeInfo.defaultH,
      props: { ...typeInfo.defaultProps },
      ...(isAbs ? { chrome: 'compact' as const } : {}),
    };
    dm.addWidget(widget);
    dm.select(widget.id);
    if (isAbs) setAbsPlacementOffset(prev => prev + 20);
  }, [dm, absPlacementOffset, screenResolution]);

  // Create new screen
  const handleCreateScreen = useCallback(async () => {
    if (!newScreenName.trim()) return;
    const screenSlug = newScreenName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let targetRes: string | null = null;
    if (newScreenMode === 'absolute') {
      let w: number, h: number;
      if (newScreenResolution === 'custom') {
        const canvas = computeCanvasDimensions(newScreenCustomW, newScreenCustomH);
        w = canvas.width;
        h = canvas.height;
      } else {
        const preset = findPreset(newScreenResolution);
        if (preset) {
          w = preset.canvasWidth;
          h = preset.canvasHeight;
        } else {
          const [rw, rh] = newScreenResolution.split('x').map(Number);
          const canvas = computeCanvasDimensions(rw, rh);
          w = canvas.width;
          h = canvas.height;
        }
      }
      targetRes = JSON.stringify({ width: w, height: h });
    }
    try {
      await api.createScreen({
        name: newScreenName.trim(),
        slug: screenSlug,
        layout: [],
        layout_mode: newScreenMode,
        target_resolution: targetRes,
        is_default: screens.length === 0,
        sort_order: screens.length,
      });
    } catch (err) {
      setCreateScreenError(err instanceof Error ? err.message : 'Failed to create screen');
      return;
    }
    setShowNewScreenDialog(false);
    setCreateScreenError(null);
    setNewScreenName('');
    setNewScreenMode(defaultLayout);
    setNewScreenResolution(defaultResolution);
    refreshScreens();
    navigate(`/screen/${screenSlug}`);
  }, [newScreenName, screens.length, refreshScreens, newScreenMode, newScreenResolution, newScreenCustomW, newScreenCustomH, defaultLayout, defaultResolution, navigate]);

  // Delete current screen
  const handleDeleteScreen = useCallback(async () => {
    if (!activeScreen) return;
    if (!window.confirm(`Delete screen "${activeScreen.name}"? This cannot be undone.`)) return;
    await api.deleteScreen(activeScreen.id);
    refreshScreens();
    navigate('/');
  }, [activeScreen, refreshScreens, navigate]);

  // Reorder screens via drag-and-drop
  const handleTabDrop = useCallback(async (dragId: number, dropId: number) => {
    if (dragId === dropId) return;
    const oldIndex = screens.findIndex(s => s.id === dragId);
    const newIndex = screens.findIndex(s => s.id === dropId);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = [...screens];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    // Optimistic update
    setScreens(reordered);
    const items = reordered.map((s, i) => ({ id: s.id, sort_order: i }));
    try {
      await api.reorderScreens(items);
      refreshScreens();
    } catch {
      refreshScreens();
    }
  }, [screens, refreshScreens]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!dm.editing) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === 'e' && isDesigner) {
          e.preventDefault();
          handleEnterEdit();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSave(); return; }
      if (e.ctrlKey && e.key === 'e') { e.preventDefault(); handleDiscard(); return; }
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) dm.redo(); else dm.undo();
        return;
      }
      if (e.ctrlKey && e.key === 'c') { e.preventDefault(); dm.copySelected(); return; }
      if (e.ctrlKey && e.key === 'x') { e.preventDefault(); dm.cutSelected(); return; }
      if (e.ctrlKey && e.key === 'v') { e.preventDefault(); dm.paste(); return; }
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); dm.duplicateSelected(); return; }
      if (e.ctrlKey && e.key === 'a') { e.preventDefault(); dm.selectAll(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          if (dm.selectedIds.size > 0) {
            if (e.shiftKey || window.confirm(`Delete ${dm.selectedIds.size} widget(s)?`)) {
              dm.deleteSelected();
            }
          }
        }
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === ']') { e.preventDefault(); dm.bringToFront(); return; }
      if (e.ctrlKey && e.shiftKey && e.key === '[') { e.preventDefault(); dm.sendToBack(); return; }
      if (e.ctrlKey && e.key === ']') { e.preventDefault(); dm.bringForward(); return; }
      if (e.ctrlKey && e.key === '[') { e.preventDefault(); dm.sendBackward(); return; }
      if (e.key === 'Escape') { dm.clearSelection(); return; }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dm, handleSave, handleDiscard, handleEnterEdit, isDesigner]);

  // Viewport scaling for absolute mode runtime rendering
  useEffect(() => {
    if (dm.editing || screenLayoutMode !== 'absolute' || !screenResolution || !absContainerRef.current) return;
    const updateScale = () => {
      const container = absContainerRef.current;
      if (!container) return;
      const availW = container.clientWidth;
      const availH = container.clientHeight;
      const scaleX = availW / screenResolution.width;
      const scaleY = availH / screenResolution.height;
      const s = Math.min(scaleX, scaleY);
      setAbsScale(prev => prev === s ? prev : s);
      setAbsOffset(prev => {
        const newX = (availW - screenResolution.width * s) / 2;
        const newY = (availH - screenResolution.height * s) / 2;
        if (prev.x === newX && prev.y === newY) return prev;
        return { x: newX, y: newY };
      });
    };
    updateScale();
    let rafId: number;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateScale);
    });
    observer.observe(absContainerRef.current);
    return () => { observer.disconnect(); cancelAnimationFrame(rafId); };
  }, [dm.editing, screenLayoutMode, screenResolution]);

  const selectedWidget = dm.selectedIds.size === 1
    ? dm.widgets.find(w => dm.selectedIds.has(w.id)) || null
    : null;

  // Build a lookup map for parent widgets (O(1) instead of O(n) per widget in memo comparator)
  const widgetMap = useMemo(() => {
    const map = new Map<string, Widget>();
    for (const w of runtimeWidgets) map.set(w.id, w);
    return map;
  }, [runtimeWidgets]);

  // Pre-build children-by-parent map for O(1) container child lookup
  // instead of O(n) filtering per container per render cycle
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Widget[]>();
    for (const w of runtimeWidgets) {
      if (w.parentId) {
        let children = map.get(w.parentId);
        if (!children) { children = []; map.set(w.parentId, children); }
        children.push(w);
      }
    }
    return map;
  }, [runtimeWidgets]);

  // ─── Swipe navigation between screens ───
  const visibleScreens = useMemo(() => screens.filter(s => s.slug !== 'support'), [screens]);
  const activeScreenIndex = useMemo(() => {
    if (!activeScreen) return -1;
    return visibleScreens.findIndex(s => s.id === activeScreen.id);
  }, [activeScreen, visibleScreens]);

  const swipeRef = useRef({ startX: 0, startY: 0, swiping: false });

  const handleSwipeNavigate = useCallback((dx: number, dy: number) => {
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) {
      if (dx < 0 && activeScreenIndex < visibleScreens.length - 1) {
        navigate(`/screen/${visibleScreens[activeScreenIndex + 1].slug}`);
      } else if (dx > 0 && activeScreenIndex > 0) {
        navigate(`/screen/${visibleScreens[activeScreenIndex - 1].slug}`);
      }
    }
  }, [activeScreenIndex, visibleScreens, navigate]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    swipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, swiping: true };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeRef.current.swiping) return;
    swipeRef.current.swiping = false;
    handleSwipeNavigate(
      e.changedTouches[0].clientX - swipeRef.current.startX,
      e.changedTouches[0].clientY - swipeRef.current.startY,
    );
  }, [handleSwipeNavigate]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    swipeRef.current = { startX: e.clientX, startY: e.clientY, swiping: true };
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!swipeRef.current.swiping) return;
    swipeRef.current.swiping = false;
    handleSwipeNavigate(
      e.clientX - swipeRef.current.startX,
      e.clientY - swipeRef.current.startY,
    );
  }, [handleSwipeNavigate]);

  const [showDesignerTabs, setShowDesignerTabs] = useState(false);

  // ─── DESIGN MODE ───
  if (dm.editing) {
    return (
      <div className="flex flex-col h-full -mx-4 -mt-1 -mb-4">
        <EditorToolbar
          screenName={activeScreen?.name || 'Screen'}
          dirty={dm.dirty}
          canUndo={dm.canUndo}
          canRedo={dm.canRedo}
          gridSettings={dm.gridSettings}
          zoom={dm.zoom}
          layoutMode={dm.layoutMode}
          targetResolution={screenResolution}
          onUndo={dm.undo}
          onRedo={dm.redo}
          onSave={handleSave}
          onSaveAndExit={handleSaveAndExit}
          onDiscard={handleDiscard}
          onGridSettingsChange={dm.setGridSettings}
          onZoomChange={dm.setZoom}
          onResolutionChange={handleResolutionChange}
        />
        <div className="flex flex-1 overflow-hidden">
          <WidgetPalette
            onAddWidget={handleAddWidget}
            collapsed={paletteCollapsed}
            onToggleCollapse={() => setPaletteCollapsed(!paletteCollapsed)}
          />
          <DesignCanvas
            widgets={dm.widgets}
            tagValues={tagValues}
            alarms={alarms}
            selectedIds={dm.selectedIds}
            lockedIds={dm.lockedIds}
            gridSettings={dm.gridSettings}
            zoom={dm.zoom}
            layoutMode={dm.layoutMode}
            targetResolution={screenResolution}
            onSelect={dm.select}
            onSelectMultiple={dm.selectMultiple}
            onClearSelection={dm.clearSelection}
            onMoveWidget={dm.moveWidget}
            onResizeWidget={dm.resizeWidget}
            onCopy={dm.copySelected}
            onCut={dm.cutSelected}
            onPaste={dm.paste}
            onDuplicate={dm.duplicateSelected}
            onDelete={dm.deleteSelected}
            onBringToFront={dm.bringToFront}
            onSendToBack={dm.sendToBack}
            onBringForward={dm.bringForward}
            onSendBackward={dm.sendBackward}
            onToggleLock={dm.toggleLock}
            onSelectAll={dm.selectAll}
            onSaveAsTemplate={handleSaveAsTemplate}
            onAlign={dm.align}
            onDistribute={dm.distribute}
          />
          <PropertyPanel
            widget={selectedWidget}
            widgets={dm.widgets}
            layoutMode={dm.layoutMode}
            onUpdateProps={dm.updateWidgetProps}
            onUpdateWidget={dm.updateWidget}
            onDelete={dm.deleteSelected}
            locked={selectedWidget ? dm.lockedIds.has(selectedWidget.id) : false}
            onToggleLock={() => selectedWidget && dm.toggleLock(selectedWidget.id)}
          />
        </div>

        {/* Save Confirmation Dialog */}
        {saveConfirm && (
          <SaveConfirmDialog
            originalWidgets={runtimeWidgets}
            currentWidgets={dm.widgets}
            onSave={handleSaveConfirm}
            onCancel={() => setSaveConfirm(null)}
            saveAndExit={saveConfirm === 'save-exit'}
          />
        )}
      </div>
    );
  }

  // ─── RUNTIME MODE ───
  return (
    <div
      className={screenLayoutMode === 'absolute' && screenResolution ? 'flex flex-col h-full overflow-hidden' : ''}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {/* Screen carousel indicators + designer controls */}
      {visibleScreens.length > 1 && (
        <div className="flex items-center justify-center gap-2 mb-0.5">
          {/* Prev arrow */}
          <button
            onClick={() => activeScreenIndex > 0 && navigate(`/screen/${visibleScreens[activeScreenIndex - 1].slug}`)}
            disabled={activeScreenIndex <= 0}
            className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-default"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Dot indicators */}
          <div className="flex items-center gap-1.5">
            {visibleScreens.map((s, i) => (
              <button
                key={s.id}
                onClick={() => navigate(`/screen/${s.slug}`)}
                title={s.name}
                className={`rounded-full transition-all ${
                  i === activeScreenIndex
                    ? 'w-3 h-3 bg-[var(--hmi-accent)]'
                    : 'w-2 h-2 bg-slate-600 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>

          {/* Next arrow */}
          <button
            onClick={() => activeScreenIndex < visibleScreens.length - 1 && navigate(`/screen/${visibleScreens[activeScreenIndex + 1].slug}`)}
            disabled={activeScreenIndex >= visibleScreens.length - 1}
            className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-default"
          >
            <ChevronRight size={16} />
          </button>

          {/* Screen name */}
          {activeScreen && (
            <span className="text-sm text-slate-500 ml-1">{activeScreen.name}</span>
          )}

          {/* Designer toggle */}
          {isDesigner && (
            <button
              onClick={() => setShowDesignerTabs(prev => !prev)}
              className="ml-auto px-2 py-1 text-xs text-slate-500 hover:text-slate-300"
              title="Show screen tabs"
            >
              <GripVertical size={14} />
            </button>
          )}
        </div>
      )}

      {/* Collapsible designer tab bar */}
      {isDesigner && showDesignerTabs && (
        <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1 transition-all">
          <div className="flex gap-2 overflow-x-auto">
            {visibleScreens.map((s) => (
              <Link
                key={s.id}
                to={`/screen/${s.slug}`}
                draggable
                onDragStart={e => {
                  setDragTabId(s.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={e => {
                  if (dragTabId == null || dragTabId === s.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDropTargetId(s.id);
                }}
                onDragLeave={() => { if (dropTargetId === s.id) setDropTargetId(null); }}
                onDrop={e => {
                  e.preventDefault();
                  if (dragTabId != null) handleTabDrop(dragTabId, s.id);
                  setDragTabId(null);
                  setDropTargetId(null);
                }}
                onDragEnd={() => { setDragTabId(null); setDropTargetId(null); }}
                className={`flex items-center gap-1 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  activeScreen?.id === s.id
                    ? 'bg-[var(--hmi-accent)] text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                } ${dragTabId === s.id ? 'opacity-40' : ''} ${dropTargetId === s.id ? 'ring-2 ring-blue-400' : ''}`}
              >
                <GripVertical size={12} className="text-slate-600 flex-shrink-0 cursor-grab" />
                {s.name}
              </Link>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => { setShowNewScreenDialog(true); setCreateScreenError(null); }}
              className="flex items-center justify-center min-w-[36px] min-h-[36px] p-2 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
              title="New screen"
            >
              <Plus size={14} />
            </button>
            {activeScreen && (
              <button
                onClick={handleDeleteScreen}
                className="flex items-center justify-center min-w-[36px] min-h-[36px] p-2 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-600/10 transition-colors"
                title="Delete screen"
              >
                <Trash2 size={14} />
              </button>
            )}
            {activeScreen && (
              <button
                onClick={handleEnterEdit}
                className="flex items-center gap-1 px-2.5 py-2 min-h-[36px] rounded-md text-xs font-medium bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                title="Edit screen (Ctrl+E)"
              >
                <Pencil size={14} />
                Edit
              </button>
            )}
          </div>
        </div>
      )}

      {/* Widget rendering */}
      {screenLayoutMode === 'absolute' && screenResolution ? (
        /* Absolute mode: scaled canvas with letterboxing */
        <div ref={absContainerRef} className="flex-1 relative bg-[var(--hmi-bg-body)] overflow-hidden select-none touch-pan-y" style={{ minHeight: 400 }}>
          <div
            style={{
              width: screenResolution.width,
              height: screenResolution.height,
              transform: `translate(${absOffset.x}px, ${absOffset.y}px) scale(${absScale})`,
              transformOrigin: 'top left',
              position: 'absolute',
              background: '#0f172a',
            }}
          >
            {runtimeWidgets.map((w, index) => (
              <RuntimeWidget key={w.id} widget={w} index={index} isAbsolute tagValues={tagValues} alarms={alarms} userRole={userRole} tagVisibilityMap={tagVisibilityMap} widgetMap={widgetMap} childrenByParent={childrenByParent} collapsedContainerIds={collapsedContainerIds} onToggleContainerCollapsed={toggleContainerCollapsed} carouselPageMap={carouselPageMap} onCarouselPageChange={handleCarouselPageChange} templateMap={templateMap} />
            ))}
          </div>
        </div>
      ) : (
        /* Grid mode: CSS grid layout — top-level widgets in grid, children inside containers */
        <div
          className="grid gap-4 select-none touch-pan-y"
          style={{ gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: '80px' }}
        >
          {runtimeWidgets.filter(w => !w.parentId).map((w, index) => (
            <RuntimeWidget key={w.id} widget={w} index={index} isAbsolute={false} tagValues={tagValues} alarms={alarms} userRole={userRole} tagVisibilityMap={tagVisibilityMap} widgetMap={widgetMap} childrenByParent={childrenByParent} collapsedContainerIds={collapsedContainerIds} onToggleContainerCollapsed={toggleContainerCollapsed} carouselPageMap={carouselPageMap} onCarouselPageChange={handleCarouselPageChange} templateMap={templateMap} />
          ))}
        </div>
      )}

      {runtimeWidgets.length === 0 && !activeScreen && (
        <div className="text-center text-slate-500 mt-20">
          <p className="text-lg">No screen found</p>
          {isDesigner ? (
            <button
              onClick={() => { setShowNewScreenDialog(true); setCreateScreenError(null); }}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--hmi-accent)] text-white text-sm hover:opacity-90 transition-opacity"
            >
              <Plus size={14} />
              Create Screen
            </button>
          ) : (
            <p className="text-sm mt-1">No screens have been created yet</p>
          )}
        </div>
      )}

      {runtimeWidgets.length === 0 && activeScreen && (
        <div className="text-center text-slate-500 mt-20">
          <p className="text-lg">No widgets configured</p>
          <p className="text-sm mt-1">
            {isDesigner ? 'Press Ctrl+E or click Edit to design this screen' : 'Add widgets using the screen designer'}
          </p>
        </div>
      )}

      {/* New Screen Dialog */}
      {showNewScreenDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewScreenDialog(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-200 mb-4">New Screen</h3>
            <TouchTextInput
              value={newScreenName}
              onChange={setNewScreenName}
              placeholder="Screen name"
              title="Screen Name"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 min-h-[44px] text-sm text-white flex items-center mb-1"
            />
            {createScreenError && (
              <p className="text-xs text-red-400 mb-3">{createScreenError}</p>
            )}
            {!createScreenError && <div className="mb-4" />}

            {/* Layout Mode */}
            <div className="mb-4">
              <label className="text-xs text-slate-400 mb-1.5 block">Layout Mode</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setNewScreenMode('grid')}
                  className={`flex-1 px-3 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                    newScreenMode === 'grid' ? 'bg-[var(--hmi-accent)] text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setNewScreenMode('absolute')}
                  className={`flex-1 px-3 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                    newScreenMode === 'absolute' ? 'bg-[var(--hmi-accent)] text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Absolute
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {newScreenMode === 'grid' ? 'Responsive 12-column grid layout' : 'Fixed pixel positioning for panel PCs'}
              </p>
            </div>

            {/* Resolution (absolute mode only) */}
            {newScreenMode === 'absolute' && (
              <div className="mb-4">
                <label className="text-xs text-slate-400 mb-1.5 block">Target Resolution</label>
                <select
                  value={newScreenResolution}
                  onChange={e => setNewScreenResolution(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 min-h-[44px] text-sm text-white outline-none focus:border-blue-500 mb-1"
                >
                  {RESOLUTION_PRESETS.map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                  <option value="custom">Custom...</option>
                </select>
                {newScreenResolution !== 'custom' && findPreset(newScreenResolution) && (
                  <p className="text-[10px] text-slate-500 mb-2">
                    Canvas: {findPreset(newScreenResolution)!.canvasWidth} × {findPreset(newScreenResolution)!.canvasHeight}px (after header &amp; sidebar)
                  </p>
                )}
                {newScreenResolution === 'custom' && (
                  <div className="mb-2">
                    <div className="flex gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500">Screen Width</label>
                        <input type="number" value={newScreenCustomW} onChange={e => setNewScreenCustomW(Number(e.target.value))}
                          min={320} max={3840}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500">Screen Height</label>
                        <input type="number" value={newScreenCustomH} onChange={e => setNewScreenCustomH(Number(e.target.value))}
                          min={240} max={2160}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Canvas: {newScreenCustomW - 64} × {newScreenCustomH - 64}px (after header &amp; sidebar)
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewScreenDialog(false)}
                className="px-4 py-2.5 min-h-[44px] rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleCreateScreen} disabled={!newScreenName.trim()}
                className="px-4 py-2.5 min-h-[44px] rounded-lg text-sm bg-[var(--hmi-accent)] text-white hover:bg-[var(--hmi-accent-dark)] disabled:opacity-40 transition-colors">
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Memoized runtime widget wrapper ───
// Avoids rebuilding visibility/enabled logic for every widget on each tagValues change.
// Only re-renders when the specific tags this widget cares about change.
interface RuntimeWidgetProps {
  widget: Widget;
  index: number;
  isAbsolute: boolean;
  tagValues: Record<string, TagValue>;
  alarms: AlarmData[];
  userRole?: string;
  tagVisibilityMap: TagVisibilityMap;
  widgetMap: Map<string, Widget>;
  childrenByParent: Map<string, Widget[]>;
  collapsedContainerIds: Set<string>;
  onToggleContainerCollapsed: (id: string, collapsed: boolean) => void;
  carouselPageMap: Record<string, number>;
  onCarouselPageChange: (id: string, page: number) => void;
  templateMap: Map<string, WidgetTemplate>;
}

const RuntimeWidget = memo(function RuntimeWidget({ widget: w, index, isAbsolute, tagValues, alarms, userRole, tagVisibilityMap, widgetMap, childrenByParent, collapsedContainerIds, onToggleContainerCollapsed, carouselPageMap, onCarouselPageChange, templateMap }: RuntimeWidgetProps) {
  // Cascade container visibility to children (and collapse state for collapsible containers)
  if (w.parentId) {
    const parent = widgetMap.get(w.parentId);
    if (parent && parent.type === 'container') {
      const parentVis = (parent.visible !== false)
        && (!parent.visibleTag || !!tagValues[parent.visibleTag]?.value)
        && (!parent.visibleRoles?.length || (userRole && parent.visibleRoles.includes(userRole)));
      if (!parentVis) return null;
      const parentProps = parent.props as Record<string, unknown>;
      const parentMode = parentProps.containerMode as string;
      // Hide children of collapsed collapsible containers
      if (parentMode === 'collapsible' && collapsedContainerIds.has(parent.id)) return null;
      // Hide children not on the active carousel page
      if (parentMode === 'carousel') {
        const activePage = carouselPageMap[parent.id] ?? 0;
        const childPage = (w.props as Record<string, unknown>).page as number ?? 0;
        if (childPage !== activePage) return null;
      }
    }
  }

  // Resolve relative tags via parent container's tagPrefix
  const rw = (() => {
    if (!w.parentId) return w;
    const parent = widgetMap.get(w.parentId);
    if (!parent || parent.type !== 'container') return w;
    const prefix = (parent.props as Record<string, unknown>).tagPrefix as string | undefined;
    return prefix ? resolveWidgetTags(w, prefix) : w;
  })();

  const visibleByProp = rw.visible !== false;
  const visibleByTag = rw.visibleTag ? !!tagValues[rw.visibleTag]?.value : true;
  const visibleByRole = !rw.visibleRoles || rw.visibleRoles.length === 0 || (userRole && rw.visibleRoles.includes(userRole));
  // Tag-level visibility: check if the widget's primary tag has visibility conditions
  const primaryTag = (rw.props as Record<string, unknown>).tag as string | undefined;
  const visibleByTagConfig = primaryTag ? isTagVisible(primaryTag, tagVisibilityMap, tagValues) : true;
  if (!visibleByProp || !visibleByTag || !visibleByRole || !visibleByTagConfig) return null;

  const enabledByProp = rw.enabled !== false;
  const enabledByTag = rw.enabledTag ? !!tagValues[rw.enabledTag]?.value : true;
  const enabledByRole = !rw.enabledRoles || rw.enabledRoles.length === 0 || (userRole && rw.enabledRoles.includes(userRole));
  const isEnabled = enabledByProp && enabledByTag && enabledByRole;

  const tagName = (rw.props as Record<string, unknown>).tag as string | undefined;
  const longDesc = tagName ? tagValues[tagName]?.description : undefined;
  const containerDesc = rw.type === 'container' ? (rw.props as Record<string, unknown>).description as string : undefined;
  const infoDesc = longDesc || containerDesc;
  const showInfoBtn = w.showInfo !== false && !!infoDesc;

  // Container mode props
  const wProps = w.props as Record<string, unknown>;
  const isCollapsible = w.type === 'container' && wProps.containerMode === 'collapsible';
  const isCarousel = w.type === 'container' && wProps.containerMode === 'carousel';
  const collapsibleProps = isCollapsible ? {
    collapsed: collapsedContainerIds.has(w.id),
    onToggleCollapsed: (c: boolean) => onToggleContainerCollapsed(w.id, c),
  } : {};
  const carouselProps = isCarousel ? (() => {
    const allChildren = Array.from(widgetMap.values()).filter(c => c.parentId === w.id);
    const maxPage = allChildren.reduce((max, c) => Math.max(max, (c.props as Record<string, unknown>).page as number ?? 0), 0);
    return {
      pageCount: maxPage + 1,
      currentPage: carouselPageMap[w.id] ?? 0,
      onPageChange: (page: number) => onCarouselPageChange(w.id, page),
    };
  })() : {};

  if (isAbsolute) {
    return (
      <div
        className={`absolute ${isEnabled ? '' : 'opacity-50 pointer-events-none'}`}
        style={{ left: w.x, top: w.y, width: w.w, height: w.h, zIndex: index }}
      >
        {showInfoBtn && <InfoButton description={infoDesc!} title={(rw.props as Record<string, unknown>).title as string} />}
        <WidgetRenderer widget={rw} tagValues={tagValues} alarms={alarms} tagVisibilityMap={tagVisibilityMap} templateMap={templateMap} {...collapsibleProps} {...carouselProps} />
      </div>
    );
  }

  const isContainer = w.type === 'container';
  const children = isContainer && !isAbsolute
    ? (childrenByParent.get(w.id) ?? [])
    : [];

  return (
    <div
      style={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}
      className={`relative ${isEnabled ? '' : 'opacity-50 pointer-events-none'}`}
    >
      {showInfoBtn && <InfoButton description={infoDesc!} title={(rw.props as Record<string, unknown>).title as string} />}
      <WidgetRenderer widget={rw} tagValues={tagValues} alarms={alarms} templateMap={templateMap} {...collapsibleProps} {...carouselProps} />
      {/* Render container children with pixel-based positioning */}
      {children.map((child: Widget, ci: number) => (
        <RuntimeWidget key={child.id} widget={child} index={ci} isAbsolute tagValues={tagValues} alarms={alarms} userRole={userRole} tagVisibilityMap={tagVisibilityMap} widgetMap={widgetMap} childrenByParent={childrenByParent} collapsedContainerIds={collapsedContainerIds} onToggleContainerCollapsed={onToggleContainerCollapsed} carouselPageMap={carouselPageMap} onCarouselPageChange={onCarouselPageChange} templateMap={templateMap} />
      ))}
    </div>
  );
}, (prev, next) => {
  if (prev.widget !== next.widget) return false;
  if (prev.index !== next.index) return false;
  if (prev.isAbsolute !== next.isAbsolute) return false;
  // Only re-render for alarm changes if this widget actually uses alarms
  if (prev.alarms !== next.alarms && prev.widget.type === 'alarm_summary') return false;
  if (prev.userRole !== next.userRole) return false;
  if (prev.tagVisibilityMap !== next.tagVisibilityMap) return false;
  if (prev.childrenByParent !== next.childrenByParent) return false;
  if (prev.templateMap !== next.templateMap) return false;
  if (prev.collapsedContainerIds !== next.collapsedContainerIds) return false;
  if (prev.carouselPageMap !== next.carouselPageMap) return false;

  // Only diff the tag values this widget actually reads
  const w = prev.widget;
  const tagNames: string[] = [];
  const p = w.props as Record<string, unknown>;
  if (typeof p.tag === 'string' && p.tag) tagNames.push(p.tag);
  if (typeof p.availabilityTag === 'string') tagNames.push(p.availabilityTag);
  if (typeof p.performanceTag === 'string') tagNames.push(p.performanceTag);
  if (typeof p.qualityTag === 'string') tagNames.push(p.qualityTag);
  if (typeof p.oeeTag === 'string') tagNames.push(p.oeeTag);
  if (Array.isArray(p.tags)) for (const t of p.tags) if (t?.tag) tagNames.push(t.tag);
  if (Array.isArray(p.controls)) for (const c of p.controls) if (c?.tag) tagNames.push(c.tag);
  // Also check visibility/enabled tags
  if (w.visibleTag) tagNames.push(w.visibleTag);
  if (w.enabledTag) tagNames.push(w.enabledTag);
  // Check parent visibility tag and resolve relative tags via parent's tagPrefix
  if (w.parentId) {
    const parent = prev.widgetMap.get(w.parentId);
    if (parent?.visibleTag) tagNames.push(parent.visibleTag);
    // Resolve relative tags for children of containers with tagPrefix
    if (parent?.type === 'container') {
      const parentPrefix = (parent.props as Record<string, unknown>).tagPrefix as string | undefined;
      if (parentPrefix) {
        for (let i = 0; i < tagNames.length; i++) {
          tagNames[i] = resolveTag(tagNames[i], parentPrefix);
        }
      }
    }
  }
  // Include tags referenced by visibility conditions for the primary tag
  const primaryTag = typeof p.tag === 'string' ? p.tag : undefined;
  if (primaryTag) {
    const conditions = prev.tagVisibilityMap[primaryTag];
    if (conditions) for (const c of conditions) tagNames.push(c.tag);
  }

  for (const name of tagNames) {
    if (prev.tagValues[name] !== next.tagValues[name]) return false;
  }
  return true;
});
