import { useEffect, useState, useMemo } from 'react';
import { api } from '../../lib/api';
import type { Tag, TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';
import { InlineInfoButton } from './InfoButton';

interface Props {
  title: string;
  labelName: string;
  columns?: number;
  onColor?: string;
  offColor?: string;
  decimalPlaces?: number;
  tagOrder?: string[];
  tagValues: Record<string, TagValue>;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

function BoolIndicator({ tag, tagValues, onColor, offColor }: { tag: Tag; tagValues: Record<string, TagValue>; onColor: string; offColor: string }) {
  const tv = tagValues[tag.name];
  const value = Boolean(tv?.value);
  const color = value ? onColor : offColor;
  const longDesc = tv?.description;
  const diameter = 14;

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex items-center gap-1 min-w-0">
        {longDesc && <InlineInfoButton description={longDesc} title={tag.display_name || tag.name} />}
        <span className="text-xs text-slate-300 truncate">{tag.display_name || tag.name}</span>
      </div>
      <div
        style={{
          width: diameter,
          height: diameter,
          borderRadius: '50%',
          backgroundColor: color,
          boxShadow: value ? `0 0 ${diameter * 0.6}px ${diameter * 0.2}px ${onColor}80` : undefined,
          transition: 'background-color 0.2s, box-shadow 0.2s',
          flexShrink: 0,
        }}
      />
    </div>
  );
}

function ValueDisplay({ tag, tagValues, decimalPlaces, valueStyle }: { tag: Tag; tagValues: Record<string, TagValue>; decimalPlaces: number; valueStyle?: TextStyle }) {
  const tv = tagValues[tag.name];
  const value = tv?.value;
  const longDesc = tv?.description;
  const display = typeof value === 'number' ? value.toFixed(decimalPlaces) : String(value ?? '—');

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex items-center gap-1 min-w-0">
        {longDesc && <InlineInfoButton description={longDesc} title={tag.display_name || tag.name} />}
        <span className="text-xs text-slate-300 truncate" style={textStyleToCSS(valueStyle)}>{tag.display_name || tag.name}</span>
      </div>
      <span className="text-sm font-semibold text-slate-100 tabular-nums flex-shrink-0" style={textStyleToCSS(valueStyle)}>
        {display}
        {tag.engineering_units && <span className="text-xs text-slate-500 font-normal ml-1">{tag.engineering_units}</span>}
      </span>
    </div>
  );
}

export function AutoFillWidget({ title, labelName, columns = 2, onColor = '#22c55e', offColor = '#6b7280', decimalPlaces = 1, tagOrder, tagValues, titleStyle, valueStyle, chrome = 'full' }: Props) {
  const [fetchedTags, setFetchedTags] = useState<Tag[]>([]);

  useEffect(() => {
    if (!labelName) { setFetchedTags([]); return; }
    api.getTags().then(tags => {
      setFetchedTags(tags.filter(t => t.labels?.some(l => l.name === labelName)));
    }).catch(() => {});
  }, [labelName]);

  const matchedTags = useMemo(() => {
    if (!tagOrder || tagOrder.length === 0) {
      return [...fetchedTags].sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name));
    }
    const byName = new Map(fetchedTags.map(t => [t.name, t]));
    const ordered: Tag[] = [];
    for (const name of tagOrder) {
      const t = byName.get(name);
      if (t) { ordered.push(t); byName.delete(name); }
    }
    // Append new tags not in the order
    const remaining = [...byName.values()].sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name));
    return [...ordered, ...remaining];
  }, [fetchedTags, tagOrder]);

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col`}>
      {shouldShowTitle(chrome) && (
        <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>
          {title}
        </div>
      )}
      <div
        className="flex-1 overflow-auto"
        style={columns > 1 ? {
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: '0 0.75rem',
          alignContent: 'start',
        } : undefined}
      >
        {matchedTags.map(tag => (
          <div key={tag.id} className="border-b border-slate-700/50 last:border-0">
            {tag.data_type === 'bool' ? (
              <BoolIndicator tag={tag} tagValues={tagValues} onColor={onColor} offColor={offColor} />
            ) : (
              <ValueDisplay tag={tag} tagValues={tagValues} decimalPlaces={decimalPlaces} valueStyle={valueStyle} />
            )}
          </div>
        ))}
        {matchedTags.length === 0 && (
          <div className="text-xs text-slate-600 italic text-center py-4">
            {labelName ? `No tags with label "${labelName}"` : 'Select a label to auto-fill'}
          </div>
        )}
      </div>
    </div>
  );
}
