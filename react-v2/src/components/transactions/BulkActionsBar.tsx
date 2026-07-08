interface BulkActionsBarProps {
  selectedCount: number;
  onDelete: () => void;
  onClear: () => void;
  onUnclear: () => void;
  onDeselectAll: () => void;
}

export function BulkActionsBar({
  selectedCount,
  onDelete,
  onClear,
  onUnclear,
  onDeselectAll,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-zinc-800 border-b border-zinc-700">
      <span className="text-sm text-zinc-300">
        {selectedCount} selected
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onClear}
          className="px-2.5 py-1 text-xs font-medium text-zinc-200 bg-zinc-700 rounded hover:bg-zinc-600 transition-colors"
        >
          Clear
        </button>
        <button
          onClick={onUnclear}
          className="px-2.5 py-1 text-xs font-medium text-zinc-200 bg-zinc-700 rounded hover:bg-zinc-600 transition-colors"
        >
          Unclear
        </button>
        <button
          onClick={onDelete}
          className="px-2.5 py-1 text-xs font-medium text-red-300 bg-zinc-700 rounded hover:bg-red-900/50 transition-colors"
        >
          Delete
        </button>
      </div>
      <button
        onClick={onDeselectAll}
        className="ml-auto text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        Deselect all
      </button>
    </div>
  );
}
