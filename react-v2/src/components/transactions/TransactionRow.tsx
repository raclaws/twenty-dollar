import { useState, useCallback, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import { useStore } from '@/lib/store-context';
import { formatCurrency } from '@/lib/format';
import type { Transaction } from '@/types';
import { DatePicker, MemoCell, AmountInput } from './CellInputs';
import { PayeePicker } from '@/components/shared/PayeePicker';
import { CategoryPicker } from '@/components/shared/CategoryPicker';

type CellField = 'date' | 'payee' | 'category' | 'amount';

const FIELD_ORDER: CellField[] = ['date', 'payee', 'category', 'amount'];

interface TransactionRowProps {
  transaction: Transaction;
  balance: number;
  selected: boolean;
  showAccountColumn?: boolean;
  hideCategory?: boolean;
  hideBalance?: boolean;
  editingRowId: string | null;
  onEditStart: (id: string) => void;
  onEditEnd: () => void;
  onContextMenu: (e: React.MouseEvent, tx: Transaction) => void;
  onSelect: (txId: string, e: React.MouseEvent) => void;
  onCheckClick: (txId: string, e: React.MouseEvent) => void;
  onHover: (txId: string) => void;
}

export const TransactionRow = observer(function TransactionRow({
  transaction,
  balance,
  selected,
  showAccountColumn = false,
  hideCategory = false,
  hideBalance = false,
  editingRowId,
  onEditStart,
  onEditEnd,
  onContextMenu,
  onSelect,
  onCheckClick,
  onHover,
}: TransactionRowProps) {
  const { transactionStore, payeeStore, accountStore, categoryStore, undoStore } = useStore();
  const [activeCell, setActiveCell] = useState<CellField | null>(null);

  const payeeTriggerRef = useRef<HTMLDivElement>(null);
  const categoryTriggerRef = useRef<HTMLDivElement>(null);

  // --- Derived data ---
  const payee = payeeStore.getById(transaction.payee_id);
  const payeeName = payee?.name ?? '';
  const isTransfer = payee?.type === 'account';
  const account = accountStore.getById(transaction.account_id);
  const category = transaction.category_id ? categoryStore.getCategory(transaction.category_id) : null;
  const categoryName = category?.name ?? '';

  const isSystemPayee = payeeName === 'Starting Balance' || payeeName === 'Balance Adjustment' || payeeName === 'Import Carry';
  const isActive = editingRowId === transaction.id;

  // --- Cell editing ---
  function startCell(field: CellField, e?: React.MouseEvent) {
    if (field === 'category' && isTransfer) return;
    if (isSystemPayee && field !== 'amount') return;
    if (e) e.stopPropagation();
    onEditStart(transaction.id);
    setActiveCell(field);
  }

  function endCell() {
    setActiveCell(null);
    onEditEnd();
  }

  function advanceCell(current: CellField) {
    const idx = FIELD_ORDER.indexOf(current);
    let next = FIELD_ORDER[idx + 1];
    if (next === 'category' && isTransfer) next = FIELD_ORDER[idx + 2];
    if (next) {
      setActiveCell(next);
    } else {
      endCell();
    }
  }

  // --- Field commit with undo + transfer mirror ---
  const commitField = useCallback((field: string, newValue: unknown) => {
    if (newValue === (transaction as unknown as Record<string, unknown>)[field]) return;
    const id = transaction.id;
    const oldRecord = { ...transaction };
    const patch: Partial<Transaction> = { [field]: newValue } as Partial<Transaction>;

    // Mirror linked transaction for date/amount/memo
    const linkedId = transaction.linked_id;
    let linkedRecord: Transaction | undefined;
    if (linkedId && (field === 'date' || field === 'amount' || field === 'memo')) {
      linkedRecord = transactionStore.getById(linkedId);
    }

    // Optimistic update
    transactionStore.updateTransaction(id, patch);
    if (linkedRecord) {
      const mirrorValue = field === 'amount' ? -(newValue as number) : newValue;
      transactionStore.updateTransaction(linkedId!, { [field]: mirrorValue } as Partial<Transaction>);
    }

    undoStore.push(
      `Edited ${field}: ${payeeName || 'transaction'}`,
      () => {
        transactionStore.updateTransaction(id, patch);
        if (linkedRecord) {
          const mirrorValue = field === 'amount' ? -(newValue as number) : newValue;
          transactionStore.updateTransaction(linkedId!, { [field]: mirrorValue } as Partial<Transaction>);
        }
      },
      () => {
        transactionStore.updateTransaction(id, oldRecord);
        if (linkedRecord) {
          transactionStore.updateTransaction(linkedId!, linkedRecord);
        }
      },
    );
  }, [transaction, transactionStore, undoStore, payeeName]);

  // --- Payee commit with transfer semantics ---
  const commitPayee = useCallback((payeeId: string | null) => {
    if (payeeId === '__none__' || payeeId === null) {
      if (!transaction.payee_id) return;
      commitField('payee_id', '');
      return;
    }
    if (payeeId === transaction.payee_id) return;

    const id = transaction.id;
    const oldRecord = { ...transaction };

    const newPayee = payeeStore.getById(payeeId);
    const isNewTransfer = newPayee?.type === 'account';
    const wasTransfer = isTransfer;

    if (isNewTransfer && !wasTransfer) {
      // Convert to transfer: create mirror
      const destAccountId = newPayee!.account_id!;
      const sourcePayee = Array.from(payeeStore.items.values()).find(
        (p) => p.account_id === transaction.account_id
      );
      const mirrorId = crypto.randomUUID();
      const now = new Date().toISOString();

      const updatedPatch: Partial<Transaction> = { payee_id: payeeId, category_id: null, linked_id: mirrorId };
      const mirror: Transaction = {
        id: mirrorId,
        account_id: destAccountId,
        payee_id: sourcePayee?.id ?? '',
        category_id: null,
        date: transaction.date,
        amount: -transaction.amount,
        memo: transaction.memo,
        cleared: 0,
        reconciled_at: null,
        linked_id: id,
        created_at: now,
      };

      transactionStore.updateTransaction(id, updatedPatch);
      transactionStore.createTransaction(mirror);

      undoStore.push(
        `Converted to transfer → ${newPayee!.name}`,
        () => {
          transactionStore.updateTransaction(id, updatedPatch);
          transactionStore.createTransaction(mirror);
        },
        () => {
          transactionStore.updateTransaction(id, oldRecord);
          transactionStore.deleteTransaction(mirrorId);
        },
      );
    } else if (!isNewTransfer && wasTransfer) {
      // Convert from transfer: delete mirror
      const linkedId = transaction.linked_id;
      const oldLinked = linkedId ? transactionStore.getById(linkedId) : undefined;
      const updatedPatch: Partial<Transaction> = { payee_id: payeeId, linked_id: null };

      transactionStore.updateTransaction(id, updatedPatch);
      if (oldLinked && linkedId) transactionStore.deleteTransaction(linkedId);

      undoStore.push(
        `Converted from transfer to ${newPayee?.name ?? 'payee'}`,
        () => {
          transactionStore.updateTransaction(id, updatedPatch);
          if (oldLinked && linkedId) transactionStore.deleteTransaction(linkedId);
        },
        () => {
          transactionStore.updateTransaction(id, oldRecord);
          if (oldLinked) transactionStore.createTransaction(oldLinked);
        },
      );
    } else {
      // Simple payee change
      commitField('payee_id', payeeId);
    }
  }, [transaction, transactionStore, payeeStore, undoStore, isTransfer, commitField]);

  // --- Cleared toggle ---
  const handleToggleCleared = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const id = transaction.id;
    const oldCleared = transaction.cleared;
    const newCleared: 0 | 1 = oldCleared ? 0 : 1;
    transactionStore.updateTransaction(id, { cleared: newCleared });
    undoStore.push(
      `Toggle cleared: ${payeeName || 'transaction'}`,
      () => transactionStore.updateTransaction(id, { cleared: newCleared }),
      () => transactionStore.updateTransaction(id, { cleared: oldCleared }),
    );
  }, [transaction, transactionStore, undoStore, payeeName]);

  // --- Styles ---
  const rowBg = selected ? 'bg-blue-900/20' : 'hover:bg-zinc-800/50';
  const gridCols = showAccountColumn
    ? 'grid-cols-[32px_90px_110px_1fr_1fr_1fr_95px_95px_32px]'
    : 'grid-cols-[32px_90px_1fr_1fr_1fr_95px_95px_32px]';

  const amountColor = transaction.amount >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div
      className={`grid ${gridCols} gap-1 px-2 items-center border-b border-zinc-800/50 transition-colors ${rowBg}`}
      style={{ height: 36 }}
      role="row"
      onContextMenu={(e) => onContextMenu(e, transaction)}
      onClick={(e) => { if (!activeCell) onSelect(transaction.id, e); }}
      onMouseEnter={() => onHover(transaction.id)}
    >
      {/* Checkbox */}
      <div className="flex items-center justify-center" role="gridcell">
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => { e.stopPropagation(); onCheckClick(transaction.id, e as unknown as React.MouseEvent); }}
          onChange={() => {}}
          className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 cursor-pointer"
          aria-label={`Select ${payeeName}`}
        />
      </div>

      {/* Date */}
      <div
        className="font-[JetBrains_Mono] text-sm text-zinc-300"
        role="gridcell"
        onClick={(e) => startCell('date', e)}
      >
        {activeCell === 'date' && isActive ? (
          <DatePicker
            value={transaction.date}
            onCommit={(v) => { if (v && v !== transaction.date) commitField('date', v); advanceCell('date'); }}
            onCancel={endCell}
          />
        ) : (
          <span className="cursor-pointer truncate block px-1 py-0.5 rounded hover:bg-zinc-700/50">
            {transaction.date}
            {transaction.schedule_id && (
              <span className="ml-1 text-zinc-500 text-[10px]" title="Recurring">↻</span>
            )}
          </span>
        )}
      </div>

      {/* Account (optional) */}
      {showAccountColumn && (
        <div className="text-sm text-zinc-400 font-[Figtree] truncate" role="gridcell">
          {account?.name ?? ''}
        </div>
      )}

      {/* Payee */}
      <div
        className="text-sm text-zinc-200 font-[Figtree] relative"
        role="gridcell"
        ref={payeeTriggerRef}
        onClick={(e) => startCell('payee', e)}
      >
        {activeCell === 'payee' && isActive ? (
          <PayeePicker
            value={transaction.payee_id || null}
            onPick={(pid) => { commitPayee(pid); advanceCell('payee'); }}
            onCancel={endCell}
            onTab={() => advanceCell('payee')}
            triggerRef={payeeTriggerRef}
          />
        ) : (
          <span className="cursor-pointer truncate block px-1.5 py-0.5 rounded hover:bg-zinc-700/50">
            {payeeName || <span className="text-zinc-600">Payee</span>}
          </span>
        )}
      </div>

      {/* Category */}
      {!hideCategory && (
        <div
          className="text-sm text-zinc-400 font-[Figtree] relative"
          role="gridcell"
          ref={categoryTriggerRef}
          onClick={(e) => startCell('category', e)}
        >
          {isTransfer ? (
            <span className="text-zinc-500 italic px-1.5 py-0.5">Transfer</span>
          ) : activeCell === 'category' && isActive ? (
            <CategoryPicker
              value={transaction.category_id}
              onPick={(catId) => {
                const nv = catId === '__none__' ? null : (catId || null);
                if (nv !== (transaction.category_id ?? null)) commitField('category_id', nv);
                advanceCell('category');
              }}
              onCancel={endCell}
              onTab={() => advanceCell('category')}
              triggerRef={categoryTriggerRef}
            />
          ) : (
            <span className="cursor-pointer truncate block px-1.5 py-0.5 rounded hover:bg-zinc-700/50">
              {categoryName || <span className="text-zinc-600">Category</span>}
            </span>
          )}
        </div>
      )}

      {/* Memo */}
      <div className="text-sm" role="gridcell">
        <MemoCell
          value={transaction.memo ?? ''}
          onCommit={(v) => {
            const nv = v.trim() || null;
            if (nv !== (transaction.memo ?? null)) commitField('memo', nv);
          }}
        />
      </div>

      {/* Amount */}
      <div
        className={`text-sm font-[JetBrains_Mono] text-right ${amountColor}`}
        role="gridcell"
        onClick={(e) => startCell('amount', e)}
      >
        {activeCell === 'amount' && isActive ? (
          <AmountInput
            amount={transaction.amount}
            onCommit={(newAmt) => { if (newAmt !== transaction.amount) commitField('amount', newAmt); endCell(); }}
            onCancel={endCell}
          />
        ) : (
          <span className="cursor-pointer block px-1 py-0.5 rounded hover:bg-zinc-700/50">
            {formatCurrency(transaction.amount)}
          </span>
        )}
      </div>

      {/* Balance */}
      {!hideBalance && (
        <div className="text-sm font-[JetBrains_Mono] text-right text-zinc-400" role="gridcell">
          {formatCurrency(balance)}
        </div>
      )}

      {/* Cleared status */}
      <div className="flex items-center justify-center" role="gridcell" onClick={handleToggleCleared}>
        <span
          className={`w-3 h-3 rounded-full border cursor-pointer transition-colors ${
            transaction.reconciled_at
              ? 'bg-purple-500 border-purple-400'
              : transaction.cleared === 1
              ? 'bg-emerald-500 border-emerald-400'
              : 'border-zinc-600 hover:border-zinc-400'
          }`}
          title={transaction.reconciled_at ? 'Reconciled' : transaction.cleared === 1 ? 'Cleared' : 'Uncleared'}
        />
      </div>
    </div>
  );
});
