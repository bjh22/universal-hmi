import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { api } from '../../lib/api';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';
import { InlineInfoButton } from './InfoButton';

interface Props {
  title: string;
  tag: string;
  writeTag?: string;
  onColor?: string;
  offColor?: string;
  size?: 'small' | 'medium' | 'large';
  tagValues: Record<string, TagValue>;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

const SIZES: Record<string, number> = { small: 12, medium: 20, large: 32 };

export function LightIndicator({ title, tag, writeTag, onColor = '#22c55e', offColor = '#6b7280', size = 'medium', tagValues, titleStyle, valueStyle, chrome = 'full' }: Props) {
  const tv = tagValues[tag];
  const value = Boolean(tv?.value);
  const color = value ? onColor : offColor;
  const diameter = SIZES[size] || SIZES.medium;
  const longDesc = tv?.description;

  const handleClick = async () => {
    if (!writeTag) return;
    await api.writeTag(writeTag, !value);
  };

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col`}>
      {shouldShowTitle(chrome) && (
        <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>
          {title}
        </div>
      )}
      <div className="flex-1 flex items-center justify-center gap-2">
        {longDesc && <InlineInfoButton description={longDesc} title={title} />}
        <div
          onClick={writeTag ? handleClick : undefined}
          className={writeTag ? 'cursor-pointer active:scale-90 transition-transform' : undefined}
          style={{
            width: diameter,
            height: diameter,
            borderRadius: '50%',
            backgroundColor: color,
            boxShadow: value ? `0 0 ${diameter * 0.6}px ${diameter * 0.2}px ${onColor}80` : undefined,
            transition: 'background-color 0.2s, box-shadow 0.2s',
            flexShrink: 0,
          }}
          title={writeTag ? 'Click to toggle' : undefined}
        />
        {chrome === 'none' && title && (
          <span className="text-sm text-slate-300 truncate" style={textStyleToCSS(valueStyle)}>
            {title}
          </span>
        )}
      </div>
    </div>
  );
}
