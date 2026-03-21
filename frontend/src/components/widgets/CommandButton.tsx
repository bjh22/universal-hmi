/**
 * CommandButton — a button widget that performs an action when clicked.
 * Two modes of operation:
 *   1. Tag write: writes a configured value to a tag (e.g. write "true" to "Motor.Start")
 *   2. Script execution: runs a server-side Python script for more complex actions
 *
 * Includes safety features: an optional confirmation dialog to prevent accidental
 * clicks on critical operations, and a "pending" state that disables the button
 * while the API call is in progress to prevent double-clicks.
 *
 * Supports multiple visual styles:
 *   - variant: filled (default), outline, ghost
 *   - shape: rectangle (default), pill, circle
 *   - icon: optional Lucide icon name displayed beside (or instead of) the title
 */
import { memo, useState } from 'react';
import { api } from '../../lib/api';
import type { TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses } from '../../lib/widgetChrome';
import { icons } from 'lucide-react';

export type ButtonVariant = 'filled' | 'outline' | 'ghost';
export type ButtonShape = 'rectangle' | 'pill' | 'circle';

interface Props {
  title: string;
  tag?: string;
  value?: unknown;     // The value to write to the tag when clicked (can be any type)
  script?: string;     // Python script to execute server-side (alternative to tag write)
  color?: string;
  variant?: ButtonVariant;
  shape?: ButtonShape;
  icon?: string;       // Lucide icon name (e.g. "Play", "Power", "RotateCcw")
  iconPosition?: 'left' | 'right';
  confirm?: boolean;   // If true, shows a browser confirmation dialog before executing
  titleStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

const FILLED_COLORS: Record<string, string> = {
  green: 'bg-green-600 hover:bg-green-700 text-white',
  red: 'bg-red-600 hover:bg-red-700 text-white',
  blue: 'bg-blue-600 hover:bg-blue-700 text-white',
  yellow: 'bg-yellow-600 hover:bg-yellow-700 text-white',
};

const OUTLINE_COLORS: Record<string, string> = {
  green: 'border-2 border-green-500 text-green-400 hover:bg-green-500/20',
  red: 'border-2 border-red-500 text-red-400 hover:bg-red-500/20',
  blue: 'border-2 border-blue-500 text-blue-400 hover:bg-blue-500/20',
  yellow: 'border-2 border-yellow-500 text-yellow-400 hover:bg-yellow-500/20',
};

const GHOST_COLORS: Record<string, string> = {
  green: 'text-green-400 hover:bg-green-500/20',
  red: 'text-red-400 hover:bg-red-500/20',
  blue: 'text-blue-400 hover:bg-blue-500/20',
  yellow: 'text-yellow-400 hover:bg-yellow-500/20',
};

const VARIANT_MAP: Record<string, Record<string, string>> = {
  filled: FILLED_COLORS,
  outline: OUTLINE_COLORS,
  ghost: GHOST_COLORS,
};

function getLucideIcon(name: string): React.ComponentType<{ size?: number; className?: string }> | null {
  // Lucide icon names are PascalCase (e.g. "Play", "Power", "RotateCcw")
  const Icon = (icons as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[name];
  return Icon || null;
}

export const CommandButton = memo(function CommandButton({
  title, tag, value, script, color = 'blue',
  variant = 'filled', shape = 'rectangle', icon, iconPosition = 'left',
  confirm: needsConfirm, titleStyle, chrome = 'full',
}: Props) {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    if (needsConfirm && !window.confirm(`Are you sure you want to: ${title}?`)) return;
    setPending(true);
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

  const colorMap = VARIANT_MAP[variant] || FILLED_COLORS;
  const colorClasses = colorMap[color] || colorMap.blue;

  const shapeClasses = shape === 'circle'
    ? 'rounded-full aspect-square p-0'
    : shape === 'pill'
      ? 'rounded-full px-6 py-3'
      : 'rounded-lg px-6 py-3';

  const isCircle = shape === 'circle';
  const IconComponent = icon ? getLucideIcon(icon) : null;
  const showTitle = !isCircle || !IconComponent;

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col justify-center items-center`}>
      <button
        onClick={handleClick}
        disabled={pending}
        className={`font-medium text-base transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center gap-2 ${shapeClasses} ${colorClasses} ${
          pending ? 'opacity-50 cursor-wait' : ''
        } ${isCircle ? 'h-full max-h-full' : ''}`}
      >
        {pending ? (
          <span style={textStyleToCSS(titleStyle)}>Working...</span>
        ) : (
          <>
            {IconComponent && iconPosition === 'left' && <IconComponent size={isCircle ? 24 : 18} />}
            {showTitle && <span style={textStyleToCSS(titleStyle)}>{title}</span>}
            {IconComponent && iconPosition === 'right' && <IconComponent size={isCircle ? 24 : 18} />}
          </>
        )}
      </button>
    </div>
  );
});
