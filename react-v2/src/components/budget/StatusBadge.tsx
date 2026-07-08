import type { CategoryBudget } from '@/engine/types';

type Status = CategoryBudget['status'];

const statusConfig: Record<Status, { label: string; className: string }> = {
  funded: {
    label: 'Funded',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  underfunded: {
    label: 'Underfunded',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  overspent: {
    label: 'Overspent',
    className: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  unfunded: {
    label: 'Unfunded',
    className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  },
};

interface StatusBadgeProps {
  status: Status;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border ${config.className}`}
    >
      {config.label}
    </span>
  );
}
