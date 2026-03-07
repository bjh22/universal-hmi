import {
  Undo2, Redo2, Save, Grid3x3, ZoomIn, ZoomOut, Magnet,
} from 'lucide-react';
import type { GridSettings } from '../../hooks/useDesignMode';
import type { LayoutMode, ScreenResolution } from '../../types';

interface Props {
  screenName: string;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  gridSettings: GridSettings;
  zoom: number;
  layoutMode: LayoutMode;
  targetResolution: ScreenResolution | null;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onSaveAndExit: () => void;
  onDiscard: () => void;
  onGridSettingsChange: (settings: Partial<GridSettings>) => void;
  onZoomChange: (zoom: number) => void;
}

const GRID_SIZES = [10, 20, 40, 80];
const ABS_GRID_SIZES = [5, 10, 20, 50];

export function EditorToolbar({
  screenName, dirty, canUndo, canRedo, gridSettings, zoom,
  layoutMode, targetResolution,
  onUndo, onRedo, onSave, onSaveAndExit, onDiscard,
  onGridSettingsChange, onZoomChange,
}: Props) {
  const isAbsolute = layoutMode === 'absolute';
  const gridSizes = isAbsolute ? ABS_GRID_SIZES : GRID_SIZES;
  return (
    <div className="h-10 bg-slate-900 border-b border-slate-700 flex items-center px-3 gap-2 shrink-0">
      {/* Screen name + dirty indicator */}
      <div className="flex items-center gap-1.5 mr-3">
        <span className="text-sm font-medium text-slate-300">{screenName}</span>
        {dirty && <span className="w-2 h-2 rounded-full bg-yellow-400" title="Unsaved changes" />}
      </div>

      <div className="w-px h-5 bg-slate-700" />

      {/* Undo/Redo */}
      <ToolbarButton icon={Undo2} title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo} />
      <ToolbarButton icon={Redo2} title="Redo (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo} />

      <div className="w-px h-5 bg-slate-700" />

      {/* Save */}
      <ToolbarButton icon={Save} title="Save (Ctrl+S)" onClick={onSave} disabled={!dirty} />
      <button
        onClick={onSaveAndExit}
        disabled={!dirty}
        className="px-2 py-1 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Save & Exit
      </button>

      <div className="w-px h-5 bg-slate-700" />

      {/* Grid settings */}
      <ToolbarButton
        icon={Grid3x3}
        title={gridSettings.visible ? 'Hide grid' : 'Show grid'}
        onClick={() => onGridSettingsChange({ visible: !gridSettings.visible })}
        active={gridSettings.visible}
      />
      {isAbsolute && (
        <ToolbarButton
          icon={Magnet}
          title={gridSettings.snap ? 'Disable snap' : 'Enable snap'}
          onClick={() => onGridSettingsChange({ snap: !gridSettings.snap })}
          active={gridSettings.snap}
        />
      )}
      <select
        value={gridSettings.cellSize}
        onChange={e => onGridSettingsChange({ cellSize: Number(e.target.value) })}
        className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-slate-300"
        title="Grid cell size"
      >
        {gridSizes.map(s => (
          <option key={s} value={s}>{s}px</option>
        ))}
      </select>
      {isAbsolute && targetResolution && (
        <span className="text-xs text-slate-500 ml-1">
          {targetResolution.width} × {targetResolution.height}
        </span>
      )}

      <div className="w-px h-5 bg-slate-700" />

      {/* Zoom */}
      <ToolbarButton icon={ZoomOut} title="Zoom out" onClick={() => onZoomChange(zoom - 0.1)} disabled={zoom <= 0.5} />
      <span className="text-xs text-slate-400 min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
      <ToolbarButton icon={ZoomIn} title="Zoom in" onClick={() => onZoomChange(zoom + 0.1)} disabled={zoom >= 2} />

      <div className="flex-1" />

      {/* Discard & Exit */}
      <button
        onClick={onDiscard}
        className="px-2 py-1 rounded text-xs text-slate-400 hover:text-red-400 hover:bg-red-600/10 transition-colors"
      >
        Discard
      </button>
    </div>
  );
}

function ToolbarButton({ icon: Icon, title, onClick, disabled, active }: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      <Icon size={16} />
    </button>
  );
}
