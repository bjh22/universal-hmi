import type { CSSProperties } from 'react';
import type { TextStyle } from '../types';

export function textStyleToCSS(style?: TextStyle): CSSProperties | undefined {
  if (!style) return undefined;
  const css: CSSProperties = {};
  if (style.fontFamily) css.fontFamily = style.fontFamily;
  if (style.fontSize) css.fontSize = `${style.fontSize}px`;
  if (style.fontWeight) css.fontWeight = style.fontWeight;
  if (style.color) css.color = style.color;
  if (style.italic) css.fontStyle = 'italic';
  return Object.keys(css).length > 0 ? css : undefined;
}
