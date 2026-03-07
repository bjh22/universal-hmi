import type { TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  description?: string;
  titleStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export function ContainerWidget({ title, titleStyle, chrome = 'full' }: Props) {
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

  return (
    <div className={`${containerClasses} h-full flex flex-col`}>
      {shouldShowTitle(chrome) && (
        <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>
          {title}
        </div>
      )}
    </div>
  );
}
