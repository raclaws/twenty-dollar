import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { parseCurrencyToCents } from '@/lib/format';
import type { AccountType } from '@/types';
import { X } from 'lucide-react';

interface CreateAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

const accountTypes: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit', label: 'Credit' },
];

export const CreateAccountDialog = observer(function CreateAccountDialog({
  open,
  onClose,
}: CreateAccountDialogProps) {
  const { accountStore, transactionStore } = useStore();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [startingBalance, setStartingBalance] = useState('');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const accountId = crypto.randomUUID();
    const now = new Date().toISOString();
    const sortOrder = accountStore.sortedAccounts.length;

    accountStore.createAccount({
      id: accountId,
      name: name.trim(),
      type,
      sort_order: sortOrder,
      created_at: now,
      deleted_at: null,
    });

    // Create starting balance transaction if provided
    const cents = parseCurrencyToCents(startingBalance || '0');
    if (cents && cents !== 0) {
      transactionStore.createTransaction({
        id: crypto.randomUUID(),
        account_id: accountId,
        payee_id: '',
        category_id: null,
        date: now.slice(0, 10),
        amount: cents,
        memo: 'Starting Balance',
        cleared: 1,
        reconciled_at: null,
        linked_id: null,
        created_at: now,
      });
    }

    setName('');
    setType('checking');
    setStartingBalance('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-none w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium text-zinc-100">Create Account</h2>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-none px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              placeholder="e.g. Main Checking"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-none px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
            >
              {accountTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Starting Balance</label>
            <input
              type="text"
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-none px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              placeholder="$0.00"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-none hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});
