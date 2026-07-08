import { useState, useCallback, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { formatCurrency } from '@/lib/format';
import type { Transaction } from '@/types';
import { InlineEditCell } from './InlineEditCell';
import { ClearedIndicator } from './ClearedIndicator';
import { RunningBalance } from './RunningBalance';
import { PayeePicker } from '@/components/shared/PayeePicker';
import { CategoryPicker } from '@/components/shared/CategoryPicker';

interface TransactionRowProps {
  transaction: Transaction;
  balance: number;
  selected: boolean;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  showAccountColumn?: boolean;
}

type EditingField = 'date' | 'payee' | 'category' | 'memo' | 'amount' | null;

export const TransactionRow = observer(function TransactionRow({
  transaction,
  balance,
  selected,
  onToggleSelect,
  showAccountColumn = true,
}: TransactionRowProps) {
  const { transactionStore, payeeStore, accountStore, categoryStore } = useStore();
  const [editingField, setEditingField] = useState<EditingField>(null);

  const payeeTriggerRef = useRef<HTMLDivElement>(null);
  const categoryTriggerRef = useRef<HTMLDivElement>(null);

  const payee = payeeStore.getById(transaction.payee_id);
  const account = accountStore.getById(transaction.account_id);

  // Display transfer payee name
  let payeeName = payee?.name ?? transaction.payee_id ?? '';
  if (transaction.linked_id) {
    // Find the linked transaction's account
    const linkedTxn = transactionStore.getById(transaction.linked_id);
    if (linkedTxn) {
      const linkedAccount = accountStore.getById(linkedTxn.account_id);
      payeeName = `Transfer: ${linkedAccount?.name ?? 'Unknown'}`;
    }
  }

  // Find category name
  const category = transaction.category_id
    ? categoryStore.getCategory(transaction.category_id)
    : null;
  const categoryName = category?.name ?? '';

  const amountColor = transaction.amount >= 0 ? 'text-emerald-400' : 'text-red-400';

  const handleCommit = useCallback(
    (field: string, value: string) => {
      switch (field) {
        case 'date':
          if (value) transactionStore.updateTransaction(transaction.id, { date: value });
          break;
        case 'memo':
          transactionStore.updateTransaction(transaction.id, {
            memo: value || null,
          });
          break;
        case 'amount': {
          const cents = Math.round(parseFloat(value) * 100);
          if (!isNaN(cents)) {
            transactionStore.updateTransaction(transaction.id, { amount: cents });
          }
          break;
        }
      }
    },
    [transaction.id, transactionStore],
  );

  const handlePayeePick = useCallback(
    (payeeId: string | null) => {
      transactionStore.updateTransaction(transaction.id, { payee_id: payeeId ?? '' });
      setEditingField(null);
    },
    [transaction.id, transactionStore],
  );

  const handleCategoryPick = useCallback(
    (catId: string | null) => {
      transactionStore.updateTransaction(transaction.id, { category_id: catId });
      setEditingField(null);
    },
    [transaction.id, transactionStore],
  );

  const handleToggleCleared = useCallback(() => {
    transactionStore.updateTransaction(transaction.id, {
      cleared: transaction.cleared === 1 ? 0 : 1,
    });
  }, [transaction.id, transaction.cleared, transactionStore]);

  const handleCheckboxChange = useCallback(
    (e: React.MouseEvent) => {
      onToggleSelect(transaction.id, e.shiftKey);
    },
    [transaction.id, onToggleSelect],
  );

  const rowBg = selected ? 'bg-blue-900/20' : 'hover:bg-zinc-800/50';

  const gridCols = showAccountColumn
    ? 'grid-cols-[40px_100px_120px_1fr_1fr_1fr_100px_100px_40px]'
    : 'grid-cols-[40px_100px_1fr_1fr_1fr_100px_100px_40px]';

  return (
    <div
      className={`grid ${gridCols} gap-1 px-2 py-1 items-center border-b border-zinc-800/50 transition-colors ${rowBg}`}
      role="row"
    >
      {/* Checkbox */}
      <div className="flex items-center justify-center" role="gridcell">
        <input
          type="checkbox"
          checked={selected}
          onClick={handleCheckboxChange}
          onChange={() => {}}
          className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 cursor-pointer"
          aria-label={`Select transaction ${payeeName}`}
        />
      </div>

      {/* Date */}
      <div className="font-[JetBrains_Mono] text-sm text-zinc-300" role="gridcell">
        <InlineEditCell
          value={transaction.date}
          onCommit={(v) => handleCommit('date', v)}
          editing={editingField === 'date'}
          onStartEdit={() => setEditingField('date')}
          onCancelEdit={() => setEditingField(null)}
          type="date"
        />
      </div>

      {/* Account (conditional) */}
      {showAccountColumn && (
        <div className="text-sm text-zinc-400 font-[Figtree] truncate" role="gridcell">
          {account?.name ?? ''}
        </div>
      )}

      {/* Payee */}
      <div className="text-sm text-zinc-200 font-[Figtree]" role="gridcell" ref={payeeTriggerRef}>
        {editingField === 'payee' ? (
          <PayeePicker
            value={transaction.payee_id || null}
            onPick={handlePayeePick}
            onCancel={() => setEditingField(null)}
            onTab={() => {
              setEditingField('category');
            }}
            triggerRef={payeeTriggerRef}
          />
        ) : (
          <span
            onClick={() => setEditingField('payee')}
            className="cursor-pointer truncate block px-1.5 py-0.5 rounded hover:bg-zinc-700/50"
          >
            {payeeName || <span className="text-zinc-600">Payee</span>}
          </span>
        )}
      </div>

      {/* Category */}
      <div className="text-sm text-zinc-400 font-[Figtree]" role="gridcell" ref={categoryTriggerRef}>
        {editingField === 'category' ? (
          <CategoryPicker
            value={transaction.category_id}
            onPick={handleCategoryPick}
            onCancel={() => setEditingField(null)}
            onTab={() => {
              setEditingField('memo');
            }}
            triggerRef={categoryTriggerRef}
          />
        ) : (
          <span
            onClick={() => setEditingField('category')}
            className="cursor-pointer truncate block px-1.5 py-0.5 rounded hover:bg-zinc-700/50"
          >
            {categoryName || <span className="text-zinc-600">Category</span>}
          </span>
        )}
      </div>

      {/* Memo */}
      <div className="text-sm text-zinc-500 font-[Figtree]" role="gridcell">
        <InlineEditCell
          value={transaction.memo ?? ''}
          onCommit={(v) => handleCommit('memo', v)}
          editing={editingField === 'memo'}
          onStartEdit={() => setEditingField('memo')}
          onCancelEdit={() => setEditingField(null)}
          placeholder="Memo"
        />
      </div>

      {/* Amount */}
      <div className={`text-sm font-[JetBrains_Mono] text-right ${amountColor}`} role="gridcell">
        <InlineEditCell
          value={(transaction.amount / 100).toFixed(2)}
          onCommit={(v) => handleCommit('amount', v)}
          editing={editingField === 'amount'}
          onStartEdit={() => setEditingField('amount')}
          onCancelEdit={() => setEditingField(null)}
          className="text-right"
          inputClassName="text-right font-[JetBrains_Mono]"
        />
      </div>

      {/* Running Balance */}
      <div className="text-right" role="gridcell">
        <RunningBalance balance={balance} />
      </div>

      {/* Cleared */}
      <div className="flex items-center justify-center" role="gridcell">
        <ClearedIndicator
          cleared={transaction.cleared}
          onToggle={handleToggleCleared}
        />
      </div>
    </div>
  );
});
