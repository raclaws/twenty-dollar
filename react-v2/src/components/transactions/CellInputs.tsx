import { useState, useRef, useEffect, useCallback } from 'react';

// --- DatePicker (inline date cell input) ---

interface DatePickerProps {
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export function DatePicker({ value, onCommit, onCancel }: DatePickerProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(draft);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onCommit(draft);
    }
  };

  return (
    <input
      ref={inputRef}
      type="date"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={handleKeyDown}
      className="w-full bg-zinc-700 text-zinc-100 text-sm px-1.5 py-0.5 rounded border border-zinc-600 outline-none focus:border-blue-500 font-[JetBrains_Mono]"
    />
  );
}

// --- MemoCell (inline memo text input, commits on blur) ---

interface MemoCellProps {
  value: string;
  onCommit: (value: string) => void;
}

export function MemoCell({ value, onCommit }: MemoCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, value]);

  const commit = useCallback(() => {
    if (draft !== value) {
      onCommit(draft);
    }
    setEditing(false);
  }, [draft, value, onCommit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder="Memo"
        className="w-full bg-zinc-700 text-zinc-100 text-sm px-1.5 py-0.5 rounded border border-zinc-600 outline-none focus:border-blue-500"
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className="cursor-pointer truncate block px-1.5 py-0.5 rounded hover:bg-zinc-700/50 text-zinc-500"
    >
      {value || <span className="text-zinc-600">Memo</span>}
    </span>
  );
}

// --- AmountInput (inline amount cell input) ---

interface AmountInputProps {
  amount: number; // cents
  onCommit: (newAmount: number) => void;
  onCancel: () => void;
}

export function AmountInput({ amount, onCommit, onCancel }: AmountInputProps) {
  const [draft, setDraft] = useState((amount / 100).toFixed(2));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const commit = useCallback(() => {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed)) {
      const cents = Math.round(parsed * 100);
      onCommit(cents);
    } else {
      onCancel();
    }
  }, [draft, onCommit, onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commit();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      className="w-full bg-zinc-700 text-zinc-100 text-sm px-1.5 py-0.5 rounded border border-zinc-600 outline-none focus:border-blue-500 font-[JetBrains_Mono] text-right"
    />
  );
}
