import { useState, useCallback, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import type { Transaction } from '@/types';
import { TransactionRow } from './TransactionRow';
import { GroupHeader } from './GroupHeader';
import { ContextMenu, type ContextMenuPosition } from './ContextMenu';
import { ChevronUp, ChevronDown, ChevronsUpDown, Layers } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

// --- Types ---

export type SortField = 'date' | 'payee' | 'category' | 'amount';
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
  | { type: 'header'; key: string; label: string; count: number; aggregate: number; cleared: number }
  | { type: 'row'; tx: Transaction; balance: number; txId: string };

// --- Constants ---

const ROW_HEIGHT = 36;
const BUFFER = 5;

// --- Props ---

interface TransactionTableProps {
  transactions: Transaction[];
  runningBalances: number[];
  showAccountColumn?: boolean;
  hideCategory?: boolean;
  hideBalance?: boolean;
  sortState: SortState;
  groupState: GroupState;
  onSortChange: (field: SortField, dir: SortDirection) => void;
  onGroupByChange: (mode: GroupByMode) => void;
  onToggleCollapse: (key: string) => void;
  onSelectGroup: (key: string) => void;
}

// --- Sort Icon ---

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (direction === 'asc') return <ChevronUp size={10} className="inline ml-0.5 text-zinc-200" />;
  if (direction === 'desc') return <ChevronDown size={10} className="inline ml-0.5 text-zinc-200" />;
  return <ChevronsUpDown size={10} className="inline ml-0.5 text-zinc-500" />;
}

// --- Main Component ---

