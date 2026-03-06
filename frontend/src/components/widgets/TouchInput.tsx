import { useState, useEffect, useCallback, useRef } from 'react';
// Hooks (useNumericInput, useAlphaInput) are in ./useTouchInput.ts
import { createPortal } from 'react-dom';
import { Delete, CornerDownLeft, X, ArrowUp } from 'lucide-react';

// ─── Shared popup backdrop ───

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-sm mx-auto mb-0 sm:mb-0" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}

const btnBase = 'flex items-center justify-center rounded-lg font-medium transition-colors active:scale-95 select-none';
const numBtn = `${btnBase} bg-slate-700 hover:bg-slate-600 text-white text-xl h-14`;
const actionBtn = `${btnBase} h-14 text-sm font-semibold`;

// ─── Numeric Keypad ───

interface NumericKeypadProps {
  value: string;
  title?: string;
  units?: string;
  min?: number;
  max?: number;
  decimalPlaces?: number;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export function NumericKeypad({ value: initialValue, title, units, min, max, decimalPlaces, onSubmit, onClose }: NumericKeypadProps) {
  const [value, setValue] = useState('');
  const [hasTyped, setHasTyped] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const displayValue = hasTyped ? value : initialValue;

  const append = useCallback((ch: string) => {
    setValue(prev => {
      const base = hasTyped ? prev : '';
      if (ch === '.' && base.includes('.')) return base;
      if (ch === '-') return base.startsWith('-') ? base.slice(1) : '-' + base;
      // Enforce decimal places limit
      if (decimalPlaces !== undefined && base.includes('.')) {
        const afterDot = base.split('.')[1] || '';
        if (afterDot.length >= decimalPlaces && ch !== '-') return base;
      }
      if (decimalPlaces === 0 && ch === '.') return base;
      if (base === '' && ch === '.') return '0.';
      if ((base === '0' || base === '') && ch !== '.') return ch;
      if (base === '-' && ch !== '.') return '-' + ch;
      if (base === '-0' && ch !== '.') return '-' + ch;
      return base + ch;
    });
    setHasTyped(true);
  }, [hasTyped, decimalPlaces]);

  const backspace = useCallback(() => {
    if (!hasTyped) {
      setValue('');
      setHasTyped(true);
      return;
    }
    setValue(prev => {
      if (prev.length <= 1) return '';
      return prev.slice(0, -1);
    });
  }, [hasTyped]);

  const clear = useCallback(() => { setValue(''); setHasTyped(true); }, []);

  const handleSubmit = useCallback(() => {
    const num = Number(displayValue);
    if (isNaN(num)) return;
    onSubmit(displayValue);
  }, [displayValue, onSubmit]);

  const numVal = Number(displayValue);
  const isValid = displayValue !== '' && !isNaN(numVal) && (min === undefined || numVal >= min) && (max === undefined || numVal <= max);

  return (
    <Backdrop onClose={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Display */}
        <div className="px-4 pt-4 pb-2">
          {title && (
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">{title}</span>
              <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X size={16} /></button>
            </div>
          )}
          <div className="bg-slate-900 rounded-xl px-4 py-3 flex items-baseline justify-between">
            <input
              ref={inputRef}
              readOnly
              tabIndex={-1}
              className="bg-transparent text-3xl font-bold text-white outline-none w-full text-right tabular-nums caret-transparent"
              value={displayValue || '0'}
            />
            {units && <span className="text-sm text-slate-500 ml-2 flex-shrink-0">{units}</span>}
          </div>
          {min !== undefined && max !== undefined && (
            <div className="text-[10px] text-slate-500 text-right mt-1 px-1">
              Range: {min} – {max}
              {!isValid && displayValue !== '0' && displayValue !== '' && (
                <span className="text-red-400 ml-2">Out of range</span>
              )}
            </div>
          )}
        </div>

        {/* Keypad grid */}
        <div className="grid grid-cols-4 gap-1.5 p-3">
          {['7', '8', '9'].map(n => (
            <button key={n} onClick={() => append(n)} className={numBtn}>{n}</button>
          ))}
          <button onClick={backspace} className={`${numBtn} bg-slate-600 hover:bg-slate-500`}>
            <Delete size={20} />
          </button>

          {['4', '5', '6'].map(n => (
            <button key={n} onClick={() => append(n)} className={numBtn}>{n}</button>
          ))}
          <button onClick={clear} className={`${numBtn} bg-slate-600 hover:bg-slate-500 text-base`}>
            CLR
          </button>

          {['1', '2', '3'].map(n => (
            <button key={n} onClick={() => append(n)} className={numBtn}>{n}</button>
          ))}
          <button onClick={() => append('-')} className={`${numBtn} bg-slate-600 hover:bg-slate-500`}>
            +/−
          </button>

          <button onClick={() => append('0')} className={`${numBtn} col-span-2`}>0</button>
          <button onClick={() => append('.')} className={numBtn}>.</button>
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className={`${actionBtn} ${isValid ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
          >
            <CornerDownLeft size={20} />
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// ─── Alpha Keyboard ───

const ROW1 = 'qwertyuiop'.split('');
const ROW2 = 'asdfghjkl'.split('');
const ROW3 = 'zxcvbnm'.split('');

interface AlphaKeyboardProps {
  value: string;
  title?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export function AlphaKeyboard({ value: initialValue, title, onSubmit, onClose }: AlphaKeyboardProps) {
  const [value, setValue] = useState(initialValue);
  const [shift, setShift] = useState(false);

  const append = useCallback((ch: string) => {
    const c = shift ? ch.toUpperCase() : ch;
    setValue(prev => prev + c);
    if (shift) setShift(false);
  }, [shift]);

  const backspace = useCallback(() => {
    setValue(prev => prev.slice(0, -1));
  }, []);

  const handleSubmit = useCallback(() => {
    onSubmit(value);
  }, [value, onSubmit]);

  const kbBtn = `${btnBase} bg-slate-700 hover:bg-slate-600 text-white h-11 min-w-[2rem] text-base`;

  return (
    <Backdrop onClose={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Display */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-1">
            {title && <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">{title}</span>}
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1 ml-auto"><X size={16} /></button>
          </div>
          <div className="bg-slate-900 rounded-xl px-4 py-3">
            <div className="text-xl font-medium text-white min-h-[1.75rem] break-all">
              {value || <span className="text-slate-600">Type here...</span>}
              <span className="animate-pulse text-blue-400 ml-0.5">|</span>
            </div>
          </div>
        </div>

        {/* Keyboard */}
        <div className="p-2 space-y-1.5">
          {/* Number row */}
          <div className="flex gap-1 justify-center">
            {(shift ? '!@#$%^&*()' : '1234567890').split('').map((ch, i) => (
              <button key={i} onClick={() => { setValue(prev => prev + ch); if (shift) setShift(false); }} className={`${kbBtn} flex-1`}>
                {ch}
              </button>
            ))}
          </div>
          {/* Row 1 */}
          <div className="flex gap-1 justify-center">
            {ROW1.map(ch => (
              <button key={ch} onClick={() => append(ch)} className={`${kbBtn} flex-1`}>
                {shift ? ch.toUpperCase() : ch}
              </button>
            ))}
          </div>
          {/* Row 2 */}
          <div className="flex gap-1 justify-center px-3">
            {ROW2.map(ch => (
              <button key={ch} onClick={() => append(ch)} className={`${kbBtn} flex-1`}>
                {shift ? ch.toUpperCase() : ch}
              </button>
            ))}
          </div>
          {/* Row 3 */}
          <div className="flex gap-1 justify-center">
            <button
              onClick={() => setShift(s => !s)}
              className={`${btnBase} h-11 w-12 text-sm ${shift ? 'bg-blue-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-slate-300'}`}
            >
              <ArrowUp size={18} />
            </button>
            {ROW3.map(ch => (
              <button key={ch} onClick={() => append(ch)} className={`${kbBtn} flex-1`}>
                {shift ? ch.toUpperCase() : ch}
              </button>
            ))}
            <button onClick={backspace} className={`${btnBase} bg-slate-600 hover:bg-slate-500 text-white h-11 w-12`}>
              <Delete size={18} />
            </button>
          </div>
          {/* Bottom row */}
          <div className="flex gap-1.5">
            <button onClick={() => setValue(prev => prev + ' ')} className={`${kbBtn} flex-1`}>
              space
            </button>
            <button onClick={() => append('.')} className={`${kbBtn} w-11`}>.</button>
            <button onClick={() => append('-')} className={`${kbBtn} w-11`}>-</button>
            <button
              onClick={handleSubmit}
              className={`${actionBtn} bg-blue-600 hover:bg-blue-700 text-white w-16`}
            >
              <CornerDownLeft size={18} />
            </button>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}

