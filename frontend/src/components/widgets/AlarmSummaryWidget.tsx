import type { AlarmData, TextStyle } from '../../types';
import { textStyleToCSS } from '../../lib/textStyle';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';

interface Props {
  title: string;
  alarms: AlarmData[];
  titleStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export function AlarmSummaryWidget({ title, alarms, titleStyle, chrome = 'full' }: Props) {
  const active = alarms.filter(a => a.state !== 'inactive');
  const critical = active.filter(a => a.severity === 'critical').length;
  const warning = active.filter(a => a.severity === 'warning').length;
  const info = active.filter(a => a.severity === 'info').length;

  return (
    <div
      className={`${getContainerClasses(chrome)} h-full flex flex-col cursor-pointer hover:border-slate-600 transition-colors`}
      onClick={() => window.location.href = '/alarms'}
      title="View all alarms"
    >
      {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)} style={textStyleToCSS(titleStyle)}>{title}</div>}
      <div className="flex-1 flex items-center gap-3">
        <Badge count={critical} color="bg-red-600" label="Critical" />
        <Badge count={warning} color="bg-yellow-600" label="Warning" />
        <Badge count={info} color="bg-blue-600" label="Info" />
      </div>
      {active.length === 0 && (
        <div className="text-sm text-green-400 mt-1">No active alarms</div>
      )}
    </div>
  );
}

function Badge({ count, color, label }: { count: number; color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`${color} text-white text-xl font-bold rounded-lg w-12 h-12 flex items-center justify-center ${count === 0 ? 'opacity-30' : ''}`}>
        {count}
      </div>
      <span className="text-xs text-slate-500 uppercase">{label}</span>
    </div>
  );
}
