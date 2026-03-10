import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  description?: string;
  titleStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: (collapsed: boolean) => void;
}

export function CollapsibleContainerWidget({ title, titleStyle, chrome = 'full', defaultCollapsed = false, collapsed: controlledCollapsed, onToggleCollapsed }: Props) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isCollapsed = controlledCollapsed ?? internalCollapsed;

  const toggle = useCallback(() => {
    const next = !isCollapsed;
    setInternalCollapsed(next);
    onToggleCollapsed?.(next);
  }, [isCollapsed, onToggleCollapsed]);

  const containerClasses = (() => {
    switch (chrome) {
      case 'full':
        return 'bg-slate-800/40 rounded-xl border-2 border-slate-600 p-3';
      case 'compact':
        return 'bg-slate-800/20 rounded-lg border border-slate-600/50 p-1.5';
      case 'none':
        return 'border border-dashed border-slate-600/30';
    }
  })();

  const Icon = isCollapsed ? ChevronRight : ChevronDown;
  const iconSize = chrome === 'compact' ? 12 : 14;

  return (
    <div className={`${containerClasses} h-full flex flex-col`}>
      {shouldShowTitle(chrome) && (
        <button
          type="button"
          onClick={toggle}
          className={`${getTitleClasses(chrome)} flex items-center gap-1 cursor-pointer select-none hover:text-slate-300 transition-colors w-full text-left`}
          style={textStyleToCSS(titleStyle)}
        >
          <Icon size={iconSize} className="shrink-0" />
          {title}
        </button>
      )}
      {/* Children are rendered externally via parentId — this container just controls visibility */}
    </div>
  );
}
