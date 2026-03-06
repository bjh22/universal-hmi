import type { Widget, TagValue, AlarmData } from '../../types';
import { StatusIndicator } from './StatusIndicator';
import { GaugeWidget, type GaugeDisplayMode } from './GaugeWidget';
import { CounterWidget } from './CounterWidget';
import { ToggleWidget } from './ToggleWidget';
import { CommandButton } from './CommandButton';
import { ParameterInput } from './ParameterInput';
import { TextLabelWidget } from './TextLabelWidget';
import { TextValueWidget } from './TextValueWidget';
import { AlarmSummaryWidget } from './AlarmSummaryWidget';
import { DropdownSelectWidget } from './DropdownSelectWidget';
import { OeeWidget } from './OeeWidget';
import { ControlGroupWidget, type ControlItem } from './ControlGroupWidget';

interface Props {
  widget: Widget;
  tagValues: Record<string, TagValue>;
  alarms?: AlarmData[];
}

export function WidgetRenderer({ widget, tagValues, alarms = [] }: Props) {
  const p = widget.props as Record<string, unknown>;

  switch (widget.type) {
    case 'status_indicator':
      return <StatusIndicator title={p.title as string} tag={p.tag as string} tagValues={tagValues} mapping={p.mapping as Record<string, { label: string; color: string }>} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} />;
    case 'gauge':
      return <GaugeWidget title={p.title as string} tag={p.tag as string} tagValues={tagValues} min={p.min as number} max={p.max as number} units={p.units as string} warning={p.warning as number} critical={p.critical as number} decimalPlaces={p.decimalPlaces as number} displayMode={p.displayMode as GaugeDisplayMode} valueFontSize={p.valueFontSize as number} barThickness={p.barThickness as number} gaugeSize={p.gaugeSize as number} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} />;
    case 'counter':
      return <CounterWidget title={p.title as string} tag={p.tag as string} tagValues={tagValues} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} />;
    case 'toggle':
      return <ToggleWidget title={p.title as string} tag={p.tag as string} tagValues={tagValues} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} />;
    case 'command_button':
      return <CommandButton title={p.title as string} tag={p.tag as string} value={p.value} script={p.script as string} color={p.color as string} confirm={p.confirm as boolean} titleStyle={p.titleStyle as undefined} />;
    case 'parameter_input':
      return <ParameterInput title={p.title as string} tag={p.tag as string} tagValues={tagValues} min={p.min as number} max={p.max as number} step={p.step as number} units={p.units as string} decimalPlaces={p.decimalPlaces as number} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} />;
    case 'text_label':
      return <TextLabelWidget title={p.title as string} text={p.text as string} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} />;
    case 'text_value':
      return <TextValueWidget title={p.title as string} tag={p.tag as string} tagValues={tagValues} units={p.units as string} format={p.format as string} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} />;
    case 'alarm_summary':
      return <AlarmSummaryWidget title={p.title as string} alarms={alarms} titleStyle={p.titleStyle as undefined} />;
    case 'multi_value': {
      // Legacy: convert multi_value tags to control_group value controls
      const mvTags = (p.tags as Array<{ tag: string; label: string; units?: string }>) || [];
      const mvControls: ControlItem[] = mvTags.map(t => ({
        type: 'value' as const, tag: t.tag, label: t.label, units: t.units, decimalPlaces: p.decimalPlaces as number ?? 1,
      }));
      return <ControlGroupWidget title={p.title as string} controls={mvControls} tagValues={tagValues} columns={p.columns as number} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} />;
    }
    case 'dropdown_select':
      return <DropdownSelectWidget title={p.title as string} tag={p.tag as string} tagValues={tagValues} options={p.options as Array<{ label: string; value: unknown }>} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} />;
    case 'oee':
      return <OeeWidget title={p.title as string} availabilityTag={p.availabilityTag as string} performanceTag={p.performanceTag as string} qualityTag={p.qualityTag as string} oeeTag={p.oeeTag as string} tagValues={tagValues} decimalPlaces={p.decimalPlaces as number} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} />;
    case 'control_group':
      return <ControlGroupWidget title={p.title as string} controls={p.controls as ControlItem[] || []} tagValues={tagValues} columns={p.columns as number} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} />;
    default:
      return (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 text-slate-400 text-sm">
          Unknown widget: {widget.type}
        </div>
      );
  }
}
