import { memo, useCallback } from 'react';
/**
 * ToggleWidget — an on/off toggle switch that reads and writes a boolean tag value.
 *
 * This is a "two-way binding" widget:
 *   - READ:  it checks tagValues to display the current toggle position (on or off)
 *   - WRITE: when clicked, it sends the INVERTED value back to the server via the API
 *
 * The toggle knob animates smoothly between left (off) and right (on) positions
 * using Tailwind CSS transition classes, which tell the browser to animate
 * property changes over a short duration rather than snapping instantly.
 */
import { api } from '../../lib/api';
import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export const ToggleWidget = memo(function ToggleWidget({ title, tag, tagValues, titleStyle, valueStyle, chrome = 'full' }: Props) {
  // Read the current value from the tag store and convert to boolean
  const tv = tagValues[tag];
  const value = Boolean(tv?.value);

  // Write the INVERTED value — if currently on (true), write off (false), and vice versa
  const handleToggle = useCallback(async () => {
    await api.writeTag(tag, !value);
  }, [tag, value]);

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col justify-center items-center`}>
      {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>}
      {/* The toggle track — `transition-colors` animates the background color change.
          When value is true, the track turns green; when false, it's gray. */}
      {/* Track and knob use fixed px sizes so they don't scale with root font-size */}
      <button
        onClick={handleToggle}
        className={`rounded-full transition-colors relative ${
          value ? 'bg-green-500' : 'bg-slate-600'
        }`}
        style={{ width: 80, height: 44 }}
      >
        <span
          className="absolute bg-white rounded-full transition-all shadow-md"
          style={{ top: 6, width: 32, height: 32, left: value ? 42 : 6 }}
        />
      </button>
      <div className={`text-base font-medium ${value ? 'text-green-400' : 'text-slate-400'} mt-1`} style={textStyleToCSS(valueStyle)}>
        {value ? 'ON' : 'OFF'}
      </div>
    </div>
  );
});
