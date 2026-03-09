import { useState } from 'react';
import { api } from '../../lib/api';
import type { TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  tag?: string;
  value?: unknown;
  script?: string;
  color?: string;
  confirm?: boolean;
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
