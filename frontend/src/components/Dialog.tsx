import { X } from 'lucide-react';

interface DialogProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}

export function Dialog({ title, children, onClose, wide }: DialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className={`bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] rounded-lg shadow-xl p-5 w-full mx-4 ${wide ? 'max-w-4xl' : 'max-w-md'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--hmi-text-primary)]">{title}</h3>
          <button onClick={onClose} className="p-2.5 -m-1 rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-bg-base)]"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
