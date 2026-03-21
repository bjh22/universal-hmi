import { memo } from 'react';
/**
 * StatusIndicator — displays a tag's current value with color-coded status mapping.
 * Designers configure a mapping dictionary like { "Running": { label: "Running", color: "#22c55e" } }
 * so that when the tag value is "Running", it shows green, "Stopped" shows red, etc.
 * This is the go-to widget for showing machine states, equipment status, or any
 * value that maps to a fixed set of human-readable labels with colors.
 */
import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, shouldShowExtras, getTitleClasses } from '../../lib/widgetChrome';

// TypeScript interface defining what data this component accepts from its parent.
// The `?` after a property name means it's optional — the parent doesn't have to
// provide it. For example, `mapping?` defaults to an empty object if not provided.
interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  // A dictionary that maps raw tag values to display labels and colors.
  // Example: { "1": { label: "Running", color: "#22c55e" }, "0": { label: "Stopped", color: "#ef4444" } }
  mapping?: Record<string, { label: string; color: string }>;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  // Chrome controls how much "decoration" the widget shows:
  //   'full'    = title bar + value + tag name underneath
  //   'compact' = title bar + value only
  //   'none'    = just the value, no title or extras
  chrome?: 'full' | 'compact' | 'none';
}

export const StatusIndicator = memo(function StatusIndicator({ title, tag, tagValues, mapping = {}, titleStyle, valueStyle, chrome = 'full' }: Props) {
  // Look up the current tag value from the tagValues dictionary
  const tv = tagValues[tag];
  const value = tv?.value;            // `?.` is optional chaining — safely returns undefined if tv is null
  const strVal = String(value ?? ''); // Convert to string for the mapping lookup; `??` means "use '' if null/undefined"
  // Look up the string value in the mapping dictionary to get the label and color.
  // If no mapping exists for this value, mapped will be undefined and we fall back to defaults below.
  const mapped = mapping[strVal];

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col justify-center items-center`}>
      {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>}
      <div
        className="text-xl font-bold px-4 py-2 rounded-lg"
        style={{ backgroundColor: (mapped?.color || '#6b7280') + '20', color: mapped?.color || '#6b7280', ...textStyleToCSS(valueStyle) }}
      >
        {mapped?.label || strVal || '—'}
      </div>
      {shouldShowExtras(chrome) && tv && <div className="text-sm text-slate-500 mt-2">{tv.display_name || tag}</div>}
    </div>
  );
});
