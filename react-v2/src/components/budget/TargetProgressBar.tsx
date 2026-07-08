interface TargetProgressBarProps {
  progress: number; // 0–1
}

export function TargetProgressBar({ progress }: TargetProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const color =
    clamped >= 1
      ? 'bg-emerald-500'
      : clamped >= 0.5
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <div className="h-1 w-full bg-zinc-800 rounded-sm overflow-hidden mt-1">
      <div
        className={`h-full rounded-sm transition-all ${color}`}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
