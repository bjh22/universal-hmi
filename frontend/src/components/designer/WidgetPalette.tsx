/**
 * WidgetPalette — the sidebar panel in the screen designer that lists all
 * available widget types, grouped by category. Clicking a widget adds it to
 * the canvas at a default position and size.
 *
 * Supports a collapsed mode that shows only icons (saving screen space) and
 * an expanded mode that shows icons with labels.
 *
 * The actual widget type definitions (icons, default sizes, categories) live
 * in widgetTypes.ts — this file handles the UI for browsing and selecting them.
 */
import { WIDGET_TYPES } from './widgetTypes';
import type { WidgetTypeInfo } from './widgetTypes';
export type { WidgetTypeInfo };
export { WIDGET_TYPES };

// Groups widgets into sections for organization in the palette.
// Display = read-only visualizations (gauges, indicators, labels)
// Input = interactive controls (toggles, buttons, inputs)
// Layout = structural elements (containers)
const CATEGORIES = [
  { key: 'display' as const, label: 'Display' },
  { key: 'input' as const, label: 'Input' },
  { key: 'layout' as const, label: 'Layout' },
];

interface Props {
  onAddWidget: (typeInfo: WidgetTypeInfo) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function WidgetPalette({ onAddWidget, collapsed, onToggleCollapse }: Props) {
  // Collapsed mode: shows only icons to save screen space when the designer
  // doesn't need the full palette. Each icon is a clickable button with a tooltip.
  if (collapsed) {
    return (
      <div className="w-12 bg-slate-900 border-r border-slate-700 flex flex-col items-center py-2 gap-1">
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded hover:bg-slate-800 text-slate-400 text-xs mb-2"
          title="Expand palette"
        >
          &raquo;
        </button>
        {WIDGET_TYPES.map(wt => (
          <button
            key={wt.type}
            onClick={() => onAddWidget(wt)}
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            title={wt.label}
          >
            <wt.icon size={16} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="w-52 bg-slate-900 border-r border-slate-700 flex flex-col overflow-y-auto shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Widgets</span>
        <button
          onClick={onToggleCollapse}
          className="text-slate-400 hover:text-slate-200 text-xs"
          title="Collapse palette"
        >
          &laquo;
        </button>
      </div>
      {CATEGORIES.map(cat => {
        const items = WIDGET_TYPES.filter(w => w.category === cat.key);
        if (items.length === 0) return null;
        return (
          <div key={cat.key} className="px-2 py-2">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 px-1">
              {cat.label}
            </div>
            {items.map(wt => (
              <button
                key={wt.type}
                onClick={() => onAddWidget(wt)}
                className="flex items-center gap-2 w-full px-2 py-2.5 min-h-[44px] rounded text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
              >
                <wt.icon size={16} />
                <span>{wt.label}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
