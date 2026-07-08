import { useState, useCallback, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { parseCurrencyToCents, formatCurrency } from '@/lib/format';
import type { Transaction, SplitEntry } from '@/types';
import { PayeePicker } from '@/components/shared/PayeePicker';
import { CategoryPicker } from '@/components/shared/CategoryPicker';
import { Plus, Minus } from 'lucide-react';

interface SplitLine {
  categoryId: string;
  amount: string;
  memo: string;
}

interface AddTransactionRowProps {
  accountId: string | null;
}

export const AddTransactionRow = observer(function AddTransactionRow({
  accountId,
}: AddTransactionRowProps) {
  const { transactionStore, accountStore, payeeStore, categoryStore, undoStore } = useStore();

  const [isOpen, setIsOpen] = useState(false);
  const [addMore, setAddMore] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [showPayeePicker, setShowPayeePicker] = useState(false);
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [isOutflow, setIsOutflow] = useState(true);
  const [isCleared, setIsCleared] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const [splits, setSplits] = useState<SplitLine[]>([{ categoryId: '', amount: '', memo: '' }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const payeeTriggerRef = useRef<HTMLDivElement>(null);
  const categoryTriggerRef = useRef<HTMLDivElement>(null);
  let pickerJustClosed = false;

  // Derived
  const payeeName = payeeId ? (payeeStore.getById(payeeId)?.name ?? '') : '';
  const categoryName = categoryId ? (categoryStore.getCategory(categoryId)?.name ?? '') : '';
  const isTransferPayee = payeeId ? (payeeStore.getById(payeeId)?.type === 'account') : false;

  function openDialog() {
    setIsOpen(true);
  }

  function closeDialog() {
    setIsOpen(false);
    resetAll();
  }

  function resetAll() {
    setDate(new Date().toISOString().slice(0, 10));
    setPayeeId(null);
    setShowPayeePicker(false);
    setCategoryId(null);
    setShowCatPicker(false);
    setMemo('');
    setAmountInput('');
    setIsOutflow(true);
    setIsCleared(false);
    setIsSplit(false);
    setSplits([{ categoryId: '', amount: '', memo: '' }]);
    setErrors({});
  }

  function resetForAddMore() {
    setPayeeId(null);
    setShowPayeePicker(false);
    setCategoryId(null);
    setShowCatPicker(false);
    setMemo('');
    setAmountInput('');
    setIsOutflow(true);
    setIsCleared(false);
    setIsSplit(false);
    setSplits([{ categoryId: '', amount: '', memo: '' }]);
    setErrors({});
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!date) errs.date = 'Date is required';
    if (!amountInput.trim()) errs.amount = 'Amount is required';
    else {
      const parsed = parseCurrencyToCents(amountInput);
      if (parsed === null) errs.amount = 'Invalid number';
      else if (parsed === 0) errs.amount = 'Amount cannot be zero';
    }
    if (!accountId && accountStore.sortedAccounts.length === 0) {
      errs.account = 'No account available';
    }
    if (isSplit) {
      const total = splits.reduce((sum, s) => sum + (parseCurrencyToCents(s.amount) ?? 0), 0);
      const main = parseCurrencyToCents(amountInput) ?? 0;
      if (total !== main) errs.splits = `Split total must equal ${formatCurrency(Math.abs(main))}`;
      if (splits.some((s) => !s.categoryId)) errs.splits = 'All splits need a category';
      if (splits.some((s) => parseCurrencyToCents(s.amount) === null)) errs.splits = 'All splits need a valid amount';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function addSplitLine() {
    setSplits((s) => [...s, { categoryId: '', amount: '', memo: '' }]);
  }

  function removeSplitLine(index: number) {
    setSplits((s) => s.filter((_, i) => i !== index));
  }

  function updateSplit(index: number, field: keyof SplitLine, value: string) {
    setSplits((s) => s.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  }

  function handlePayeePick(pid: string | null) {
    if (pid === '__none__' || pid === null) {
      setPayeeId(null);
    } else {
      setPayeeId(pid);
    }
    setShowPayeePicker(false);
    setErrors({});
  }

  function handleCategoryPick(catId: string | null) {
    if (catId === '__none__' || catId === null) {
      setCategoryId(null);
    } else {
      setCategoryId(catId);
    }
    setShowCatPicker(false);
    setErrors({});
  }

  async function handleSubmit() {
    if (!validate()) return;

    const rawAmount = parseCurrencyToCents(amountInput)!;
    const amount = isOutflow ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const targetAccountId = accountId ?? accountStore.sortedAccounts[0]?.id ?? '';

    if (isTransferPayee && payeeId) {
      // Transfer: create source + mirror
      const destPayee = payeeStore.getById(payeeId);
      const destAccountId = destPayee?.account_id ?? '';
      const sourcePayee = Array.from(payeeStore.items.values()).find(
        (p) => p.account_id === targetAccountId
      );
      const mirrorId = crypto.randomUUID();

      const sourceTx: Transaction = {
        id,
        account_id: targetAccountId,
        payee_id: payeeId,
        category_id: null,
        date,
        amount,
        memo: memo || null,
        cleared: isCleared ? 1 : 0,
        reconciled_at: null,
        linked_id: mirrorId,
        created_at: now,
      };

      const mirrorTx: Transaction = {
        id: mirrorId,
        account_id: destAccountId,
        payee_id: sourcePayee?.id ?? '',
        category_id: null,
        date,
        amount: -amount,
        memo: memo || null,
        cleared: isCleared ? 1 : 0,
        reconciled_at: null,
        linked_id: id,
        created_at: now,
      };

      transactionStore.createTransaction(sourceTx);
      transactionStore.createTransaction(mirrorTx);

      undoStore.push(
        `Transfer ${formatCurrency(Math.abs(rawAmount))} to ${destPayee?.name ?? 'Unknown'}`,
        () => { transactionStore.createTransaction(sourceTx); transactionStore.createTransaction(mirrorTx); },
        () => { transactionStore.deleteTransaction(id); transactionStore.deleteTransaction(mirrorId); },
      );

      if (addMore) resetForAddMore(); else closeDialog();
      return;
    }

    // Normal transaction
    const txRecord: Transaction = {
      id,
      account_id: targetAccountId,
      payee_id: payeeId ?? '',
      category_id: isSplit ? null : (categoryId || null),
      date,
      amount,
      memo: memo || null,
      cleared: isCleared ? 1 : 0,
      reconciled_at: null,
      linked_id: null,
      created_at: now,
    };

    const splitRecords: SplitEntry[] = isSplit
      ? splits.map((s) => ({
          id: crypto.randomUUID(),
          transaction_id: id,
          category_id: s.categoryId,
          amount: parseCurrencyToCents(s.amount) ?? 0,
          memo: s.memo || null,
        }))
      : [];

    transactionStore.createTransaction(txRecord, splitRecords.length > 0 ? splitRecords : undefined);

    undoStore.push(
      `Added transaction: ${payeeName || 'Unknown'} ${formatCurrency(amount)}`,
      () => transactionStore.createTransaction(txRecord, splitRecords.length > 0 ? splitRecords : undefined),
      () => transactionStore.deleteTransaction(id),
    );

    if (addMore) resetForAddMore(); else closeDialog();
  }

  // Global keyboard shortcut: Ctrl+N opens, Escape closes
  useEffect(() => {
    function handleGlobalKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        if (!isOpen) openDialog();
      }
      if (e.key === 'Escape' && isOpen) {
        if (pickerJustClosed || showPayeePicker || showCatPicker) return;
        closeDialog();
      }
    }
    document.addEventListener('keydown', handleGlobalKeydown);
    return () => document.removeEventListener('keydown', handleGlobalKeydown);
  }, [isOpen, showPayeePicker, showCatPicker]);

  return (
    <>
      {/* Trigger row */}
      <div
        className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-zinc-800/50 border-b border-zinc-800 transition-colors"
        onClick={openDialog}
      >
        <span className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center">
          <Plus size={12} className="text-white" />
        </span>
        <span className="text-sm text-zinc-400">Add transaction...</span>
        <span className="ml-auto text-xs text-zinc-600">⌘N</span>
      </div>

      {/* Dialog overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeDialog}>
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Plus size={16} className="text-indigo-400" />
                <span className="text-sm font-medium text-zinc-200">New Transaction</span>
              </div>
              <button className="text-xs text-zinc-500 hover:text-zinc-300" onClick={closeDialog}>Esc</button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3">
              {/* Date */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-400 w-20">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setErrors((er) => { const { date: _, ...rest } = er; return rest; }); }}
                  className={`flex-1 bg-zinc-800 text-zinc-200 text-sm px-2 py-1.5 rounded border outline-none focus:border-blue-500 ${errors.date ? 'border-red-500' : 'border-zinc-700'}`}
                />
              </div>

              {/* Payee */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-400 w-20">Payee</label>
                <div className="flex-1 relative" ref={payeeTriggerRef}>
                  <div
                    onClick={() => setShowPayeePicker(true)}
                    className="bg-zinc-800 text-zinc-200 text-sm px-2 py-1.5 rounded border border-zinc-700 cursor-pointer truncate min-h-[32px] flex items-center"
                  >
                    {payeeName || <span className="text-zinc-500">Search or add payee...</span>}
                  </div>
                  {showPayeePicker && (
                    <PayeePicker
                      value={payeeId}
                      onPick={handlePayeePick}
                      onCancel={() => { pickerJustClosed = true; setShowPayeePicker(false); setTimeout(() => { pickerJustClosed = false; }, 50); }}
                      onTab={() => { setShowPayeePicker(false); setShowCatPicker(true); }}
                      triggerRef={payeeTriggerRef}
                    />
                  )}
                </div>
              </div>

              {/* Category */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-400 w-20">Category</label>
                {isSplit || isTransferPayee ? (
                  <div className="flex-1 bg-zinc-800 text-zinc-500 text-sm px-2 py-1.5 rounded border border-zinc-700 italic">
                    {isTransferPayee ? 'Transfer' : 'Split'}
                  </div>
                ) : (
                  <div className="flex-1 relative" ref={categoryTriggerRef}>
                    <div
                      onClick={() => setShowCatPicker(true)}
                      className="bg-zinc-800 text-zinc-200 text-sm px-2 py-1.5 rounded border border-zinc-700 cursor-pointer truncate min-h-[32px] flex items-center"
                    >
                      {categoryName || <span className="text-zinc-500">Select category...</span>}
                    </div>
                    {showCatPicker && (
                      <CategoryPicker
                        value={categoryId}
                        onPick={handleCategoryPick}
                        onCancel={() => { pickerJustClosed = true; setShowCatPicker(false); setTimeout(() => { pickerJustClosed = false; }, 50); }}
                        triggerRef={categoryTriggerRef}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Amount */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-400 w-20">Amount</label>
                <div className="flex-1 flex gap-2 items-center">
                  <div className="flex rounded overflow-hidden border border-zinc-700">
                    <button
                      className={`px-2 py-1 text-sm font-bold ${isOutflow ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}
                      onClick={() => setIsOutflow(true)}
                    >
                      −
                    </button>
                    <button
                      className={`px-2 py-1 text-sm font-bold ${!isOutflow ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}
                      onClick={() => setIsOutflow(false)}
                    >
                      +
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={amountInput}
                    onChange={(e) => { setAmountInput(e.target.value); setErrors((er) => { const { amount: _, ...rest } = er; return rest; }); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); } }}
                    className={`flex-1 bg-zinc-800 text-zinc-200 text-sm px-2 py-1.5 rounded border outline-none focus:border-blue-500 font-[JetBrains_Mono] text-right ${errors.amount ? 'border-red-500' : 'border-zinc-700'}`}
                  />
                </div>
              </div>

              {/* Memo */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-400 w-20">Memo</label>
                <input
                  type="text"
                  placeholder="Add a note..."
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); } }}
                  className="flex-1 bg-zinc-800 text-zinc-200 text-sm px-2 py-1.5 rounded border border-zinc-700 outline-none focus:border-blue-500"
                />
              </div>

              {/* Splits */}
              {isSplit && (
                <div className="pl-20 space-y-2">
                  {splits.map((line, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select
                        className="flex-1 bg-zinc-800 text-zinc-200 text-sm px-2 py-1 rounded border border-zinc-700"
                        value={line.categoryId}
                        onChange={(e) => updateSplit(i, 'categoryId', e.target.value)}
                      >
                        <option value="">Category...</option>
                        {Array.from(categoryStore.categoryItems.values()).map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={line.amount}
                        onChange={(e) => updateSplit(i, 'amount', e.target.value)}
                        className="w-24 bg-zinc-800 text-zinc-200 text-sm px-2 py-1 rounded border border-zinc-700 font-[JetBrains_Mono] text-right"
                      />
                      <input
                        type="text"
                        placeholder="Memo"
                        value={line.memo}
                        onChange={(e) => updateSplit(i, 'memo', e.target.value)}
                        className="w-24 bg-zinc-800 text-zinc-200 text-sm px-2 py-1 rounded border border-zinc-700"
                      />
                      <button className="text-zinc-500 hover:text-red-400 text-sm" onClick={() => removeSplitLine(i)}>×</button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={addSplitLine}>+ Add split</button>
                    {errors.splits && <span className="text-xs text-red-400">{errors.splits}</span>}
                  </div>
                </div>
              )}

              {/* Errors */}
              {(errors.amount || errors.date) && (
                <div className="pl-20 space-y-1">
                  {errors.date && <span className="text-xs text-red-400 block">{errors.date}</span>}
                  {errors.amount && <span className="text-xs text-red-400 block">{errors.amount}</span>}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800">
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center gap-1.5 cursor-pointer"
                  onClick={() => setIsCleared(!isCleared)}
                >
                  <span
                    className={`w-3 h-3 rounded-full border transition-colors ${isCleared ? 'bg-emerald-500 border-emerald-400' : 'border-zinc-600'}`}
                  />
                  <span className="text-xs text-zinc-400">Cleared</span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addMore}
                    onChange={(e) => setAddMore(e.target.checked)}
                    className="w-3 h-3 rounded border-zinc-600 bg-zinc-800"
                  />
                  <span className="text-xs text-zinc-400">Add more</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                {!isTransferPayee && (
                  <button
                    className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    onClick={() => setIsSplit(!isSplit)}
                  >
                    {isSplit ? 'Single' : 'Split'}
                  </button>
                )}
                <button
                  className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                  onClick={handleSubmit}
                >
                  Add ⌘Enter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
