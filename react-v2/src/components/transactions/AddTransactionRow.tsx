import { useState, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import type { Transaction } from '@/types';
import { PayeePicker } from '@/components/shared/PayeePicker';
import { CategoryPicker } from '@/components/shared/CategoryPicker';
import { AccountPicker } from '@/components/shared/AccountPicker';

interface AddTransactionRowProps {
  accountId: string | null;
}

export const AddTransactionRow = observer(function AddTransactionRow({
  accountId,
}: AddTransactionRowProps) {
  const { transactionStore, accountStore, payeeStore, categoryStore } = useStore();
  const accounts = accountStore.sortedAccounts;

  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const [amount, setAmount] = useState('');
  const [account, setAccount] = useState(accountId ?? accounts[0]?.id ?? '');
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const [showPayeePicker, setShowPayeePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const dateRef = useRef<HTMLInputElement>(null);
  const payeeTriggerRef = useRef<HTMLDivElement>(null);
  const categoryTriggerRef = useRef<HTMLDivElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setPayeeId(null);
    setCategoryId(null);
    setMemo('');
    setAmount('');
    setErrors({});
    dateRef.current?.focus();
  };

  const validate = (): boolean => {
    const newErrors: Record<string, boolean> = {};
    const selectedAccount = accountId ?? account;
    if (!selectedAccount) newErrors.account = true;
    if (!date) newErrors.date = true;
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountCents) || amount.trim() === '') newErrors.amount = true;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) {
      toast.error('Account, date, and amount are required.');
      return;
    }

    const amountCents = Math.round(parseFloat(amount) * 100);
    const selectedAccount = accountId ?? account;

    const txn: Transaction = {
      id: crypto.randomUUID(),
      account_id: selectedAccount,
      payee_id: payeeId ?? '',
      category_id: categoryId,
      date,
      amount: amountCents,
      memo: memo || null,
      cleared: 0,
      reconciled_at: null,
      linked_id: null,
      created_at: new Date().toISOString(),
    };

    transactionStore.createTransaction(txn);
    toast.success('Transaction added');
    reset();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const inputClass = (field?: string) =>
    `bg-zinc-800 text-zinc-200 text-sm px-1.5 py-1 rounded border outline-none focus:border-blue-500 w-full ${
      field && errors[field] ? 'border-red-500' : 'border-zinc-700'
    }`;

  // Resolve display names
  const payeeName = payeeId ? (payeeStore.getById(payeeId)?.name ?? '') : '';
  const categoryName = categoryId ? (categoryStore.getCategory(categoryId)?.name ?? '') : '';

  return (
    <div className="grid grid-cols-[40px_100px_1fr_1fr_1fr_100px_40px_100px] gap-1 px-2 py-2 bg-zinc-900/60 border-b-2 border-indigo-500/30 items-center">
      {/* Add button */}
      <button
        onClick={handleSubmit}
        className="flex items-center justify-center w-7 h-7 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        title="Add transaction"
        aria-label="Add transaction"
      >
        <Plus size={14} />
      </button>

      {/* Date */}
      <input
        ref={dateRef}
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        onKeyDown={handleKeyDown}
        className={inputClass('date')}
      />

      {/* Payee */}
      <div className="relative" ref={payeeTriggerRef}>
        <div
          onClick={() => setShowPayeePicker(true)}
          className={`${inputClass()} cursor-pointer truncate min-h-[28px] flex items-center`}
        >
          {payeeName || <span className="text-zinc-500">Payee</span>}
        </div>
        {showPayeePicker && (
          <PayeePicker
            value={payeeId}
            onPick={(id) => {
              setPayeeId(id);
              setShowPayeePicker(false);
            }}
            onCancel={() => setShowPayeePicker(false)}
            onTab={() => {
              setShowPayeePicker(false);
              setShowCategoryPicker(true);
            }}
            triggerRef={payeeTriggerRef}
          />
        )}
      </div>

      {/* Category */}
      <div className="relative" ref={categoryTriggerRef}>
        <div
          onClick={() => setShowCategoryPicker(true)}
          className={`${inputClass()} cursor-pointer truncate min-h-[28px] flex items-center`}
        >
          {categoryName || <span className="text-zinc-500">Category</span>}
        </div>
        {showCategoryPicker && (
          <CategoryPicker
            value={categoryId}
            onPick={(id) => {
              setCategoryId(id);
              setShowCategoryPicker(false);
            }}
            onCancel={() => setShowCategoryPicker(false)}
            onTab={() => {
              setShowCategoryPicker(false);
              memoRef.current?.focus();
            }}
            triggerRef={categoryTriggerRef}
          />
        )}
      </div>

      {/* Memo */}
      <input
        ref={memoRef}
        type="text"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Memo"
        className={inputClass()}
      />

      {/* Amount */}
      <input
        type="text"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="0.00"
        className={`${inputClass('amount')} font-[JetBrains_Mono] text-right`}
      />

      {/* Cleared placeholder */}
      <div />

      {/* Account selector (shown when no account filter) */}
      {!accountId ? (
        <AccountPicker
          value={account}
          onChange={setAccount}
          accounts={accounts}
          className={errors.account ? 'border-red-500' : ''}
        />
      ) : (
        <div />
      )}
    </div>
  );
});
