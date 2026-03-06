import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { WidgetRenderer } from '../components/widgets/WidgetRenderer';
import { InfoButton } from '../components/widgets/InfoButton';
import { WidgetPalette } from '../components/designer/WidgetPalette';
import { PropertyPanel } from '../components/designer/PropertyPanel';
import { EditorToolbar } from '../components/designer/EditorToolbar';
import { DesignCanvas } from '../components/designer/DesignCanvas';
import { useDesignMode, generateWidgetId } from '../hooks/useDesignMode';
import type { WidgetTypeInfo } from '../components/designer/WidgetPalette';
import type { ScreenData, Widget, TagValue, AlarmData } from '../types';

interface Props {
  tagValues: Record<string, TagValue>;
  alarms?: AlarmData[];
  userRole?: string;
}

export function DashboardPage({ tagValues, alarms = [], userRole }: Props) {
  const { slug } = useParams<{ slug?: string }>();
  const [screens, setScreens] = useState<ScreenData[]>([]);
  const [activeScreen, setActiveScreen] = useState<ScreenData | null>(null);
  const [runtimeWidgets, setRuntimeWidgets] = useState<Widget[]>([]);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [showNewScreenDialog, setShowNewScreenDialog] = useState(false);
  const [newScreenName, setNewScreenName] = useState('');

  const dm = useDesignMode();
  const isDesigner = userRole === 'designer';

  const refreshScreens = useCallback(() => {
    api.getScreens().then(setScreens).catch(() => {});
  }, []);

  // Load screens
  useEffect(() => {
    refreshScreens();
  }, [refreshScreens]);

  // Load active screen
  useEffect(() => {
    const target = slug || 'dashboard';
    api.getScreenBySlug(target)
      .then((s) => {
        setActiveScreen(s);
        setRuntimeWidgets(JSON.parse(s.layout || '[]'));
      })
      .catch(() => {
        setActiveScreen(null);
        setRuntimeWidgets([]);
      });
  }, [slug]);

  // Enter edit mode
  const handleEnterEdit = useCallback(() => {
    if (!activeScreen) return;
    dm.enterEditMode(runtimeWidgets);
  }, [activeScreen, runtimeWidgets, dm]);

  // Save
  const handleSave = useCallback(async () => {
    if (!activeScreen) return;
    await api.saveScreen(activeScreen.id, {
      name: activeScreen.name,
      slug: activeScreen.slug,
      layout: dm.widgets,
      is_default: activeScreen.is_default,
      sort_order: activeScreen.sort_order,
    });
    setRuntimeWidgets(dm.widgets);
  }, [activeScreen, dm.widgets]);

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
    const widget: Widget = {
      id: generateWidgetId(),
      type: typeInfo.type,
      x: 0,
      y: 0,
      w: typeInfo.defaultW,
      h: typeInfo.defaultH,
      props: { ...typeInfo.defaultProps },
    };
    dm.addWidget(widget);
    dm.select(widget.id);
  }, [dm]);

  // Create new screen
  const handleCreateScreen = useCallback(async () => {
    if (!newScreenName.trim()) return;
    const screenSlug = newScreenName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await api.createScreen({
      name: newScreenName.trim(),
      slug: screenSlug,
      layout: [],
      is_default: screens.length === 0,
      sort_order: screens.length,
    });
    setShowNewScreenDialog(false);
    setNewScreenName('');
    refreshScreens();
    // Navigate to the new screen
    window.location.href = `/screen/${screenSlug}`;
  }, [newScreenName, screens.length, refreshScreens]);

  // Delete current screen
  const handleDeleteScreen = useCallback(async () => {
    if (!activeScreen) return;
    if (!window.confirm(`Delete screen "${activeScreen.name}"? This cannot be undone.`)) return;
    await api.deleteScreen(activeScreen.id);
    refreshScreens();
    window.location.href = '/';
  }, [activeScreen, refreshScreens]);

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
    <div>
      {/* Screen tabs + edit button */}
      <div className="flex items-center gap-2 mb-4">
        {screens.length > 1 && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {screens.map((s) => (
              <a
                key={s.id}
                href={`/screen/${s.slug}`}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  activeScreen?.id === s.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {s.name}
              </a>
            ))}
          </div>
        )}
        <div className="flex-1" />
        {isDesigner && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowNewScreenDialog(true)}
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

      {/* Widget grid */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: '80px' }}
      >
        {runtimeWidgets.map((w) => {
          // Runtime visibility check
          const visibleByProp = w.visible !== false;
          const visibleByTag = w.visibleTag ? !!tagValues[w.visibleTag]?.value : true;
          const visibleByRole = !w.visibleRoles || w.visibleRoles.length === 0 || (userRole && w.visibleRoles.includes(userRole));
          if (!visibleByProp || !visibleByTag || !visibleByRole) return null;

          const enabledByProp = w.enabled !== false;
          const enabledByTag = w.enabledTag ? !!tagValues[w.enabledTag]?.value : true;
          const enabledByRole = !w.enabledRoles || w.enabledRoles.length === 0 || (userRole && w.enabledRoles.includes(userRole));
          const isEnabled = enabledByProp && enabledByTag && enabledByRole;

          // Resolve tag info for the info button
          const tagName = (w.props as Record<string, unknown>).tag as string | undefined;
          const longDesc = tagName ? tagValues[tagName]?.long_description : undefined;
          const showInfoBtn = w.showInfo !== false && !!longDesc;

          return (
            <div
              key={w.id}
              style={{
                gridColumn: `${w.x + 1} / span ${w.w}`,
                gridRow: `${w.y + 1} / span ${w.h}`,
              }}
              className={`relative ${isEnabled ? '' : 'opacity-50 pointer-events-none'}`}
            >
              {showInfoBtn && <InfoButton description={longDesc!} title={(w.props as Record<string, unknown>).title as string} />}
              <WidgetRenderer widget={w} tagValues={tagValues} alarms={alarms} />
            </div>
          );
        })}
      </div>

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
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewScreenDialog(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleCreateScreen} disabled={!newScreenName.trim()}
                className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
