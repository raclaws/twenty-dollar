import { observer } from 'mobx-react-lite';
import { formatCurrency } from '@/lib/format';
import type { CategoryBudget } from '@/engine/types';

type Status = CategoryBudget['status'];
type FilterStatus = Status | null;

interface BudgetSidebarProps {
  rta: number; // cents
  counts: {
    overspent: number;
    underfunded: number;
    unfunded: number;
    funded: number;
  };
  activeFilter: FilterStatus;
  onFilterChange: (status: FilterStatus) => void;
}

const counterItems: { key: Status; label: string; colorClass: string }[] = [
  { key: 'overspent', label: 'Overspent', colorClass: 'text-red-400' },
  { key: 'underfunded', label: 'Underfunded', colorClass: 'text-amber-400' },
  { key: 'unfunded', label: 'Unfunded', colorClass: 'text-zinc-400' },
  { key: 'funded', label: 'Funded', colorClass: 'text-emerald-400' },
];

export const BudgetSidebar = observer(function BudgetSidebar({
  rta,
  counts,
  activeFilter,
  onFilterChange,
}: BudgetSidebarProps) {
  const rtaColor =
    rta > 0
      ? 'text-[#a6e3a1]'
      : rta < 0
        ? 'text-[#f38ba8]'
        : 'text-zinc-400';

  return (
    <aside className="w-52 flex-shrink-0 space-y-3 pt-4 px-3">
      {/* Ready to Assign — primary display */}
      <div className="pb-3 border-b border-zinc-800">
        <span className="block text-xs text-zinc-500 font-[Figtree] uppercase tracking-wide mb-1">
          Ready to Assign
        </span>
        <span className={`block text-xl font-semibold font-[JetBrains_Mono] ${rtaColor}`}>
          {formatCurrency(rta)}
        </span>
      </div>

      {/* Status counters */}
      <div className="space-y-0.5">
        {counterItems.map(({ key, label, colorClass }) => {
          const count = counts[key];
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              onClick={() => onFilterChange(isActive ? null : key)}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-sm text-xs transition-colors ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300'
              }`}
              aria-pressed={isActive}
            >
              <span className="font-[Figtree]">{label}</span>
              <span className={`font-[JetBrains_Mono] font-medium ${colorClass}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
});
