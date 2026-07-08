import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { useNavigate } from '@tanstack/react-router';
import { AccountCard } from './AccountCard';
import { AccountActions } from './AccountActions';
import { CreateAccountDialog } from './CreateAccountDialog';
import { ClosedAccountsSection } from './ClosedAccountsSection';
import { Plus } from 'lucide-react';

export const AccountsPage = observer(function AccountsPage() {
  const { accountStore } = useStore();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  const accounts = accountStore.sortedAccounts;

  const handleCardClick = (accountId: string) => {
    void navigate({ to: '/transactions', search: { account: accountId } });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-xl font-medium text-zinc-100">Accounts</h1>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-none hover:bg-indigo-500 transition-colors"
        >
          <Plus size={14} />
          Add Account
        </button>
      </div>

      {/* Account list */}
      <div className="flex-1 overflow-y-auto p-6">
        {accounts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm">No accounts yet.</p>
            <button
              onClick={() => setDialogOpen(true)}
              className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Create your first account
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <AccountCard
                    account={account}
                    onClick={() => handleCardClick(account.id)}
                  />
                </div>
                <AccountActions account={account} />
              </div>
            ))}
          </div>
        )}

        <ClosedAccountsSection />
      </div>

      {/* Create dialog */}
      <CreateAccountDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
});
