import { memo, useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import type { TagValue, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  tag?: string;
  tagValues: Record<string, TagValue>;
  staticContent?: string;
  fgColor?: string;
  bgColor?: string;
  titleStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export const QRCodeWidget = memo(function QRCodeWidget({ title, tag, tagValues, staticContent, fgColor = '#ffffff', bgColor = 'transparent', titleStyle, chrome = 'full' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve content: tag value takes precedence, then static content
  const tagValue = tag ? tagValues[tag]?.value : undefined;
  const content = tagValue != null ? String(tagValue) : (staticContent || '');

  // qrcode library requires hex colors — convert 'transparent' to hex with alpha
  const resolvedBg = bgColor === 'transparent' ? '#00000000' : bgColor;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (!content) {
      // Reset error state when content is cleared — prop-driven sync, not cascading
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('No content');
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const size = Math.min(container.clientWidth, container.clientHeight);
    if (size <= 0) return;

    QRCode.toCanvas(canvas, content, {
      width: size,
      margin: 1,
      color: { dark: fgColor, light: resolvedBg },
      errorCorrectionLevel: 'M',
    }).then(() => setError(null))
      .catch(() => setError('Encode error'));
  }, [content, fgColor, resolvedBg]);

  // Re-render on resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || !content) return;

    const observer = new ResizeObserver(() => {
      const size = Math.min(container.clientWidth, container.clientHeight);
      if (size <= 0) return;
      QRCode.toCanvas(canvas, content, {
        width: size,
        margin: 1,
        color: { dark: fgColor, light: resolvedBg },
        errorCorrectionLevel: 'M',
      }).catch(() => {});
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [content, fgColor, resolvedBg]);

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col`}>
      {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>}
      <div ref={containerRef} className="flex-1 flex items-center justify-center min-h-0">
        {error && <span className="text-xs text-slate-500">{error}</span>}
        <canvas ref={canvasRef} className={`max-w-full max-h-full ${error ? 'hidden' : ''}`} />
      </div>
    </div>
  );
});
