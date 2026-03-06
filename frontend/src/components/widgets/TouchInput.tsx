import { useState, useEffect, useCallback, useRef } from 'react';
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
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export function NumericKeypad({ value: initialValue, title, units, min, max, onSubmit, onClose }: NumericKeypadProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the hidden input to prevent system keyboard on some browsers
    inputRef.current?.focus();
  }, []);

  const append = useCallback((ch: string) => {
    setValue(prev => {
      if (ch === '.' && prev.includes('.')) return prev;
      if (ch === '-') return prev.startsWith('-') ? prev.slice(1) : '-' + prev;
      if (prev === '0' && ch !== '.') return ch;
      if (prev === '-0' && ch !== '.') return '-' + ch;
      return prev + ch;
    });
  }, []);

  const backspace = useCallback(() => {
    setValue(prev => {
      if (prev.length <= 1) return '0';
      return prev.slice(0, -1);
    });
  }, []);

  const clear = useCallback(() => setValue('0'), []);

  const handleSubmit = useCallback(() => {
    const num = Number(value);
    if (isNaN(num)) return;
    onSubmit(value);
  }, [value, onSubmit]);

  const numVal = Number(value);
  const isValid = !isNaN(numVal) && (min === undefined || numVal >= min) && (max === undefined || numVal <= max);

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
              value={value}
            />
            {units && <span className="text-sm text-slate-500 ml-2 flex-shrink-0">{units}</span>}
          </div>
          {min !== undefined && max !== undefined && (
            <div className="text-[10px] text-slate-500 text-right mt-1 px-1">
              Range: {min} – {max}
              {!isValid && value !== '0' && value !== '' && (
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

// ─── Hook for easy integration ───

export function useNumericInput() {
  const [state, setState] = useState<{
    value: string;
    title?: string;
    units?: string;
    min?: number;
    max?: number;
    resolve: (val: string | null) => void;
  } | null>(null);

  const open = useCallback((opts: { value: string; title?: string; units?: string; min?: number; max?: number }): Promise<string | null> => {
    return new Promise(resolve => {
      setState({ ...opts, resolve });
    });
  }, []);

  const element = state ? (
    <NumericKeypad
      value={state.value}
      title={state.title}
      units={state.units}
      min={state.min}
      max={state.max}
      onSubmit={val => { state.resolve(val); setState(null); }}
      onClose={() => { state.resolve(null); setState(null); }}
    />
  ) : null;

  return { open, element };
}

export function useAlphaInput() {
  const [state, setState] = useState<{
    value: string;
    title?: string;
    resolve: (val: string | null) => void;
  } | null>(null);

  const open = useCallback((opts: { value: string; title?: string }): Promise<string | null> => {
    return new Promise(resolve => {
      setState({ ...opts, resolve });
    });
  }, []);

  const element = state ? (
    <AlphaKeyboard
      value={state.value}
      title={state.title}
      onSubmit={val => { state.resolve(val); setState(null); }}
      onClose={() => { state.resolve(null); setState(null); }}
    />
  ) : null;

  return { open, element };
}
