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
    <div className="month-nav">
      <button
        className="month-nav__btn"
        onClick={() => budgetStore.navigateMonth(-1)}
        aria-label="Previous month"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="month-nav__label">{formatMonthLabel(currentMonth)}</span>
      <button
        className="month-nav__btn"
        onClick={() => budgetStore.navigateMonth(1)}
        aria-label="Next month"
      >
        <ChevronRight size={16} />
      </button>
      {!isToday && (
        <button
          className="month-nav__btn month-nav__btn--today"
          onClick={() => { budgetStore.currentMonth = today; }}
        >
          Today
        </button>
      )}
    </div>
  );
});
