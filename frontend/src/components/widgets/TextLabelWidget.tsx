import type { TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  text?: string;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export function TextLabelWidget({ title, text, titleStyle, valueStyle, chrome = 'full' }: Props) {
  const displayText = text ?? title;

  // For 'none' chrome, TextLabel uses its own lighter styling instead of the standard container
  const containerClasses = chrome === 'full'
    ? 'bg-slate-800/50 rounded-xl p-4 border border-slate-700/50'
    : getContainerClasses(chrome);

  return (
    <div className={`${containerClasses} h-full flex flex-col justify-center`}>
      {text ? (
        <>
          {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>}
          <div className="text-base text-slate-200" style={textStyleToCSS(valueStyle)}>{text}</div>
        </>
      ) : (
        <div className="text-base text-slate-200" style={textStyleToCSS(titleStyle)}>{displayText}</div>
      )}
    </div>
  );
}
