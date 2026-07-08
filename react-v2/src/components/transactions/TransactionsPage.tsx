import { useState, useMemo, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { TransactionTable } from './TransactionTable';
import { AddTransactionRow } from './AddTransactionRow';
import { BulkActionsBar } from './BulkActionsBar';
import { TransactionFilters } from './TransactionFilters';
import type { SortField, SortDirection, GroupByMode, SortState, GroupState } from './TransactionTable';

export const TransactionsPage = observer(function TransactionsPage() {
  const { transactionStore, accountStore, payeeStore, categoryStore } = useStore();
  const navigate = useNavigate();
  const search: Record<string, unknown> = useSearch({ strict: false });

  const accountId = (search.account as string) || null;
  const accountName = accountId ? accountStore.getById(accountId)?.name : null;

  // --- Sort state ---
  const [sortState, setSortState] = useState<SortState>({ field: 'date', dir: 'desc' });

  // --- Group state ---
  const [groupBy, setGroupBy] = useState<GroupByMode>('none');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groupState: GroupState = useMemo(() => ({ groupBy, collapsed }), [groupBy, collapsed]);

  const handleAccountChange = useCallback(
    (id: string | null) => {
      void navigate({
        to: '/transactions',
        search: id ? { account: id } : {},
      });
    },
    [navigate],
  );

  // --- Sort handler ---
  const handleSortChange = useCallback((field: SortField, dir: SortDirection | null) => {
    if (field === null || dir === null) {
      setSortState({ field: 'date', dir: 'desc' }); // reset to default
    } else {
      setSortState({ field, dir });
    }
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
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Get transactions — all or filtered by account
  const rawTransactions = useMemo(() => {
    if (accountId) {
      return transactionStore.transactionsForAccount(accountId);
    }
    return Array.from(transactionStore.transactions.values()).sort(
      (a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at),
    );
  }, [accountId, transactionStore, transactionStore.items.size]);

  // Apply sorting
  const transactions = useMemo(() => {
    if (!sortState.field) return rawTransactions;
    const sorted = [...rawTransactions];
    const dir = sortState.dir === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      switch (sortState.field) {
        case 'date':
          return dir * a.date.localeCompare(b.date);
        case 'payee': {
          const nameA = payeeStore.getById(a.payee_id)?.name ?? '';
          const nameB = payeeStore.getById(b.payee_id)?.name ?? '';
          return dir * nameA.localeCompare(nameB);
        }
        case 'category': {
          const catA = a.category_id ? categoryStore.getCategory(a.category_id)?.name ?? '' : '';
          const catB = b.category_id ? categoryStore.getCategory(b.category_id)?.name ?? '' : '';
          return dir * catA.localeCompare(catB);
        }
        case 'amount':
          return dir * (a.amount - b.amount);
        default:
          return 0;
      }
    });
    return sorted;
  }, [rawTransactions, sortState, payeeStore, categoryStore]);

  // Compute running balances (from oldest to newest, then map back to display order)
  const runningBalances = useMemo(() => {
    const reversed = [...transactions].reverse();
    const balances: number[] = new Array(reversed.length);
    let running = 0;
    for (let i = 0; i < reversed.length; i++) {
      running += reversed[i].amount;
      balances[i] = running;
    }
    balances.reverse();
    return balances;
  }, [transactions]);

  const selectedCount = transactionStore.selectedCount;

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(transactionStore.selectedIds);
    transactionStore.bulkAction('delete', ids);
    transactionStore.clearSelection();
  }, [transactionStore]);

  const handleBulkClear = useCallback(() => {
    const ids = Array.from(transactionStore.selectedIds);
    transactionStore.bulkAction('clear', ids);
    transactionStore.clearSelection();
  }, [transactionStore]);

  const handleBulkUnclear = useCallback(() => {
    const ids = Array.from(transactionStore.selectedIds);
    transactionStore.bulkAction('unclear', ids);
    transactionStore.clearSelection();
  }, [transactionStore]);

  const handleDeselectAll = useCallback(() => {
    transactionStore.clearSelection();
  }, [transactionStore]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-xl font-medium text-zinc-100 font-[Figtree]">
          {accountName ? accountName : 'Transactions'}
        </h1>
        <TransactionFilters
          selectedAccountId={accountId}
          onAccountChange={handleAccountChange}
        />
      </div>

      {/* Add Transaction Row */}
      <AddTransactionRow accountId={accountId} />

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedCount}
        onDelete={handleBulkDelete}
        onClear={handleBulkClear}
        onUnclear={handleBulkUnclear}
        onDeselectAll={handleDeselectAll}
      />

      {/* Transaction Table with virtual scroll */}
      <TransactionTable
        transactions={transactions}
        runningBalances={runningBalances}
        showAccountColumn={!accountId}
        sortState={sortState}
        groupState={groupState}
        onSortChange={handleSortChange}
        onGroupByChange={handleGroupByChange}
        onToggleCollapse={handleToggleCollapse}
      />
    </div>
  );
});
