import type { TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';

interface Props {
  title: string;
  text?: string;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
}

export function TextLabelWidget({ title, text, titleStyle, valueStyle }: Props) {
  // If text is set, show it as the body; otherwise just show the title
  const displayText = text ?? title;

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 h-full flex flex-col justify-center border border-slate-700/50">
      {text ? (
        <>
          <div className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wider" style={textStyleToCSS(titleStyle)}>{title}</div>
          <div className="text-sm text-slate-200" style={textStyleToCSS(valueStyle)}>{text}</div>
        </>
      ) : (
        <div className="text-sm text-slate-200" style={textStyleToCSS(titleStyle)}>{displayText}</div>
      )}
    </div>
  );
}
