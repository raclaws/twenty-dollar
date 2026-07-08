import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { toast } from 'sonner';
import type { Account } from '@/types';
import { Archive, RotateCcw, CheckCheck } from 'lucide-react';

interface AccountActionsProps {
  account: Account;
}

export const AccountActions = observer(function AccountActions({ account }: AccountActionsProps) {
  const { accountStore, transactionStore } = useStore();

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    const previousState = { ...account };
    accountStore.updateAccount(account.id, { deleted_at: new Date().toISOString() });
    toast('Account closed', {
      description: account.name,
      action: {
        label: 'Undo',
        onClick: () => {
          accountStore.updateAccount(account.id, { deleted_at: previousState.deleted_at });
        },
      },
    });
  };

  const handleReopen = (e: React.MouseEvent) => {
    e.stopPropagation();
    accountStore.updateAccount(account.id, { deleted_at: null });
    toast('Account reopened', { description: account.name });
  };

  const handleReconcile = (e: React.MouseEvent) => {
    e.stopPropagation();
    const uncleared = transactionStore
      .transactionsForAccount(account.id)
      .filter((t) => t.cleared === 0);

    if (uncleared.length === 0) {
      toast('Nothing to reconcile', { description: 'All transactions are already cleared.' });
      return;
    }

    const ids = uncleared.map((t) => t.id);
    transactionStore.bulkAction('clear', ids);
    toast('Reconciled', {
      description: `Cleared ${uncleared.length} transaction${uncleared.length === 1 ? '' : 's'}.`,
    });
  };

  if (account.deleted_at) {
    return (
      <button
        onClick={handleReopen}
        className="p-1.5 text-zinc-500 hover:text-green-400 transition-colors"
        title="Reopen account"
      >
        <RotateCcw size={14} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleReconcile}
        className="p-1.5 text-zinc-500 hover:text-indigo-400 transition-colors"
        title="Reconcile"
      >
        <CheckCheck size={14} />
      </button>
      <button
        onClick={handleClose}
        className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
        title="Close account"
      >
        <Archive size={14} />
      </button>
    </div>
  );
});
