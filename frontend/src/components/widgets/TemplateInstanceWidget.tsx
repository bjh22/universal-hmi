import { memo } from 'react';
import type { Widget, TagValue, AlarmData, WidgetTemplate } from '../../types';
import { resolveWidgetTags } from '../../lib/resolveTagPrefix';
import { WidgetRenderer } from './WidgetRenderer';
import type { TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  titleStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
  templateName: string;
  tagPrefix: string;
  tagValues: Record<string, TagValue>;
  alarms?: AlarmData[];
  template?: WidgetTemplate;
}

export const TemplateInstanceWidget = memo(function TemplateInstanceWidget({
  title, titleStyle, chrome = 'full',
  templateName, tagPrefix, tagValues, alarms, template,
}: Props) {
  if (!template) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs border-2 border-dashed border-slate-600 rounded-xl p-4">
        <div className="font-medium mb-1">Template not found</div>
        <div className="text-[10px]">{templateName || 'No template selected'}</div>
      </div>
    );
  }

  const containerClasses = (() => {
    switch (chrome) {
      case 'full':
        return 'bg-slate-800/40 rounded-xl border-2 border-slate-600 p-3';
      case 'compact':
        return 'bg-slate-800/20 rounded-lg border border-slate-600/50 p-1.5';
      case 'none':
        return '';
    }
  })();

  return (
    <div className={`${containerClasses} h-full flex flex-col`}>
      {shouldShowTitle(chrome) && (
        <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>
          {title}
          {tagPrefix && <span className="text-[10px] text-slate-500 ml-1.5 font-normal">{tagPrefix}</span>}
        </div>
      )}
      <div className="relative flex-1">
        {template.layout.map((childWidget: Widget) => {
          const resolved = resolveWidgetTags(childWidget, tagPrefix);
          return (
            <div
              key={resolved.id}
              style={{
                position: 'absolute',
                left: resolved.x,
                top: resolved.y,
                width: resolved.w,
                height: resolved.h,
              }}
            >
              <WidgetRenderer widget={resolved} tagValues={tagValues} alarms={alarms} />
            </div>
          );
        })}
      </div>
    </div>
  );
});
