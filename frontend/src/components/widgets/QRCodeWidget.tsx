import { useEffect, useState, useRef } from 'react';
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

export function QRCodeWidget({ title, tag, tagValues, staticContent, fgColor = '#ffffff', bgColor = 'transparent', titleStyle, chrome = 'full' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve content: tag value takes precedence, then static content
  const tagValue = tag ? tagValues[tag]?.value : undefined;
  const content = tagValue != null ? String(tagValue) : (staticContent || '');

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (!content) {
      setError('No content');
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Size the QR to fit the container
    const size = Math.min(container.clientWidth, container.clientHeight);
    if (size <= 0) return;

    QRCode.toCanvas(canvas, content, {
      width: size,
      margin: 1,
      color: { dark: fgColor, light: bgColor },
      errorCorrectionLevel: 'M',
    }).then(() => setError(null))
      .catch(() => setError('Encode error'));
  }, [content, fgColor, bgColor]);

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
        color: { dark: fgColor, light: bgColor },
        errorCorrectionLevel: 'M',
      }).catch(() => {});
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [content, fgColor, bgColor]);

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col`}>
      {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>}
      <div ref={containerRef} className="flex-1 flex items-center justify-center min-h-0">
        {error ? (
          <span className="text-xs text-slate-500">{error}</span>
        ) : (
          <canvas ref={canvasRef} className="max-w-full max-h-full" />
        )}
      </div>
    </div>
  );
}
