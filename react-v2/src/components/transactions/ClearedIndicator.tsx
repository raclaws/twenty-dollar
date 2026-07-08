interface ClearedIndicatorProps {
  cleared: 0 | 1;
  onToggle: () => void;
}

export function ClearedIndicator({ cleared, onToggle }: ClearedIndicatorProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="flex items-center justify-center w-5 h-5 rounded-full transition-colors"
      aria-label={cleared ? 'Mark uncleared' : 'Mark cleared'}
      title={cleared ? 'Cleared' : 'Uncleared'}
    >
      <span
        className={`block w-3 h-3 rounded-full border-2 transition-colors ${
          cleared
            ? 'bg-emerald-400 border-emerald-400'
            : 'bg-transparent border-zinc-600 hover:border-zinc-400'
        }`}
      />
    </button>
  );
}
