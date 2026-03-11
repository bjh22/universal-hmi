import { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Pencil, Plus, Trash2, GripVertical } from 'lucide-react';
import { api } from '../lib/api';
import { WidgetRenderer } from '../components/widgets/WidgetRenderer';
import { InfoButton } from '../components/widgets/InfoButton';
import { WidgetPalette } from '../components/designer/WidgetPalette';
import { PropertyPanel } from '../components/designer/PropertyPanel';
import { EditorToolbar } from '../components/designer/EditorToolbar';
import { DesignCanvas } from '../components/designer/DesignCanvas';
import { useDesignMode, generateWidgetId } from '../hooks/useDesignMode';
import type { WidgetTypeInfo } from '../components/designer/WidgetPalette';
import type { ScreenData, Widget, TagValue, AlarmData, LayoutMode, ScreenResolution } from '../types';

interface Props {
  tagValues: Record<string, TagValue>;
  alarms?: AlarmData[];
  userRole?: string;
}

export function DashboardPage({ tagValues, alarms = [], userRole }: Props) {
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
  const absContainerRef = useRef<HTMLDivElement>(null);
  const [absScale, setAbsScale] = useState(1);
  const [absOffset, setAbsOffset] = useState({ x: 0, y: 0 });
  const [collapsedContainerIds, setCollapsedContainerIds] = useState<Set<string>>(new Set());
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

  const dm = useDesignMode();
  const isDesigner = userRole === 'designer';

  // Parse screen layout mode and resolution
  const screenLayoutMode: LayoutMode = activeScreen?.layout_mode || 'grid';
  const screenResolution: ScreenResolution | null = (() => {
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
              if (w.type === 'collapsible_container' && (w.props as Record<string, unknown>).defaultCollapsed) {
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

  // Save
  const handleSave = useCallback(async () => {
    if (!activeScreen) return;
    await api.saveScreen(activeScreen.id, {
      name: activeScreen.name,
      slug: activeScreen.slug,
      layout: dm.widgets,
      layout_mode: screenLayoutMode,
      target_resolution: activeScreen.target_resolution,
      is_default: activeScreen.is_default,
      sort_order: activeScreen.sort_order,
    });
    setRuntimeWidgets(dm.widgets);
  }, [activeScreen, dm.widgets, screenLayoutMode]);

  // Save & exit
  const handleSaveAndExit = useCallback(async () => {
    await handleSave();
    dm.exitEditMode();
  }, [handleSave, dm]);

  // Discard
  const handleDiscard = useCallback(() => {
    if (dm.dirty && !window.confirm('Discard unsaved changes?')) return;
    dm.exitEditMode();
  }, [dm]);

  // Add widget from palette
  const handleAddWidget = useCallback((typeInfo: WidgetTypeInfo) => {
    const isAbs = dm.layoutMode === 'absolute';
    const widget: Widget = {
      id: generateWidgetId(),
      type: typeInfo.type,
      x: isAbs ? absPlacementOffset : 0,
      y: isAbs ? absPlacementOffset : 0,
      w: isAbs ? typeInfo.defaultAbsW : typeInfo.defaultW,
      h: isAbs ? typeInfo.defaultAbsH : typeInfo.defaultH,
      props: { ...typeInfo.defaultProps },
      ...(isAbs ? { chrome: 'compact' as const } : {}),
    };
    dm.addWidget(widget);
    dm.select(widget.id);
    if (isAbs) setAbsPlacementOffset(prev => prev + 20);
  }, [dm, absPlacementOffset]);

  // Create new screen
  const handleCreateScreen = useCallback(async () => {
    if (!newScreenName.trim()) return;
    const screenSlug = newScreenName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let targetRes: string | null = null;
    if (newScreenMode === 'absolute') {
      let w: number, h: number;
      if (newScreenResolution === 'custom') {
        w = newScreenCustomW;
        h = newScreenCustomH;
      } else {
        const [rw, rh] = newScreenResolution.split('x').map(Number);
        w = rw;
        h = rh;
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
  }, [newScreenName, screens.length, refreshScreens, newScreenMode, newScreenResolution, newScreenCustomW, newScreenCustomH, defaultLayout, defaultResolution]);

  // Delete current screen
  const handleDeleteScreen = useCallback(async () => {
    if (!activeScreen) return;
    if (!window.confirm(`Delete screen "${activeScreen.name}"? This cannot be undone.`)) return;
    await api.deleteScreen(activeScreen.id);
    refreshScreens();
    navigate('/');
  }, [activeScreen, refreshScreens]);

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

  // ─── DESIGN MODE ───
  if (dm.editing) {
    return (
      <div className="flex flex-col h-full -m-4">
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
      </div>
    );
  }

  // ─── RUNTIME MODE ───
  return (
    <div className={screenLayoutMode === 'absolute' && screenResolution ? 'flex flex-col h-full overflow-hidden' : ''}>
      {/* Screen tabs + edit button */}
      <div className="flex items-center gap-2 mb-4">
        {screens.length > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {screens.map((s) => (
              <Link
                key={s.id}
                to={`/screen/${s.slug}`}
                draggable={isDesigner}
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
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  activeScreen?.id === s.id
                    ? 'bg-[var(--hmi-accent)] text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                } ${dragTabId === s.id ? 'opacity-40' : ''} ${dropTargetId === s.id ? 'ring-2 ring-blue-400' : ''}`}
              >
                {isDesigner && <GripVertical size={12} className="text-slate-600 flex-shrink-0 cursor-grab" />}
                {s.name}
              </Link>
            ))}
          </div>
        )}
        <div className="flex-1" />
        {isDesigner && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowNewScreenDialog(true); setCreateScreenError(null); }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
              title="New screen"
            >
              <Plus size={14} />
            </button>
            {activeScreen && (
              <button
                onClick={handleDeleteScreen}
                className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-600/10 transition-colors"
                title="Delete screen"
              >
                <Trash2 size={14} />
              </button>
            )}
            {activeScreen && (
              <button
                onClick={handleEnterEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                title="Edit screen (Ctrl+E)"
              >
                <Pencil size={14} />
                Edit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Widget rendering */}
      {screenLayoutMode === 'absolute' && screenResolution ? (
        /* Absolute mode: scaled canvas with letterboxing */
        <div ref={absContainerRef} className="flex-1 relative bg-black overflow-hidden" style={{ minHeight: 400 }}>
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
              <RuntimeWidget key={w.id} widget={w} index={index} isAbsolute tagValues={tagValues} alarms={alarms} userRole={userRole} allWidgets={runtimeWidgets} collapsedContainerIds={collapsedContainerIds} onToggleContainerCollapsed={toggleContainerCollapsed} />
            ))}
          </div>
        </div>
      ) : (
        /* Grid mode: CSS grid layout — top-level widgets in grid, children inside containers */
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: '80px' }}
        >
          {runtimeWidgets.filter(w => !w.parentId).map((w, index) => (
            <RuntimeWidget key={w.id} widget={w} index={index} isAbsolute={false} tagValues={tagValues} alarms={alarms} userRole={userRole} allWidgets={runtimeWidgets} collapsedContainerIds={collapsedContainerIds} onToggleContainerCollapsed={toggleContainerCollapsed} />
          ))}
        </div>
      )}

      {runtimeWidgets.length === 0 && !activeScreen && (
        <div className="text-center text-slate-500 mt-20">
          <p className="text-lg">No screen found</p>
          <p className="text-sm mt-1">
            {isDesigner ? 'Create a screen using the + button above' : 'No screens have been created yet'}
          </p>
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
            <input
              type="text"
              value={newScreenName}
              onChange={e => setNewScreenName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateScreen(); if (e.key === 'Escape') setShowNewScreenDialog(false); }}
              placeholder="Screen name"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 mb-1"
              autoFocus
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
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    newScreenMode === 'grid' ? 'bg-[var(--hmi-accent)] text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setNewScreenMode('absolute')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 mb-2"
                >
                  <option value="1920x1080">1920 × 1080 (Full HD)</option>
                  <option value="1366x768">1366 × 768 (HD)</option>
                  <option value="1024x768">1024 × 768 (XGA)</option>
                  <option value="custom">Custom...</option>
                </select>
                {newScreenResolution === 'custom' && (
                  <div className="flex gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500">Width</label>
                      <input type="number" value={newScreenCustomW} onChange={e => setNewScreenCustomW(Number(e.target.value))}
                        min={320} max={3840}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">Height</label>
                      <input type="number" value={newScreenCustomH} onChange={e => setNewScreenCustomH(Number(e.target.value))}
                        min={240} max={2160}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewScreenDialog(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleCreateScreen} disabled={!newScreenName.trim()}
                className="px-4 py-2 rounded-lg text-sm bg-[var(--hmi-accent)] text-white hover:bg-[var(--hmi-accent-dark)] disabled:opacity-40 transition-colors">
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
  allWidgets: Widget[];
  collapsedContainerIds: Set<string>;
  onToggleContainerCollapsed: (id: string, collapsed: boolean) => void;
}

const RuntimeWidget = memo(function RuntimeWidget({ widget: w, index, isAbsolute, tagValues, alarms, userRole, allWidgets, collapsedContainerIds, onToggleContainerCollapsed }: RuntimeWidgetProps) {
  // Cascade container visibility to children (and collapse state for collapsible containers)
  if (w.parentId) {
    const parent = allWidgets.find(p => p.id === w.parentId);
    if (parent && (parent.type === 'container' || parent.type === 'collapsible_container')) {
      const parentVis = (parent.visible !== false)
        && (!parent.visibleTag || !!tagValues[parent.visibleTag]?.value)
        && (!parent.visibleRoles?.length || (userRole && parent.visibleRoles.includes(userRole)));
      if (!parentVis) return null;
      // Hide children of collapsed collapsible containers
      if (parent.type === 'collapsible_container' && collapsedContainerIds.has(parent.id)) return null;
    }
  }

  const visibleByProp = w.visible !== false;
  const visibleByTag = w.visibleTag ? !!tagValues[w.visibleTag]?.value : true;
  const visibleByRole = !w.visibleRoles || w.visibleRoles.length === 0 || (userRole && w.visibleRoles.includes(userRole));
  if (!visibleByProp || !visibleByTag || !visibleByRole) return null;

  const enabledByProp = w.enabled !== false;
  const enabledByTag = w.enabledTag ? !!tagValues[w.enabledTag]?.value : true;
  const enabledByRole = !w.enabledRoles || w.enabledRoles.length === 0 || (userRole && w.enabledRoles.includes(userRole));
  const isEnabled = enabledByProp && enabledByTag && enabledByRole;

  const tagName = (w.props as Record<string, unknown>).tag as string | undefined;
  const longDesc = tagName ? tagValues[tagName]?.description : undefined;
  const containerDesc = (w.type === 'container' || w.type === 'collapsible_container') ? (w.props as Record<string, unknown>).description as string : undefined;
  const infoDesc = longDesc || containerDesc;
  const showInfoBtn = w.showInfo !== false && !!infoDesc;

  // Collapsible container props
  const isCollapsible = w.type === 'collapsible_container';
  const collapsibleProps = isCollapsible ? {
    collapsed: collapsedContainerIds.has(w.id),
    onToggleCollapsed: (c: boolean) => onToggleContainerCollapsed(w.id, c),
  } : {};

  if (isAbsolute) {
    return (
      <div
        className={`absolute ${isEnabled ? '' : 'opacity-50 pointer-events-none'}`}
        style={{ left: w.x, top: w.y, width: w.w, height: w.h, zIndex: index }}
      >
        {showInfoBtn && <InfoButton description={infoDesc!} title={(w.props as Record<string, unknown>).title as string} />}
        <WidgetRenderer widget={w} tagValues={tagValues} alarms={alarms} {...collapsibleProps} />
      </div>
    );
  }

  const isContainer = w.type === 'container' || w.type === 'collapsible_container';
  const children = isContainer && !isAbsolute
    ? allWidgets.filter(c => c.parentId === w.id)
    : [];

  return (
    <div
      style={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}
      className={`relative ${isEnabled ? '' : 'opacity-50 pointer-events-none'}`}
    >
      {showInfoBtn && <InfoButton description={infoDesc!} title={(w.props as Record<string, unknown>).title as string} />}
      <WidgetRenderer widget={w} tagValues={tagValues} alarms={alarms} {...collapsibleProps} />
      {/* Render container children with pixel-based positioning */}
      {children.map((child, ci) => (
        <RuntimeWidget key={child.id} widget={child} index={ci} isAbsolute tagValues={tagValues} alarms={alarms} userRole={userRole} allWidgets={allWidgets} collapsedContainerIds={collapsedContainerIds} onToggleContainerCollapsed={onToggleContainerCollapsed} />
      ))}
    </div>
  );
}, (prev, next) => {
  if (prev.widget !== next.widget) return false;
  if (prev.index !== next.index) return false;
  if (prev.isAbsolute !== next.isAbsolute) return false;
  if (prev.alarms !== next.alarms) return false;
  if (prev.userRole !== next.userRole) return false;
  if (prev.collapsedContainerIds !== next.collapsedContainerIds) return false;

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
  // Check parent visibility tag
  if (w.parentId) {
    const parent = prev.allWidgets.find(pw => pw.id === w.parentId);
    if (parent?.visibleTag) tagNames.push(parent.visibleTag);
  }

  for (const name of tagNames) {
    if (prev.tagValues[name] !== next.tagValues[name]) return false;
  }
  return true;
});
