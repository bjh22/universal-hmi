/**
 * TouchTextInput — a drop-in text input replacement for touch screens.
 *
 * Renders a read-only styled field that opens the AlphaKeyboard (or NumericKeypad)
 * on tap, so users can type without a physical keyboard.
 */
import { useState, useCallback } from 'react';
import { AlphaKeyboard, NumericKeypad } from './TouchInput';

interface TouchTextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  title?: string;
  type?: 'text' | 'number' | 'password';
  units?: string;
  min?: number;
  max?: number;
  decimalPlaces?: number;
  disabled?: boolean;
}

export function TouchTextInput({
  value,
  onChange,
  placeholder,
  className = '',
  title,
  type = 'text',
  units,
  min,
  max,
  decimalPlaces,
  disabled,
}: TouchTextInputProps) {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => {
    if (!disabled) setOpen(true);
  }, [disabled]);

  const handleSubmit = useCallback((newValue: string) => {
    onChange(newValue);
    setOpen(false);
  }, [onChange]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const displayValue = type === 'password' && value ? '\u2022'.repeat(value.length) : value;

  return (
    <>
      <div
        onClick={handleOpen}
        className={`cursor-pointer select-none ${className}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpen(); }}
      >
        {displayValue || (
          <span className="text-[var(--hmi-text-muted)]">{placeholder}</span>
        )}
      </div>
      {open && type === 'number' && (
        <NumericKeypad
          value={value}
          title={title}
          units={units}
          min={min}
          max={max}
          decimalPlaces={decimalPlaces}
          onSubmit={handleSubmit}
          onClose={handleClose}
        />
      )}
      {open && type !== 'number' && (
        <AlphaKeyboard
          value={value}
          title={title}
          onSubmit={handleSubmit}
          onClose={handleClose}
        />
      )}
    </>
  );
}
