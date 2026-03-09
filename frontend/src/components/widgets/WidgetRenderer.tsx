/**
 * WidgetRenderer — the central dispatcher that maps a widget's `type` string
 * to the correct React component. Every widget placed on a screen flows through
 * this component. It receives the widget definition plus all current tag values,
 * and renders the appropriate specialized component (gauge, toggle, button, etc.).
 *
 * Performance is critical here because a single screen can contain hundreds of
 * widgets, and tag values update every 500ms via WebSocket. Two optimizations
 * make this fast:
 *   1. `memo()` wraps the component so React skips re-rendering when props
 *      haven't changed.
 *   2. A custom memo comparator (at the bottom of this file) only checks the
 *      tag values that THIS widget actually uses, not every tag in the system.
 */
import { memo } from 'react';
import type { Widget, TagValue, AlarmData } from '../../types';
import { ErrorBoundary } from './ErrorBoundary';
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
import { LightIndicator } from './LightIndicator';
import { AutoFillWidget } from './AutoFillWidget';

// TypeScript interface defining the data this component receives from its parent.
// `Record<string, TagValue>` is a dictionary type — keys are tag name strings,
// values are TagValue objects containing the current reading.
interface Props {
  widget: Widget;
  tagValues: Record<string, TagValue>;
  alarms?: AlarmData[];
}

/**
 * Extracts all tag names that a specific widget depends on.
 * This is used by the custom memo comparator below — if a widget only reads
 * tags "temperature" and "pressure", we only need to re-render it when those
 * two values change, not when any of the hundreds of other tags update.
 * This is a huge performance win on screens with many widgets.
 */
function getWidgetTagNames(widget: Widget): string[] {
  const p = widget.props as Record<string, unknown>;
  const tags: string[] = [];
  // Single-tag widgets
  if (typeof p.tag === 'string' && p.tag) tags.push(p.tag);
  if (typeof p.writeTag === 'string' && p.writeTag) tags.push(p.writeTag);
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

// memo() is a React optimization that wraps this component to skip re-rendering
// if its props haven't changed. The second argument (after the component function)
// is a custom comparison function that decides whether to skip — see bottom of file.
export const WidgetRenderer = memo(function WidgetRenderer({ widget, tagValues, alarms = [] }: Props) {
  const p = widget.props as Record<string, unknown>;
  const chrome = widget.chrome;

  // The switch statement maps each widget.type string (e.g. 'gauge', 'toggle')
  // to the actual React component that renders it, passing through the relevant
  // configuration props. This is the core dispatch mechanism of the widget system.
  const content = (() => { switch (widget.type) {
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
    case 'auto_fill':
      return <AutoFillWidget title={p.title as string} labelName={p.labelName as string} columns={p.columns as number} onColor={p.onColor as string} offColor={p.offColor as string} decimalPlaces={p.decimalPlaces as number} tagOrder={p.tagOrder as string[]} tagValues={tagValues} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} chrome={chrome} />;
    case 'light_indicator':
      return <LightIndicator title={p.title as string} tag={p.tag as string} writeTag={p.writeTag as string} onColor={p.onColor as string} offColor={p.offColor as string} size={p.size as 'small' | 'medium' | 'large'} tagValues={tagValues} titleStyle={p.titleStyle as undefined} valueStyle={p.valueStyle as undefined} chrome={chrome} />;
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
  } })();

  // ErrorBoundary wraps each widget so that if one widget throws a rendering
  // error (e.g. bad config), it catches the error and shows a fallback instead
  // of crashing the entire page. Without this, one broken widget would take
  // down every other widget on the screen.
  return <ErrorBoundary>{content}</ErrorBoundary>;

// Custom memo comparator — this is the second argument to memo().
// React calls this function to decide: "should I skip re-rendering?"
// Return true = skip (props are "equal enough"), return false = re-render.
// Instead of doing a deep comparison of ALL tagValues (expensive with hundreds
// of tags), we only compare the specific tags this widget uses.
}, (prev, next) => {
  // If the widget config itself changed (e.g. designer edited it), always re-render
  if (prev.widget !== next.widget) return false;
  if (prev.alarms !== next.alarms) return false;
  // Only compare tag values this widget actually uses — ignore changes to unrelated tags
  const tagNames = getWidgetTagNames(prev.widget);
  if (tagNames.length === 0) return prev.tagValues === next.tagValues;
  for (const name of tagNames) {
    const pv = prev.tagValues[name];
    const nv = next.tagValues[name];
    if (pv !== nv) return false;
  }
  return true;
});
