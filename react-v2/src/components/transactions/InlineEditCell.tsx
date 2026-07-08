import { useState, useRef, useEffect, useCallback } from 'react';

interface InlineEditCellProps {
  value: string;
  onCommit: (value: string) => void;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  className?: string;
  inputClassName?: string;
  type?: 'text' | 'date' | 'number';
  placeholder?: string;
}

export function InlineEditCell({
  value,
  onCommit,
  editing,
  onStartEdit,
  onCancelEdit,
  className = '',
  inputClassName = '',
  type = 'text',
  placeholder,
}: InlineEditCellProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      // Small delay to ensure the input is mounted
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
    onCancelEdit();
  }, [draft, value, onCommit, onCancelEdit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value);
      onCancelEdit();
    } else if (e.key === 'Tab') {
      commit();
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`w-full bg-zinc-700 text-zinc-100 text-sm px-1.5 py-0.5 rounded border border-zinc-600 outline-none focus:border-blue-500 ${inputClassName}`}
      />
    );
  }

  return (
    <span
      onClick={onStartEdit}
      className={`cursor-pointer truncate block px-1.5 py-0.5 rounded hover:bg-zinc-700/50 ${className}`}
    >
      {value || <span className="text-zinc-600">{placeholder || '—'}</span>}
    </span>
  );
}
