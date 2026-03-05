import {
  Activity, Gauge, Hash, ToggleLeft, MousePointerClick,
  SlidersHorizontal, Type, FileText, Bell, Table, ChevronDown, BarChart3,
} from 'lucide-react';

export interface WidgetTypeInfo {
  type: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  category: 'display' | 'input' | 'layout';
  defaultW: number;
  defaultH: number;
  defaultProps: Record<string, unknown>;
}

export const WIDGET_TYPES: WidgetTypeInfo[] = [
  {
    type: 'status_indicator', label: 'Status Indicator', icon: Activity, category: 'display',
    defaultW: 4, defaultH: 2,
    defaultProps: { title: 'Status', tag: '', mapping: {} },
  },
  {
    type: 'gauge', label: 'Gauge', icon: Gauge, category: 'display',
    defaultW: 4, defaultH: 3,
    defaultProps: { title: 'Gauge', tag: '', min: 0, max: 100, units: '' },
  },
  {
    type: 'counter', label: 'Counter', icon: Hash, category: 'display',
    defaultW: 3, defaultH: 2,
    defaultProps: { title: 'Counter', tag: '' },
  },
  {
    type: 'toggle', label: 'Toggle', icon: ToggleLeft, category: 'input',
    defaultW: 3, defaultH: 2,
    defaultProps: { title: 'Toggle', tag: '' },
  },
  {
    type: 'command_button', label: 'Button', icon: MousePointerClick, category: 'input',
    defaultW: 3, defaultH: 2,
    defaultProps: { title: 'Button', tag: '', value: null, color: 'blue' },
  },
  {
    type: 'parameter_input', label: 'Parameter Input', icon: SlidersHorizontal, category: 'input',
    defaultW: 4, defaultH: 2,
    defaultProps: { title: 'Parameter', tag: '', min: 0, max: 100, step: 1, units: '' },
  },
  {
    type: 'text_value', label: 'Text Value', icon: FileText, category: 'display',
    defaultW: 3, defaultH: 2,
    defaultProps: { title: 'Value', tag: '', units: '', format: '' },
  },
  {
    type: 'alarm_summary', label: 'Alarm Summary', icon: Bell, category: 'display',
    defaultW: 5, defaultH: 2,
    defaultProps: { title: 'Alarms' },
  },
  {
    type: 'multi_value', label: 'Multi-Value Group', icon: Table, category: 'display',
    defaultW: 4, defaultH: 3,
    defaultProps: { title: 'Values', tags: [] },
  },
  {
    type: 'dropdown_select', label: 'Dropdown Select', icon: ChevronDown, category: 'input',
    defaultW: 3, defaultH: 2,
    defaultProps: { title: 'Select', tag: '', options: [] },
  },
  {
    type: 'oee', label: 'OEE Display', icon: BarChart3, category: 'display',
    defaultW: 4, defaultH: 4,
    defaultProps: { title: 'OEE', availabilityTag: '', performanceTag: '', qualityTag: '', oeeTag: '' },
  },
  {
    type: 'text_label', label: 'Text Label', icon: Type, category: 'layout',
    defaultW: 4, defaultH: 1,
    defaultProps: { title: 'Label', text: 'Text' },
  },
];

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
            className="p-2 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
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
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
              >
                <wt.icon size={14} />
                <span>{wt.label}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
