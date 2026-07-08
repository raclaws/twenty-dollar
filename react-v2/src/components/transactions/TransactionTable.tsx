import { useCallback, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import type { Transaction } from '@/types';
import { TransactionRow } from './TransactionRow';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

interface TransactionTableProps {
  transactions: Transaction[];
  runningBalances: number[];
  showAccountColumn?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

function SortIcon({ direction }: { direction: SortDirection }) {
  if (direction === 'asc') return <ChevronUp size={12} className="inline ml-0.5" />;
  if (direction === 'desc') return <ChevronDown size={12} className="inline ml-0.5" />;
  return <ChevronsUpDown size={12} className="inline ml-0.5 opacity-40" />;
}

export const TransactionTable = observer(function TransactionTable({
  transactions,
  runningBalances,
  showAccountColumn = true,
}: TransactionTableProps) {
  const { transactionStore } = useStore();
  const lastSelectedIndex = useRef<number | null>(null);

  const handleToggleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      if (shiftKey && lastSelectedIndex.current !== null) {
        // Range selection
        const currentIndex = transactions.findIndex((t) => t.id === id);
        if (currentIndex === -1) return;
        const start = Math.min(lastSelectedIndex.current, currentIndex);
        const end = Math.max(lastSelectedIndex.current, currentIndex);
        for (let i = start; i <= end; i++) {
          if (!transactionStore.selectedIds.has(transactions[i].id)) {
            transactionStore.toggleSelection(transactions[i].id);
          }
        }
        lastSelectedIndex.current = currentIndex;
      } else {
        transactionStore.toggleSelection(id);
        lastSelectedIndex.current = transactions.findIndex((t) => t.id === id);
      }
    },
    [transactions, transactionStore],
  );

  const allSelected =
    transactions.length > 0 &&
    transactions.every((t) => transactionStore.selectedIds.has(t.id));

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      transactionStore.clearSelection();
    } else {
      for (const txn of transactions) {
        if (!transactionStore.selectedIds.has(txn.id)) {
          transactionStore.toggleSelection(txn.id);
        }
      }
    }
  }, [allSelected, transactions, transactionStore]);

  // Grid template based on whether Account column is shown
  const gridCols = showAccountColumn
    ? 'grid-cols-[40px_100px_120px_1fr_1fr_1fr_100px_100px_40px]'
    : 'grid-cols-[40px_100px_1fr_1fr_1fr_100px_100px_40px]';

  return (
    <div className="flex flex-col" role="grid" aria-label="Transactions">
      {/* Header row */}
      <div
        className={`grid ${gridCols} gap-1 px-2 py-2 border-b border-zinc-700 bg-zinc-900 sticky top-0 z-10`}
        role="row"
      >
        <div className="flex items-center justify-center" role="columnheader">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={handleSelectAll}
            className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 cursor-pointer"
            aria-label="Select all transactions"
          />
        </div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide flex items-center" role="columnheader">
          Date <SortIcon direction="desc" />
        </div>
        {showAccountColumn && (
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide flex items-center" role="columnheader">
            Account <SortIcon direction={null} />
          </div>
        )}
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide flex items-center" role="columnheader">
          Payee <SortIcon direction={null} />
        </div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide flex items-center" role="columnheader">
          Category <SortIcon direction={null} />
        </div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide flex items-center" role="columnheader">
          Memo <SortIcon direction={null} />
        </div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide text-right flex items-center justify-end" role="columnheader">
          Amount <SortIcon direction={null} />
        </div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide text-right flex items-center justify-end" role="columnheader">
          Balance
        </div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide text-center" role="columnheader">
          C
        </div>
      </div>

      {/* Transaction rows */}
      {transactions.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-zinc-500 text-sm">
          No transactions found
        </div>
      ) : (
        transactions.map((txn, index) => (
          <TransactionRow
            key={txn.id}
            transaction={txn}
            balance={runningBalances[index]}
            selected={transactionStore.selectedIds.has(txn.id)}
            onToggleSelect={handleToggleSelect}
            showAccountColumn={showAccountColumn}
          />
        ))
      )}
    </div>
  );
});
