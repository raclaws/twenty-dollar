import { useState, useRef, useEffect } from 'react';
import { formatCurrency, parseCurrencyToCents } from '@/lib/format';

interface AssignmentInputProps {
  value: number; // cents
  onCommit: (cents: number) => void;
  disabled?: boolean;
}

export function AssignmentInput({ value, onCommit, disabled }: AssignmentInputProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEditing = () => {
    if (disabled) return;
    setDraft(value === 0 ? '' : (value / 100).toFixed(2));
    setEditing(true);
    setInvalid(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDraft(val);
    // Validate: allow empty, or a valid number pattern
    if (val === '') {
      setInvalid(false);
    } else {
      const cents = parseCurrencyToCents(val);
      setInvalid(cents === null);
    }
  };

  const commit = () => {
    const cents = parseCurrencyToCents(draft || '0');
    if (cents === null) {
      // Invalid input — revert
      setEditing(false);
      setInvalid(false);
      return;
    }
    if (cents !== value) {
      onCommit(cents);
    }
    setEditing(false);
    setInvalid(false);
  };

  const cancel = () => {
    setEditing(false);
    setInvalid(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={handleChange}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={`w-full bg-zinc-800 border rounded-sm px-2 py-0.5 text-right text-sm font-[JetBrains_Mono] text-zinc-100 outline-none ${
          invalid
            ? 'border-red-500 focus:border-red-500'
            : 'border-indigo-500/50 focus:border-indigo-500'
        }`}
        aria-label="Assignment amount"
        aria-invalid={invalid}
      />
    );
  }

  return (
    <button
      onClick={startEditing}
      disabled={disabled}
      className="w-full text-right px-2 py-0.5 text-sm font-[JetBrains_Mono] text-zinc-100 hover:bg-zinc-800 rounded-sm transition-colors cursor-text disabled:cursor-not-allowed disabled:opacity-50"
      aria-label="Edit assignment amount"
    >
      {formatCurrency(value)}
    </button>
  );
}
