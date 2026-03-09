/**
 * CommandButton — a button widget that performs an action when clicked.
 * Two modes of operation:
 *   1. Tag write: writes a configured value to a tag (e.g. write "true" to "Motor.Start")
 *   2. Script execution: runs a server-side Python script for more complex actions
 *
 * Includes safety features: an optional confirmation dialog to prevent accidental
 * clicks on critical operations, and a "pending" state that disables the button
 * while the API call is in progress to prevent double-clicks.
 */
import { useState } from 'react';
import { api } from '../../lib/api';
import type { TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  tag?: string;
  value?: unknown;     // The value to write to the tag when clicked (can be any type)
  script?: string;     // Python script to execute server-side (alternative to tag write)
  color?: string;
  confirm?: boolean;   // If true, shows a browser confirmation dialog before executing
  titleStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

const COLORS: Record<string, string> = {
  green: 'bg-green-600 hover:bg-green-700 text-white',
  red: 'bg-red-600 hover:bg-red-700 text-white',
  blue: 'bg-blue-600 hover:bg-blue-700 text-white',
  yellow: 'bg-yellow-600 hover:bg-yellow-700 text-white',
};

export function CommandButton({ title, tag, value, script, color = 'blue', confirm: needsConfirm, titleStyle, chrome = 'full' }: Props) {
  // useState tracks whether an API call is currently in progress.
  // When pending is true, the button shows "Working..." and is disabled.
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    // Optional confirmation dialog — prevents accidental clicks on critical operations
    // like "Emergency Stop" or "Reset Counters". window.confirm() is a built-in
    // browser function that shows an OK/Cancel dialog.
    if (needsConfirm && !window.confirm(`Are you sure you want to: ${title}?`)) return;

    // Disable the button while the API call is in flight to prevent double-clicks
    setPending(true);
    // try/finally ensures setPending(false) runs even if the API call throws an error.
    // Without `finally`, a failed request would leave the button permanently disabled.
    try {
      if (script) {
        await api.executeScript(script);
      } else if (tag) {
        await api.writeTag(tag, value);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col justify-center items-center`}>
      <button
        onClick={handleClick}
        disabled={pending}
        className={`px-6 py-3 rounded-lg font-medium text-base transition-colors min-h-[44px] min-w-[44px] ${
          COLORS[color] || COLORS.blue
        } ${pending ? 'opacity-50 cursor-wait' : ''}`}
      >
        <span style={textStyleToCSS(titleStyle)}>{pending ? 'Working...' : title}</span>
      </button>
    </div>
  );
}
