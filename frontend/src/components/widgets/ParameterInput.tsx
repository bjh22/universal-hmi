import { memo, useState } from 'react';
import { api } from '../../lib/api';
import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { NumericKeypad } from './TouchInput';
import { getContainerClasses, shouldShowTitle, shouldShowExtras, getTitleClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  min?: number;
  max?: number;
  step?: number;
  units?: string;
  decimalPlaces?: number;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export const ParameterInput = memo(function ParameterInput({ title, tag, tagValues, min = 0, max = 100, units = '', decimalPlaces = 1, titleStyle, valueStyle, chrome = 'full' }: Props) {
  const tv = tagValues[tag];
  const currentValue = Number(tv?.value ?? 0);
  const [showKeypad, setShowKeypad] = useState(false);

  const handleSubmit = async (val: string) => {
    const num = Number(val);
    if (isNaN(num)) return;
    const clamped = Math.max(min, Math.min(max, num));
    await api.writeTag(tag, clamped);
    setShowKeypad(false);
  };

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col`}>
      {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>}
      <div className="flex-1 flex flex-col justify-center gap-2">
        <button
          onClick={() => setShowKeypad(true)}
          className="text-left group"
        >
          <div className="text-3xl font-bold text-slate-100 group-hover:text-blue-300 transition-colors" style={textStyleToCSS(valueStyle)}>
            {currentValue.toFixed(decimalPlaces)}
            <span className="text-base font-normal text-slate-400 ml-1">{units}</span>
          </div>
          {shouldShowExtras(chrome) && <div className="text-sm text-blue-400 group-hover:text-blue-300 mt-1">Tap to change</div>}
        </button>
        {shouldShowExtras(chrome) && <div className="text-sm text-slate-500">Range: {min} – {max} {units}</div>}
      </div>
      {showKeypad && (
        <NumericKeypad
          value={currentValue.toFixed(decimalPlaces)}
          title={title}
          units={units}
          min={min}
          max={max}
          decimalPlaces={decimalPlaces}
          onSubmit={handleSubmit}
          onClose={() => setShowKeypad(false)}
        />
      )}
    </div>
  );
});
