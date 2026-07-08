import { useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { computeBudget } from '@/engine/budget';
import type { CategoryBudget } from '@/engine/types';
import { MonthNavigator } from './MonthNavigator';
import { BudgetSidebar } from './BudgetSidebar';
import { CategoryGroupRow } from './CategoryGroupRow';
import { CategoryRow } from './CategoryRow';
import { CreateAccountDialog } from '@/components/accounts/CreateAccountDialog';
import { Wallet } from 'lucide-react';

type FilterStatus = CategoryBudget['status'] | null;

export const BudgetPage = observer(function BudgetPage() {
  const { budgetStore, categoryStore, transactionStore, accountStore } = useStore();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<FilterStatus>(null);
  const [showCreateAccount, setShowCreateAccount] = useState(false);

  const month = budgetStore.currentMonth;
  const locked = budgetStore.isMonthLocked(month);
  const hasAccounts = accountStore.sortedAccounts.length > 0;

  // Compute budget from pure engine — no useMemo, observer() handles reactivity
  const groups = categoryStore.sortedGroups;
  const categories = categoryStore.flatCategories;
  const transactions = Array.from(transactionStore.transactions.values());
  const splitEntries: import('@/types').SplitEntry[] = [];
  for (const tx of transactions) {
    const splits = transactionStore.splitsForTransaction(tx.id);
    splitEntries.push(...splits);
  }
  const assignments = Array.from(budgetStore.assignments.values());

  const budgetMonth = computeBudget(groups, categories, transactions, splitEntries, assignments, month);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Resolve category names
  const getCategoryName = (categoryId: string): string => {
    const cat = categoryStore.getCategory(categoryId);
    return cat?.name ?? 'Unknown';
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Account onboarding prompt */}
      {!hasAccounts && (
        <div className="flex flex-col items-center justify-center py-16 px-4 border-b border-zinc-800">
          <Wallet size={40} className="text-zinc-600 mb-3" />
          <h2 className="text-lg font-medium text-zinc-200 mb-1">Create your first account</h2>
          <p className="text-sm text-zinc-500 mb-4 text-center max-w-xs">
            You need at least one account to start budgeting. Add a checking, savings, or credit account.
          </p>
          <button
            onClick={() => setShowCreateAccount(true)}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors"
          >
            Create Account
          </button>
          <CreateAccountDialog open={showCreateAccount} onClose={() => setShowCreateAccount(false)} />
        </div>
      )}

      {/* Header row: month nav */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <MonthNavigator />
      </header>

      {/* Body: sidebar (with RTA) + category list */}
      <div className="flex flex-1 overflow-hidden">
        <BudgetSidebar
          rta={budgetMonth.rta}
          counts={budgetMonth.counts}
          activeFilter={statusFilter}
          onFilterChange={setStatusFilter}
        />

        {/* Category list */}
        <div className="flex-1 overflow-y-auto">
          {/* Column header */}
          <div className="sticky top-0 z-10 grid grid-cols-[1fr_140px_120px_120px_120px] items-center gap-2 px-3 py-2 bg-[#0a0a0f] border-b border-zinc-800">
            <span className="text-xs text-zinc-500 font-[Figtree] uppercase tracking-wide pl-6">
              Category
            </span>
            <span className="text-xs text-zinc-500 font-[Figtree] uppercase tracking-wide text-center">
              Target
            </span>
            <span className="text-xs text-zinc-500 font-[Figtree] uppercase tracking-wide text-right">
              Assigned
            </span>
            <span className="text-xs text-zinc-500 font-[Figtree] uppercase tracking-wide text-right">
              Activity
            </span>
            <span className="text-xs text-zinc-500 font-[Figtree] uppercase tracking-wide text-right">
              Available
            </span>
          </div>

          {/* Groups and categories */}
          {budgetMonth.groups.map((group) => {
            const expanded = !collapsedGroups.has(group.groupId);

            // Filter categories by status if a filter is active
            const filteredCategories = statusFilter
              ? group.categories.filter((c) => c.status === statusFilter)
              : group.categories;

            // Skip the group entirely if all categories are filtered out
            if (statusFilter && filteredCategories.length === 0) return null;

            return (
              <div key={group.groupId}>
                <CategoryGroupRow
                  group={group}
                  expanded={expanded}
                  onToggle={() => toggleGroup(group.groupId)}
                />
                {expanded &&
                  filteredCategories.map((catBudget) => (
                    <CategoryRow
                      key={catBudget.categoryId}
                      budget={catBudget}
                      categoryName={getCategoryName(catBudget.categoryId)}
                      month={month}
                      locked={locked}
                    />
                  ))}
              </div>
            );
          })}

          {/* Empty state */}
          {budgetMonth.groups.length === 0 && (
            <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
              No categories yet. Add some in Settings → Categories.
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
