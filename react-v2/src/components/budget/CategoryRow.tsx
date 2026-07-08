import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { formatCurrency } from '@/lib/format';
import type { CategoryBudget } from '@/engine/types';
import { AssignmentInput } from './AssignmentInput';
import { HealthRing } from './HealthRing';
import { TargetProgressBar } from './TargetProgressBar';
import { StatusBadge } from './StatusBadge';

interface CategoryRowProps {
  budget: CategoryBudget;
  categoryName: string;
  month: string;
  locked: boolean;
}

const TARGET_TYPE_ICONS: Record<string, string> = {
  monthly: '↻',
  by_date: '📅',
  savings: '🎯',
};

export const CategoryRow = observer(function CategoryRow({
  budget,
  categoryName,
  month,
  locked,
}: CategoryRowProps) {
  const { budgetStore } = useStore();

  const availableColor =
    budget.available > 0
      ? 'text-[#a6e3a1]'
      : budget.available < 0
        ? 'text-[#f38ba8]'
        : 'text-zinc-400';

  const handleAssign = (cents: number) => {
    budgetStore.assign(budget.categoryId, month, cents);
  };

  return (
    <div
      className="grid grid-cols-[1fr_140px_120px_120px_120px] items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/30 transition-colors border-b border-zinc-800/50 group"
      role="row"
    >
      {/* Name + health ring + status badge */}
      <div className="flex items-center gap-2 pl-6 min-w-0">
        {budget.target && (
          <HealthRing progress={budget.target.progress} size={16} strokeWidth={2} />
        )}
        <span className="text-sm text-zinc-200 font-[Figtree] truncate">
          {categoryName}
        </span>
        <StatusBadge status={budget.status} />
      </div>

      {/* Target column — progress bar with label */}
      <div className="flex flex-col items-center justify-center px-1">
        {budget.target ? (
          <div className="w-full">
            <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-[JetBrains_Mono]">
              <span>{TARGET_TYPE_ICONS[budget.target.type] ?? ''}</span>
              <span className="truncate">
                {formatCurrency(budget.target.amount - budget.target.needed)} / {formatCurrency(budget.target.amount)}
              </span>
            </div>
            <TargetProgressBar progress={budget.target.progress} />
          </div>
        ) : (
          <span className="text-[11px] text-zinc-600">—</span>
        )}
      </div>

      {/* Assigned — inline editable */}
      <div className="flex justify-end">
        <div className="w-[100px]">
          <AssignmentInput
            value={budget.assigned}
            onCommit={handleAssign}
            disabled={locked}
          />
        </div>
      </div>

      {/* Activity */}
      <span className={`text-right text-sm font-[JetBrains_Mono] ${budget.activity < 0 ? 'text-[#f38ba8]' : 'text-zinc-400'}`}>
        {formatCurrency(budget.activity)}
      </span>

      {/* Available */}
      <span className={`text-right text-sm font-[JetBrains_Mono] ${availableColor}`}>
        {formatCurrency(budget.available)}
      </span>
    </div>
  );
});
