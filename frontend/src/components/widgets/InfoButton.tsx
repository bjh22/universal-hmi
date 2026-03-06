import { useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';

interface Props {
  description: string;
  title?: string;
}

function InfoPopover({ description, title, onClose }: Props & { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <HelpCircle size={16} className="text-blue-400" />
            <span className="text-sm font-semibold text-slate-200">{title || 'Tag Information'}</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1">
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm text-slate-300 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Absolutely-positioned info button for widget containers (top-right corner) */
export function InfoButton({ description, title }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="absolute top-1.5 right-1.5 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-slate-700/80 hover:bg-blue-600/80 text-slate-400 hover:text-white transition-colors"
        title="Tag info"
      >
        <HelpCircle size={14} />
      </button>
      {open && <InfoPopover description={description} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Inline info button for use within rows (control groups, tables, etc.) */
export function InlineInfoButton({ description, title }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-full text-slate-500 hover:text-blue-400 transition-colors"
        title="Tag info"
      >
        <HelpCircle size={12} />
      </button>
      {open && <InfoPopover description={description} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}
