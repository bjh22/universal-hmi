import type { Widget, TagValue } from '../../types';
import { StatusIndicator } from './StatusIndicator';
import { GaugeWidget } from './GaugeWidget';
import { CounterWidget } from './CounterWidget';
import { ToggleWidget } from './ToggleWidget';
import { CommandButton } from './CommandButton';
import { ParameterInput } from './ParameterInput';

interface Props {
  widget: Widget;
  tagValues: Record<string, TagValue>;
}

export function WidgetRenderer({ widget, tagValues }: Props) {
  const p = widget.props as any;

  switch (widget.type) {
    case 'status_indicator':
      return <StatusIndicator title={p.title} tag={p.tag} tagValues={tagValues} mapping={p.mapping} titleStyle={p.titleStyle} valueStyle={p.valueStyle} />;
    case 'gauge':
      return <GaugeWidget title={p.title} tag={p.tag} tagValues={tagValues} min={p.min} max={p.max} units={p.units} warning={p.warning} critical={p.critical} titleStyle={p.titleStyle} valueStyle={p.valueStyle} />;
    case 'counter':
      return <CounterWidget title={p.title} tag={p.tag} tagValues={tagValues} titleStyle={p.titleStyle} valueStyle={p.valueStyle} />;
    case 'toggle':
      return <ToggleWidget title={p.title} tag={p.tag} tagValues={tagValues} titleStyle={p.titleStyle} valueStyle={p.valueStyle} />;
    case 'command_button':
      return <CommandButton title={p.title} tag={p.tag} value={p.value} script={p.script} color={p.color} confirm={p.confirm} titleStyle={p.titleStyle} />;
    case 'parameter_input':
      return <ParameterInput title={p.title} tag={p.tag} tagValues={tagValues} min={p.min} max={p.max} step={p.step} units={p.units} titleStyle={p.titleStyle} valueStyle={p.valueStyle} />;
    default:
      return (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 text-slate-400 text-sm">
          Unknown widget: {widget.type}
        </div>
      );
  }
}
