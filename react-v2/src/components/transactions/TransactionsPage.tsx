import { useMemo, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { TransactionTable } from './TransactionTable';
import { AddTransactionRow } from './AddTransactionRow';
import { BulkActionsBar } from './BulkActionsBar';
import { TransactionFilters } from './TransactionFilters';

export const TransactionsPage = observer(function TransactionsPage() {
  const { transactionStore, accountStore } = useStore();
  const navigate = useNavigate();
  const search: Record<string, unknown> = useSearch({ strict: false });

  const accountId = (search.account as string) || null;
  const accountName = accountId ? accountStore.getById(accountId)?.name : null;

  const handleAccountChange = useCallback(
    (id: string | null) => {
      void navigate({
        to: '/transactions',
        search: id ? { account: id } : {},
      });
    },
    [navigate],
  );

  // Get transactions — all or filtered by account (no useMemo — observer() handles reactivity)
  const transactions = accountId
    ? transactionStore.transactionsForAccount(accountId)
    : Array.from(transactionStore.transactions.values()).sort(
        (a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at),
      );

  // Compute running balances (from oldest to newest, then map back to display order)
  const reversed = [...transactions].reverse();
  const runningBalances: number[] = new Array(reversed.length);
  let running = 0;
  for (let i = 0; i < reversed.length; i++) {
    running += reversed[i].amount;
    runningBalances[i] = running;
  }
  runningBalances.reverse();

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

      {/* Transaction Table */}
      <div className="flex-1 overflow-y-auto">
        <TransactionTable
          transactions={transactions}
          runningBalances={runningBalances}
        />
      </div>
    </div>
  );
});
