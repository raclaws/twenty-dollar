import { useState, useCallback, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { TransactionTable, type SortField, type SortDirection, type GroupByMode, type SortState, type GroupState } from './TransactionTable';
import { AddTransactionRow } from './AddTransactionRow';
import type { Transaction } from '@/types';

interface TransactionsPageProps {
  accountId?: string;
  categoryId?: string;
  compact?: boolean;
}

export const TransactionsPage = observer(function TransactionsPage({
  accountId,
  categoryId,
  compact = false,
}: TransactionsPageProps) {
  const { transactionStore, payeeStore, categoryStore, accountStore } = useStore();

  // --- Sort state ---
  const [sortState, setSortState] = useState<SortState>({ field: 'date', dir: 'desc' });

  // --- Group state ---
  const [groupBy, setGroupBy] = useState<GroupByMode>('month');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // --- Category filter ---
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());

  const groupState: GroupState = { groupBy, collapsed };

  // --- Sort handler ---
  const handleSortChange = useCallback((field: SortField, dir: SortDirection) => {
    setSortState({ field, dir });
  }, []);

  // --- Group handler ---
  const handleGroupByChange = useCallback((mode: GroupByMode) => {
    setGroupBy((prev) => (prev === mode ? 'none' : mode));
    setCollapsed(new Set());
  }, []);

  // --- Collapse toggle ---
  const handleToggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // --- Select group (no-op at page level, table handles internally) ---
  const handleSelectGroup = useCallback((_key: string) => {}, []);

  // --- Build transaction list with sorting ---
  const transactions: Transaction[] = (() => {
    // Filter
    let txns = Array.from(transactionStore.items.values());
    if (accountId) {
      txns = txns.filter((tx) => tx.account_id === accountId);
    }
    if (categoryId) {
      txns = txns.filter((tx) => tx.category_id === categoryId);
    }
    if (categoryFilter.size > 0) {
      txns = txns.filter((tx) => categoryFilter.has(tx.category_id ?? ''));
    }

    // Sort
    const { field, dir } = sortState;
    const mult = dir === 'asc' ? 1 : -1;

    txns.sort((a, b) => {
      let cmp = 0;
      switch (field) {
        case 'date':
          cmp = a.date.localeCompare(b.date);
          if (cmp === 0) cmp = a.created_at.localeCompare(b.created_at);
          break;
        case 'payee': {
          const nameA = payeeStore.getById(a.payee_id)?.name ?? '';
          const nameB = payeeStore.getById(b.payee_id)?.name ?? '';
          cmp = nameA.localeCompare(nameB);
          break;
        }
        case 'category': {
          const catA = a.category_id ? (categoryStore.getCategory(a.category_id)?.name ?? '') : '';
          const catB = b.category_id ? (categoryStore.getCategory(b.category_id)?.name ?? '') : '';
          cmp = catA.localeCompare(catB);
          break;
        }
        case 'amount':
          cmp = a.amount - b.amount;
          break;
      }
      return mult * cmp;
    });

    return txns;
  })();

  // --- Running balances ---
  const runningBalances: number[] = (() => {
    const balances = new Array<number>(transactions.length);
    let total = 0;
    for (let i = 0; i < transactions.length; i++) {
      total += transactions[i].amount;
      balances[i] = total;
    }
    return balances;
  })();

  // Account name for header
  const accountName = accountId ? accountStore.getById(accountId)?.name : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-xl font-medium text-zinc-100 font-[Figtree]">
          {accountName ?? 'Transactions'}
        </h1>
      </div>

      {/* Add Transaction Row */}
      {accountId && !compact && (
        <AddTransactionRow accountId={accountId} />
      )}

      {/* Transaction Table */}
      <TransactionTable
        transactions={transactions}
        runningBalances={runningBalances}
        showAccountColumn={!accountId || compact}
        hideCategory={compact}
        hideBalance={compact}
        sortState={sortState}
        groupState={groupState}
        onSortChange={handleSortChange}
        onGroupByChange={handleGroupByChange}
        onToggleCollapse={handleToggleCollapse}
        onSelectGroup={handleSelectGroup}
      />
    </div>
  );
});
