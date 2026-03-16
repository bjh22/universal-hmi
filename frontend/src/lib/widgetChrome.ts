/**
 * widgetChrome — utility functions for widget visual "chrome" (the border, padding,
 * and background styling that wraps a widget's content).
 *
 * "Chrome" is a UI design term for the decorative/structural frame around content —
 * think of a browser's chrome (address bar, tabs) vs the web page itself. In this HMI,
 * widgets can have three chrome levels:
 *   - 'full':    dark background, rounded border, generous padding, visible title
 *   - 'compact': translucent background, tighter padding, smaller title
 *   - 'none':    no background or border — widget content fills the entire space
 *
 * These functions return Tailwind CSS class strings that WidgetRenderer and individual
 * widgets use to apply the correct styling based on the designer's choice.
 */
type ChromeLevel = 'full' | 'compact' | 'none';

export function getContainerClasses(chrome: ChromeLevel = 'full'): string {
  switch (chrome) {
    case 'full':
      return 'bg-slate-800 rounded-xl p-4 border border-slate-700';
    case 'compact':
      return 'bg-slate-800/60 rounded-lg p-2 border border-slate-700/50';
    case 'none':
      return '';
  }
}

export function shouldShowTitle(chrome: ChromeLevel = 'full'): boolean {
  return chrome !== 'none';
}

export function getTitleClasses(chrome: ChromeLevel = 'full'): string {
  switch (chrome) {
    case 'full':
      return 'text-sm text-slate-400 mb-2 font-medium uppercase tracking-wider';
    case 'compact':
      return 'text-xs text-slate-400 mb-1 font-medium uppercase tracking-wider';
    case 'none':
      return '';
  }
}

export function shouldShowExtras(chrome: ChromeLevel = 'full'): boolean {
  return chrome === 'full';
}
