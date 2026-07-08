import { useState, useCallback, useRef, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import type { Transaction } from '@/types';
import { TransactionRow } from './TransactionRow';
import { GroupHeader } from './GroupHeader';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

// --- Types ---

export type SortField = 'date' | 'payee' | 'category' | 'amount' | null;
export type SortDirection = 'asc' | 'desc';
export type GroupByMode = 'none' | 'month' | 'date' | 'payee' | 'category' | 'account';

export interface SortState {
  field: SortField;
  dir: SortDirection;
}

export interface GroupState {
  groupBy: GroupByMode;
  collapsed: Set<string>;
}

type VirtualItem =
  | { type: 'header'; key: string; label: string; count: number; aggregate: number }
  | { type: 'row'; tx: Transaction; balance: number; txId: string };

// --- Constants ---

const ROW_HEIGHT = 36;
const BUFFER = 5;

// --- Props ---

interface TransactionTableProps {
  transactions: Transaction[];
  runningBalances: number[];
  showAccountColumn?: boolean;
  sortState: SortState;
  groupState: GroupState;
  onSortChange: (field: SortField, dir: SortDirection | null) => void;
  onGroupByChange: (mode: GroupByMode) => void;
  onToggleCollapse: (key: string) => void;
}

// --- Sort Icon ---

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (direction === 'asc') return <ChevronUp size={12} className="inline ml-0.5 text-zinc-200" />;
  if (direction === 'desc') return <ChevronDown size={12} className="inline ml-0.5 text-zinc-200" />;
  return <ChevronsUpDown size={12} className="inline ml-0.5 text-zinc-500" />;
}

// --- Main Component ---

