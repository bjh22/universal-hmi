import {
  Activity, Gauge, Hash, ToggleLeft, MousePointerClick,
  SlidersHorizontal, Type, FileText, Bell, ChevronDown, BarChart3, LayoutGrid, Square, Circle, Sparkles,
} from 'lucide-react';

export interface WidgetTypeInfo {
  type: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  category: 'display' | 'input' | 'layout';
  defaultW: number;      // grid columns
  defaultH: number;      // grid rows
  defaultAbsW: number;   // pixels (absolute mode)
  defaultAbsH: number;   // pixels (absolute mode)
  defaultProps: Record<string, unknown>;
}

export const WIDGET_TYPES: WidgetTypeInfo[] = [
  {
    type: 'status_indicator', label: 'Status Indicator', icon: Activity, category: 'display',
    defaultW: 4, defaultH: 2, defaultAbsW: 240, defaultAbsH: 100,
    defaultProps: { title: 'Status', tag: '', mapping: {} },
  },
  {
    type: 'gauge', label: 'Gauge', icon: Gauge, category: 'display',
    defaultW: 4, defaultH: 3, defaultAbsW: 280, defaultAbsH: 240,
    defaultProps: { title: 'Gauge', tag: '', min: 0, max: 100, units: '' },
  },
  {
    type: 'counter', label: 'Counter', icon: Hash, category: 'display',
    defaultW: 3, defaultH: 2, defaultAbsW: 200, defaultAbsH: 80,
    defaultProps: { title: 'Counter', tag: '' },
  },
  {
    type: 'toggle', label: 'Toggle', icon: ToggleLeft, category: 'input',
    defaultW: 3, defaultH: 2, defaultAbsW: 180, defaultAbsH: 60,
    defaultProps: { title: 'Toggle', tag: '' },
  },
  {
    type: 'command_button', label: 'Button', icon: MousePointerClick, category: 'input',
    defaultW: 3, defaultH: 2, defaultAbsW: 200, defaultAbsH: 60,
    defaultProps: { title: 'Button', tag: '', value: null, color: 'blue' },
  },
  {
    type: 'parameter_input', label: 'Parameter Input', icon: SlidersHorizontal, category: 'input',
    defaultW: 4, defaultH: 2, defaultAbsW: 240, defaultAbsH: 80,
    defaultProps: { title: 'Parameter', tag: '', min: 0, max: 100, step: 1, units: '' },
  },
  {
    type: 'text_value', label: 'Text Value', icon: FileText, category: 'display',
    defaultW: 3, defaultH: 2, defaultAbsW: 200, defaultAbsH: 60,
    defaultProps: { title: 'Value', tag: '', units: '', format: '' },
  },
  {
    type: 'alarm_summary', label: 'Alarm Summary', icon: Bell, category: 'display',
    defaultW: 5, defaultH: 2, defaultAbsW: 440, defaultAbsH: 140,
    defaultProps: { title: 'Alarms' },
  },
  {
    type: 'dropdown_select', label: 'Dropdown Select', icon: ChevronDown, category: 'input',
    defaultW: 3, defaultH: 2, defaultAbsW: 240, defaultAbsH: 60,
    defaultProps: { title: 'Select', tag: '', options: [] },
  },
  {
    type: 'oee', label: 'OEE Display', icon: BarChart3, category: 'display',
    defaultW: 4, defaultH: 4, defaultAbsW: 320, defaultAbsH: 280,
    defaultProps: { title: 'OEE', availabilityTag: '', performanceTag: '', qualityTag: '', oeeTag: '' },
  },
  {
    type: 'control_group', label: 'Control Group', icon: LayoutGrid, category: 'input',
    defaultW: 4, defaultH: 4, defaultAbsW: 320, defaultAbsH: 240,
    defaultProps: { title: 'Controls', controls: [], columns: 1 },
  },
  {
    type: 'auto_fill', label: 'Auto Fill', icon: Sparkles, category: 'display',
    defaultW: 4, defaultH: 4, defaultAbsW: 320, defaultAbsH: 240,
    defaultProps: { title: 'Auto Fill', labelName: '', columns: 2, onColor: '#22c55e', offColor: '#6b7280', decimalPlaces: 1 },
  },
  {
    type: 'light_indicator', label: 'Light Indicator', icon: Circle, category: 'display',
    defaultW: 3, defaultH: 2, defaultAbsW: 200, defaultAbsH: 60,
    defaultProps: { title: 'Indicator', tag: '', onColor: '#22c55e', offColor: '#6b7280', size: 'medium' },
  },
  {
    type: 'text_label', label: 'Text Label', icon: Type, category: 'layout',
    defaultW: 4, defaultH: 1, defaultAbsW: 240, defaultAbsH: 50,
    defaultProps: { title: 'Label', text: 'Text' },
  },
  {
    type: 'container', label: 'Container', icon: Square, category: 'layout',
    defaultW: 6, defaultH: 4, defaultAbsW: 400, defaultAbsH: 300,
    defaultProps: { title: 'Group', description: '' },
  },
];
