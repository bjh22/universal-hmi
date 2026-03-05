import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { WidgetRenderer } from '../components/widgets/WidgetRenderer';
import { WidgetPalette } from '../components/designer/WidgetPalette';
import { PropertyPanel } from '../components/designer/PropertyPanel';
import { EditorToolbar } from '../components/designer/EditorToolbar';
import { DesignCanvas } from '../components/designer/DesignCanvas';
import { useDesignMode, generateWidgetId } from '../hooks/useDesignMode';
import type { WidgetTypeInfo } from '../components/designer/WidgetPalette';
import type { ScreenData, Widget, TagValue } from '../types';

interface Props {
  tagValues: Record<string, TagValue>;
  userRole?: string;
}

export function DashboardPage({ tagValues, userRole }: Props) {
  const { slug } = useParams<{ slug?: string }>();
  const [screens, setScreens] = useState<ScreenData[]>([]);
  const [activeScreen, setActiveScreen] = useState<ScreenData | null>(null);
  const [runtimeWidgets, setRuntimeWidgets] = useState<Widget[]>([]);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);

  const dm = useDesignMode();
  const isDesigner = userRole === 'designer';

  // Load screens
  useEffect(() => {
    api.getScreens().then(setScreens).catch(() => {});
  }, []);

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
            selectedIds={dm.selectedIds}
            lockedIds={dm.lockedIds}
            gridSettings={dm.gridSettings}
            zoom={dm.zoom}
            onSelect={dm.select}
            onClearSelection={dm.clearSelection}
            onMoveWidget={dm.moveWidget}
            onResizeWidget={dm.resizeWidget}
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

      {/* Widget grid */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: '80px' }}
      >
        {runtimeWidgets.map((w) => (
          <div
            key={w.id}
            style={{
              gridColumn: `${w.x + 1} / span ${w.w}`,
              gridRow: `${w.y + 1} / span ${w.h}`,
            }}
          >
            <WidgetRenderer widget={w} tagValues={tagValues} />
          </div>
        ))}
      </div>

      {runtimeWidgets.length === 0 && (
        <div className="text-center text-slate-500 mt-20">
          <p className="text-lg">No widgets configured</p>
          <p className="text-sm mt-1">
            {isDesigner ? 'Press Ctrl+E or click Edit to design this screen' : 'Add widgets using the screen designer'}
          </p>
        </div>
      )}
    </div>
  );
}