export const TransactionTable = observer(function TransactionTable({
  transactions,
  runningBalances,
  showAccountColumn = false,
  hideCategory = false,
  hideBalance = false,
  sortState,
  groupState,
  onSortChange,
  onGroupByChange,
  onToggleCollapse,
  onSelectGroup,
}: TransactionTableProps) {
  const { transactionStore, payeeStore, categoryStore, accountStore, undoStore } = useStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  // Editing row tracking
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ position: ContextMenuPosition; tx: Transaction } | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [selectionAnchor, setSelectionAnchor] = useState(-1);

  // Group menu
  const [showGroupMenu, setShowGroupMenu] = useState(false);

  // --- Resize observer for container ---
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight);
    const observer = new ResizeObserver(() => {
      if (scrollContainerRef.current) {
        setContainerHeight(scrollContainerRef.current.clientHeight);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- Build virtual items ---
  const virtualItems: VirtualItem[] = (() => {
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
      const cleared = group.txns.filter(({ tx }) => tx.cleared === 1).length;
      items.push({ type: 'header', key, label: group.label, count: group.txns.length, aggregate, cleared });
      if (!groupState.collapsed.has(key)) {
        for (const { tx, balance } of group.txns) {
          items.push({ type: 'row', tx, balance, txId: tx.id });
        }
      }
    }
    return items;
  })();

  // --- Virtual scroll ---
  const totalHeight = virtualItems.length * ROW_HEIGHT;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
  const end = Math.min(virtualItems.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER);
  const visibleItems = virtualItems.slice(start, end);
  const offsetY = start * ROW_HEIGHT;

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      setScrollTop(el.scrollTop);
    }
  }, []);

  // --- Row IDs helper ---
  const getRowIds = useCallback(() => {
    return virtualItems.filter((i): i is VirtualItem & { type: 'row' } => i.type === 'row').map((i) => i.txId);
  }, [virtualItems]);

  // --- Selection handlers ---
  const handleRowSelect = useCallback((txId: string, e: React.MouseEvent) => {
    if (editingRowId) return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId); else next.add(txId);
      return next;
    });
  }, [editingRowId]);

  const handleCheckClick = useCallback((txId: string, _e: React.MouseEvent) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId); else next.add(txId);
      return next;
    });
  }, []);

  const handleRowHover = useCallback((txId: string) => {
    const rowIds = getRowIds();
    const idx = rowIds.indexOf(txId);
    if (idx >= 0) setFocusedIdx(idx);
  }, [getRowIds]);

  const handleSelectGroup = useCallback((groupKey: string) => {
    const ids: string[] = [];
    let inGroup = false;
    for (const item of virtualItems) {
      if (item.type === 'header') {
        inGroup = item.key === groupKey;
      } else if (inGroup) {
        ids.push(item.txId);
      }
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) { for (const id of ids) next.delete(id); }
      else { for (const id of ids) next.add(id); }
      return next;
    });
    onSelectGroup(groupKey);
  }, [virtualItems, onSelectGroup]);

  const selectAll = useCallback(() => {
    const ids = getRowIds();
    setSelectedIds(new Set(ids));
  }, [getRowIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionAnchor(-1);
  }, []);

  // --- Bulk operations ---
  const bulkDelete = useCallback(() => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} transaction${ids.length > 1 ? 's' : ''}?`)) return;

    const oldRecords: Transaction[] = [];
    for (const id of ids) {
      const r = transactionStore.getById(id);
      if (r) oldRecords.push({ ...r });
      transactionStore.deleteTransaction(id);
    }
    clearSelection();

    undoStore.push(
      `Deleted ${ids.length} transactions`,
      () => { for (const id of ids) transactionStore.deleteTransaction(id); },
      () => { for (const r of oldRecords) transactionStore.createTransaction(r); },
    );
  }, [selectedIds, transactionStore, undoStore, clearSelection]);

  const bulkSetCleared = useCallback((cleared: boolean) => {
    const ids = [...selectedIds];
    const val: 0 | 1 = cleared ? 1 : 0;
    for (const id of ids) {
      transactionStore.updateTransaction(id, { cleared: val });
    }
    clearSelection();
  }, [selectedIds, transactionStore, clearSelection]);

  // --- Context menu ---
  const handleContextMenu = useCallback((e: React.MouseEvent, tx: Transaction) => {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    setCtxMenu({ position: { x, y }, tx });
  }, []);

  const closeCtxMenu = useCallback(() => {
    setCtxMenu(null);
  }, []);

  const handleCtxEdit = useCallback((tx: Transaction) => {
    setEditingRowId(tx.id);
  }, []);

  // --- Column header click for sort / group ---
  const handleHeaderClick = useCallback((field: SortField, e: React.MouseEvent) => {
    if (e.shiftKey) {
      const fieldToGroup: Record<SortField, GroupByMode> = {
        date: 'month',
        payee: 'payee',
        category: 'category',
        amount: 'none',
      };
      onGroupByChange(fieldToGroup[field]);
    } else {
      if (sortState.field === field) {
        onSortChange(field, sortState.dir === 'asc' ? 'desc' : 'asc');
      } else {
        onSortChange(field, 'asc');
      }
    }
  }, [sortState, onSortChange, onGroupByChange]);

  const getSortDir = (field: SortField): SortDirection | null => {
    return sortState.field === field ? sortState.dir : null;
  };

  // --- Keyboard handler ---
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }
      if (e.key === 'Escape' && selectedIds.size > 0) {
        e.preventDefault();
        clearSelection();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        bulkDelete();
      }
      // Shift+Arrow: extend selection
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const rowIds = getRowIds();
        if (rowIds.length === 0) return;
        let idx = focusedIdx;
        if (idx < 0) idx = 0;
        const prevIdx = idx;
        if (e.key === 'ArrowDown' && idx < rowIds.length - 1) idx++;
        else if (e.key === 'ArrowUp' && idx > 0) idx--;
        setFocusedIdx(idx);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(rowIds[idx]) && prevIdx !== idx) {
            next.delete(rowIds[prevIdx]);
          } else {
            next.add(rowIds[idx]);
          }
          return next;
        });
      }
      // Plain Arrow: move focus, select single
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const rowIds = getRowIds();
        if (rowIds.length === 0) return;
        let idx = focusedIdx;
        if (idx < 0) idx = 0;
        else if (e.key === 'ArrowDown' && idx < rowIds.length - 1) idx++;
        else if (e.key === 'ArrowUp' && idx > 0) idx--;
        setFocusedIdx(idx);
        setSelectionAnchor(idx);
        setSelectedIds(new Set([rowIds[idx]]));
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [selectedIds, focusedIdx, selectAll, clearSelection, bulkDelete, getRowIds]);

  // --- Undo keyboard (Ctrl+Z / Ctrl+Shift+Z) ---
  useEffect(() => {
    function handleUndoKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoStore.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        undoStore.redo();
      }
    }
    document.addEventListener('keydown', handleUndoKey);
    return () => document.removeEventListener('keydown', handleUndoKey);
  }, [undoStore]);

  // Grid template
  const gridCols = showAccountColumn
    ? 'grid-cols-[32px_90px_110px_1fr_1fr_1fr_95px_95px_32px]'
    : 'grid-cols-[32px_90px_1fr_1fr_1fr_95px_95px_32px]';

  return (
    <div className="flex flex-col flex-1 min-h-0" role="grid" aria-label="Transactions">
      {/* Header row */}
      <div
        className={`grid ${gridCols} gap-1 px-2 py-2 border-b border-zinc-700 bg-zinc-900 sticky top-0 z-10`}
        role="row"
      >
        {/* Group menu toggle / select all */}
        <div className="flex items-center justify-center relative" role="columnheader">
          <span
            className={`cursor-pointer p-0.5 rounded hover:bg-zinc-700 ${groupState.groupBy !== 'none' ? 'text-blue-400' : 'text-zinc-500'}`}
            onClick={(e) => { e.stopPropagation(); setShowGroupMenu(!showGroupMenu); }}
            title="Group by..."
          >
            <Layers size={12} />
          </span>
          {showGroupMenu && (
            <div className="absolute top-full left-0 mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-lg py-1 min-w-[120px] z-50" onClick={(e) => e.stopPropagation()}>
              {(['none', 'month', 'date', 'payee', 'category', 'account'] as GroupByMode[]).map((mode) => (
                <div
                  key={mode}
                  className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-zinc-800 ${groupState.groupBy === mode ? 'text-blue-400' : 'text-zinc-300'}`}
                  onClick={() => { onGroupByChange(mode); setShowGroupMenu(false); }}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </div>
              ))}
            </div>
          )}
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

        {!hideCategory && (
          <div
            className="text-xs font-medium text-zinc-400 uppercase tracking-wide flex items-center cursor-pointer select-none"
            role="columnheader"
            onClick={(e) => handleHeaderClick('category', e)}
          >
            Category <SortIcon direction={getSortDir('category')} />
          </div>
        )}

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

        {!hideBalance && (
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide text-right flex items-center justify-end" role="columnheader">
            Balance
          </div>
        )}

        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide text-center" role="columnheader" title="Cleared">
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
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500 text-sm gap-2">
            <span>No transactions yet</span>
            <span className="text-zinc-600 text-xs">Click "+ Add transaction..." or press ⌘N to get started</span>
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleItems.map((item) => {
                if (item.type === 'header') {
                  return (
                    <GroupHeader
                      key={`hdr-${item.key}`}
                      label={item.label}
                      count={item.count}
                      aggregate={item.aggregate}
                      cleared={item.cleared}
                      collapsed={groupState.collapsed.has(item.key)}
                      onToggleCollapse={() => onToggleCollapse(item.key)}
                      onSelectGroup={() => handleSelectGroup(item.key)}
                      showAccountColumn={showAccountColumn}
                    />
                  );
                }
                return (
                  <TransactionRow
                    key={item.txId}
                    transaction={item.tx}
                    balance={item.balance}
                    selected={selectedIds.has(item.txId)}
                    showAccountColumn={showAccountColumn}
                    hideCategory={hideCategory}
                    hideBalance={hideBalance}
                    editingRowId={editingRowId}
                    onEditStart={setEditingRowId}
                    onEditEnd={() => setEditingRowId(null)}
                    onContextMenu={handleContextMenu}
                    onSelect={handleRowSelect}
                    onCheckClick={handleCheckClick}
                    onHover={handleRowHover}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          position={ctxMenu.position}
          transaction={ctxMenu.tx}
          selectedIds={selectedIds}
          onClose={closeCtxMenu}
          onEdit={handleCtxEdit}
          onBulkDelete={bulkDelete}
          onBulkClear={bulkSetCleared}
          onDeselectAll={clearSelection}
        />
      )}
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
      return { key: tx.payee_id || '_none', label: payee?.name ?? 'No payee' };
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
