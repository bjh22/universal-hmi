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