export const TransactionTable = observer(function TransactionTable({
  transactions,
  runningBalances,
  showAccountColumn = true,
  sortState,
  groupState,
  onSortChange,
  onGroupByChange,
  onToggleCollapse,
}: TransactionTableProps) {
  const { transactionStore, payeeStore, categoryStore, accountStore } = useStore();
  const lastSelectedIndex = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(800);

  // --- Build virtual items (grouped or flat) ---
  const virtualItems = useMemo((): VirtualItem[] => {
    if (groupState.groupBy === 'none') {
      return transactions.map((tx, idx) => ({
        type: 'row' as const,
        tx,
        balance: runningBalances[idx],
        txId: tx.id,
      }));
    }

    // Group transactions
    const groups = new Map<string, { label: string; txns: { tx: Transaction; balance: number }[] }>();
    const groupOrder: string[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const { key, label } = getGroupKeyLabel(tx, groupState.groupBy, payeeStore, categoryStore, accountStore);
      if (!groups.has(key)) {
        groups.set(key, { label, txns: [] });
        groupOrder.push(key);
      }
      groups.get(key)!.txns.push({ tx, balance: runningBalances[i] });
    }

    const items: VirtualItem[] = [];
    for (const key of groupOrder) {
      const group = groups.get(key)!;
      const aggregate = group.txns.reduce((sum, { tx }) => sum + tx.amount, 0);
      items.push({
        type: 'header',
        key,
        label: group.label,
        count: group.txns.length,
        aggregate,
      });
      if (!groupState.collapsed.has(key)) {
        for (const { tx, balance } of group.txns) {
          items.push({ type: 'row', tx, balance, txId: tx.id });
        }
      }
    }
    return items;
  }, [transactions, runningBalances, groupState.groupBy, groupState.collapsed, payeeStore, categoryStore, accountStore]);

  // --- Virtual scroll computation ---
  const totalHeight = virtualItems.length * ROW_HEIGHT;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
  const end = Math.min(virtualItems.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER);
  const visibleItems = virtualItems.slice(start, end);
  const offsetY = start * ROW_HEIGHT;

  // --- Scroll handler ---
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      setScrollTop(el.scrollTop);
      if (el.clientHeight !== containerHeight) {
        setContainerHeight(el.clientHeight);
      }
    }
  }, [containerHeight]);

  // --- Selection ---
  const handleToggleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      // Find index in flat transaction list for range selection
      const allRows = virtualItems.filter((item): item is VirtualItem & { type: 'row' } => item.type === 'row');
      if (shiftKey && lastSelectedIndex.current !== null) {
        const currentIndex = allRows.findIndex((item) => item.txId === id);
        if (currentIndex === -1) return;
        const startIdx = Math.min(lastSelectedIndex.current, currentIndex);
        const endIdx = Math.max(lastSelectedIndex.current, currentIndex);
        for (let i = startIdx; i <= endIdx; i++) {
          if (!transactionStore.selectedIds.has(allRows[i].txId)) {
            transactionStore.toggleSelection(allRows[i].txId);
          }
        }
        lastSelectedIndex.current = currentIndex;
      } else {
        transactionStore.toggleSelection(id);
        lastSelectedIndex.current = allRows.findIndex((item) => item.txId === id);
      }
    },
    [virtualItems, transactionStore],
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

  // --- Column header click for sort / group ---
  const handleHeaderClick = useCallback(
    (field: SortField, e: React.MouseEvent) => {
      if (!field) return;
      if (e.shiftKey) {
        // Shift+click → group by
        const fieldToGroup: Record<string, GroupByMode> = {
          date: 'date',
          payee: 'payee',
          category: 'category',
          amount: 'none',
        };
        onGroupByChange(fieldToGroup[field] ?? 'none');
      } else {
        // Normal click → sort
        if (sortState.field === field) {
          if (sortState.dir === 'asc') {
            // Third click: remove sort
            onSortChange(null, null);
          } else {
            // desc → asc
            onSortChange(field, 'asc');
          }
        } else {
          // New field, default desc
          onSortChange(field, 'desc');
        }
      }
    },
    [sortState, onSortChange, onGroupByChange],
  );

  const getSortDir = (field: SortField): SortDirection | null => {
    return sortState.field === field ? sortState.dir : null;
  };

  // Grid template based on whether Account column is shown
  const gridCols = showAccountColumn
    ? 'grid-cols-[40px_100px_120px_1fr_1fr_1fr_100px_100px_40px]'
    : 'grid-cols-[40px_100px_1fr_1fr_1fr_100px_100px_40px]';

  return (
    <div className="flex flex-col h-full" role="grid" aria-label="Transactions">
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
        <div
          className="text-xs font-medium text-zinc-400 uppercase tracking-wide flex items-center cursor-pointer select-none"
          role="columnheader"
          onClick={(e) => handleHeaderClick('date', e)}
        >
          Date <SortIcon direction={getSortDir('date')} />
        </div>
        {showAccountColumn && (
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide flex items-center" role="columnheader">
            Account
          </div>
        )}
        <div
          className="text-xs font-medium text-zinc-400 uppercase tracking-wide flex items-center cursor-pointer select-none"
          role="columnheader"
          onClick={(e) => handleHeaderClick('payee', e)}
        >
          Payee <SortIcon direction={getSortDir('payee')} />
        </div>
        <div
          className="text-xs font-medium text-zinc-400 uppercase tracking-wide flex items-center cursor-pointer select-none"
          role="columnheader"
          onClick={(e) => handleHeaderClick('category', e)}
        >
          Category <SortIcon direction={getSortDir('category')} />
        </div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide flex items-center" role="columnheader">
          Memo
        </div>
        <div
          className="text-xs font-medium text-zinc-400 uppercase tracking-wide text-right flex items-center justify-end cursor-pointer select-none"
          role="columnheader"
          onClick={(e) => handleHeaderClick('amount', e)}
        >
          Amount <SortIcon direction={getSortDir('amount')} />
        </div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide text-right flex items-center justify-end" role="columnheader">
          Balance
        </div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide text-center" role="columnheader">
          C
        </div>
      </div>

      {/* Virtual scroll container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {virtualItems.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-zinc-500 text-sm">
            No transactions found
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleItems.map((item, i) => {
                if (item.type === 'header') {
                  return (
                    <GroupHeader
                      key={`hdr-${item.key}`}
                      label={item.label}
                      count={item.count}
                      aggregate={item.aggregate}
                      collapsed={groupState.collapsed.has(item.key)}
                      onToggleCollapse={() => onToggleCollapse(item.key)}
                      showAccountColumn={showAccountColumn}
                    />
                  );
                }
                return (
                  <TransactionRow
                    key={item.txId}
                    transaction={item.tx}
                    balance={item.balance}
                    selected={transactionStore.selectedIds.has(item.txId)}
                    onToggleSelect={handleToggleSelect}
                    showAccountColumn={showAccountColumn}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// --- Helper: group key/label extraction ---

function getGroupKeyLabel(
  tx: Transaction,
  groupBy: GroupByMode,
  payeeStore: { getById(id: string): { name: string } | undefined },
  categoryStore: { getCategory(id: string): { name: string } | undefined | null },
  accountStore: { getById(id: string): { name: string } | undefined },
): { key: string; label: string } {
  switch (groupBy) {
    case 'month': {
      const key = tx.date.slice(0, 7);
      const [year, m] = key.split('-');
      const date = new Date(parseInt(year), parseInt(m) - 1, 1);
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return { key, label };
    }
    case 'date':
      return { key: tx.date, label: tx.date };
    case 'payee': {
      const payee = payeeStore.getById(tx.payee_id);
      return { key: tx.payee_id || '_none', label: payee?.name ?? 'Unknown' };
    }
    case 'category': {
      const cat = tx.category_id ? categoryStore.getCategory(tx.category_id) : null;
      return { key: tx.category_id || '_uncategorized', label: cat?.name ?? 'Uncategorized' };
    }
    case 'account': {
      const acc = accountStore.getById(tx.account_id);
      return { key: tx.account_id, label: acc?.name ?? 'Unknown' };
    }
    default:
      return { key: '_all', label: 'All' };
  }
}
