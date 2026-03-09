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

export function ToggleWidget({ title, tag, tagValues, titleStyle, valueStyle, chrome = 'full' }: Props) {
  // Read the current value from the tag store and convert to boolean
  const tv = tagValues[tag];
  const value = Boolean(tv?.value);

  // Write the INVERTED value — if currently on (true), write off (false), and vice versa
  const handleToggle = async () => {
    await api.writeTag(tag, !value);
  };

  const isNone = chrome === 'none';

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex ${isNone ? 'flex-row items-center gap-2' : 'flex-col justify-center items-center'}`}>
      {shouldShowTitle(chrome) && <div className={`${getTitleClasses(chrome)} ${isNone ? '' : 'mb-3'}`} style={textStyleToCSS(titleStyle)}>{title}</div>}
      {/* The toggle track — `transition-colors` animates the background color change.
          When value is true, the track turns green; when false, it's gray. */}
      <button
        onClick={handleToggle}
        className={`w-16 h-8 rounded-full transition-colors relative ${
          value ? 'bg-green-500' : 'bg-slate-600'
        }`}
      >
        {/* The toggle knob — `transition-transform` animates the position change.
            When value is true, the knob slides to the right (left-9); when false,
            it sits on the left (left-1). The browser smoothly animates between these. */}
        <span
          className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform shadow-md ${
            value ? 'left-9' : 'left-1'
          }`}
        />
      </button>
      <div className={`text-base font-medium ${value ? 'text-green-400' : 'text-slate-400'} ${isNone ? '' : 'mt-2'}`} style={textStyleToCSS(valueStyle)}>
        {value ? 'ON' : 'OFF'}
      </div>
    </div>
  );
}
