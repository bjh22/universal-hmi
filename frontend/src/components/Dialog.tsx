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
      <div className={`bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-5 w-full mx-4 ${wide ? 'max-w-4xl' : 'max-w-md'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
