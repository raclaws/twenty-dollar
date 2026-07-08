import { useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useStore } from '@/lib/store-context';
import { BudgetPage } from '@/components/budget';

export function BudgetMonthPage() {
  const { month } = useParams({ strict: false });
  const { budgetStore } = useStore();

  useEffect(() => {
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      budgetStore.currentMonth = month;
    }
  }, [month, budgetStore]);

  return <BudgetPage />;
}
