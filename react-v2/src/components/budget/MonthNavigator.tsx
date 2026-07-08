import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { formatMonthLabel } from '@/lib/format';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

export const MonthNavigator = observer(function MonthNavigator() {
  const { budgetStore } = useStore();
  const currentMonth = budgetStore.currentMonth;
  const today = format(new Date(), 'yyyy-MM');
  const isToday = currentMonth === today;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => budgetStore.navigateMonth(-1)}
        className="p-1.5 rounded-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        aria-label="Previous month"
      >
        <ChevronLeft size={18} />
      </button>

      <span className="text-sm font-medium text-zinc-100 min-w-[140px] text-center font-[Figtree]">
        {formatMonthLabel(currentMonth)}
      </span>

      <button
        onClick={() => budgetStore.navigateMonth(1)}
        className="p-1.5 rounded-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        aria-label="Next month"
      >
        <ChevronRight size={18} />
      </button>

      {!isToday && (
        <button
          onClick={() => {
            budgetStore.currentMonth = today;
          }}
          className="ml-2 px-2 py-1 text-xs rounded-sm bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
        >
          Today
        </button>
      )}
    </div>
  );
});
