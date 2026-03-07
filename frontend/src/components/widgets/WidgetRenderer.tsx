import { memo } from 'react';
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
import { ContainerWidget } from './ContainerWidget';

interface Props {
  widget: Widget;
  tagValues: Record<string, TagValue>;
  alarms?: AlarmData[];
}

/** Extract all tag names a widget depends on for value lookups. */
function getWidgetTagNames(widget: Widget): string[] {
  const p = widget.props as Record<string, unknown>;
  const tags: string[] = [];
  // Single-tag widgets
  if (typeof p.tag === 'string' && p.tag) tags.push(p.tag);
  // OEE widget
  if (typeof p.availabilityTag === 'string' && p.availabilityTag) tags.push(p.availabilityTag);
  if (typeof p.performanceTag === 'string' && p.performanceTag) tags.push(p.performanceTag);
  if (typeof p.qualityTag === 'string' && p.qualityTag) tags.push(p.qualityTag);
  if (typeof p.oeeTag === 'string' && p.oeeTag) tags.push(p.oeeTag);
  // Multi-value / control_group
  if (Array.isArray(p.tags)) {
    for (const t of p.tags) if (t && typeof t.tag === 'string') tags.push(t.tag);
  }
  if (Array.isArray(p.controls)) {
    for (const c of p.controls) if (c && typeof c.tag === 'string') tags.push(c.tag);
  }
  return tags;
}

export const WidgetRenderer = memo(function WidgetRenderer({ widget, tagValues, alarms = [] }: Props) {
  const p = widget.props as Record<string, unknown>;
  const chrome = widget.chrome;

  switch (widget.type) {
    case 'status_indicator':
      return <StatusIndicator title={p.title as string} tag={p.tag as string} tagValues={tagValues} mapping={p.mapping as Record<string, { label: string; color: string }>} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} chrome={chrome} />;
    case 'gauge':
      return <GaugeWidget title={p.title as string} tag={p.tag as string} tagValues={tagValues} min={p.min as number} max={p.max as number} units={p.units as string} warning={p.warning as number} critical={p.critical as number} decimalPlaces={p.decimalPlaces as number} displayMode={p.displayMode as GaugeDisplayMode} valueFontSize={p.valueFontSize as number} barThickness={p.barThickness as number} gaugeSize={p.gaugeSize as number} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} chrome={chrome} />;
    case 'counter':
      return <CounterWidget title={p.title as string} tag={p.tag as string} tagValues={tagValues} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} chrome={chrome} />;
    case 'toggle':
      return <ToggleWidget title={p.title as string} tag={p.tag as string} tagValues={tagValues} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} chrome={chrome} />;
    case 'command_button':
      return <CommandButton title={p.title as string} tag={p.tag as string} value={p.value} script={p.script as string} color={p.color as string} confirm={p.confirm as boolean} titleStyle={p.titleStyle as undefined} chrome={chrome} />;
    case 'parameter_input':
      return <ParameterInput title={p.title as string} tag={p.tag as string} tagValues={tagValues} min={p.min as number} max={p.max as number} step={p.step as number} units={p.units as string} decimalPlaces={p.decimalPlaces as number} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} chrome={chrome} />;
    case 'text_label':
      return <TextLabelWidget title={p.title as string} text={p.text as string} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} chrome={chrome} />;
    case 'text_value':
      return <TextValueWidget title={p.title as string} tag={p.tag as string} tagValues={tagValues} units={p.units as string} format={p.format as string} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} chrome={chrome} />;
    case 'alarm_summary':
      return <AlarmSummaryWidget title={p.title as string} alarms={alarms} titleStyle={p.titleStyle as undefined} chrome={chrome} />;
    case 'multi_value': {
      // Legacy: convert multi_value tags to control_group value controls
      const mvTags = (p.tags as Array<{ tag: string; label: string; units?: string }>) || [];
      const mvControls: ControlItem[] = mvTags.map(t => ({
        type: 'value' as const, tag: t.tag, label: t.label, units: t.units, decimalPlaces: p.decimalPlaces as number ?? 1,
      }));
      return <ControlGroupWidget title={p.title as string} controls={mvControls} tagValues={tagValues} columns={p.columns as number} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} chrome={chrome} />;
    }
    case 'dropdown_select':
      return <DropdownSelectWidget title={p.title as string} tag={p.tag as string} tagValues={tagValues} options={p.options as Array<{ label: string; value: unknown }>} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} chrome={chrome} />;
    case 'oee':
      return <OeeWidget title={p.title as string} availabilityTag={p.availabilityTag as string} performanceTag={p.performanceTag as string} qualityTag={p.qualityTag as string} oeeTag={p.oeeTag as string} tagValues={tagValues} decimalPlaces={p.decimalPlaces as number} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} chrome={chrome} />;
    case 'control_group':
      return <ControlGroupWidget title={p.title as string} controls={p.controls as ControlItem[] || []} tagValues={tagValues} columns={p.columns as number} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} chrome={chrome} />;
    case 'container':
      return <ContainerWidget title={p.title as string} description={p.description as string} titleStyle={p.titleStyle as undefined} chrome={chrome} />;
    default:
      return (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 text-slate-400 text-sm">
          Unknown widget: {widget.type}
        </div>
      );
  }
}, (prev, next) => {
  // Custom comparator: skip re-render if the widget's own tags haven't changed
  if (prev.widget !== next.widget) return false;
  if (prev.alarms !== next.alarms) return false;
  // Only compare tag values this widget actually uses
  const tagNames = getWidgetTagNames(prev.widget);
  if (tagNames.length === 0) return prev.tagValues === next.tagValues;
  for (const name of tagNames) {
    const pv = prev.tagValues[name];
    const nv = next.tagValues[name];
    if (pv !== nv) return false;
  }
  return true;
});
