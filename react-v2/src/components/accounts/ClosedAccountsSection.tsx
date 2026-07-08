import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { formatCurrency } from '@/lib/format';
import { AccountActions } from './AccountActions';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const ClosedAccountsSection = observer(function ClosedAccountsSection() {
  const { accountStore, transactionStore } = useStore();
  const [expanded, setExpanded] = useState(false);

  const closedAccounts = Array.from(accountStore.accounts.values())
    .filter((a) => a.deleted_at !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (closedAccounts.length === 0) return null;

  return (
    <div className="mt-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Closed Accounts ({closedAccounts.length})
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {closedAccounts.map((account) => {
            const balance = transactionStore
              .transactionsForAccount(account.id)
              .reduce((sum, t) => sum + t.amount, 0);

            return (
              <div
                key={account.id}
                className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800 p-3 opacity-60"
              >
                <div>
                  <div className="text-sm text-zinc-400">{account.name}</div>
                  <div className="text-xs text-zinc-600">{account.type}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-zinc-500">
                    {formatCurrency(balance)}
                  </span>
                  <AccountActions account={account} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
