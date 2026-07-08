import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { formatCurrency } from '@/lib/format';
import type { Account, AccountType } from '@/types';
import { Landmark, PiggyBank, Banknote, CreditCard } from 'lucide-react';

const typeConfig: Record<AccountType, { label: string; color: string; icon: typeof Landmark }> = {
  checking: { label: 'Checking', color: 'bg-blue-500/20 text-blue-400', icon: Landmark },
  savings: { label: 'Savings', color: 'bg-green-500/20 text-green-400', icon: PiggyBank },
  cash: { label: 'Cash', color: 'bg-amber-500/20 text-amber-400', icon: Banknote },
  credit: { label: 'Credit', color: 'bg-red-500/20 text-red-400', icon: CreditCard },
};

interface AccountCardProps {
  account: Account;
  onClick: () => void;
}

export const AccountCard = observer(function AccountCard({ account, onClick }: AccountCardProps) {
  const { transactionStore } = useStore();

  const balance = transactionStore
    .transactionsForAccount(account.id)
    .reduce((sum, t) => sum + t.amount, 0);

  const config = typeConfig[account.type];
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-zinc-900 p-4 rounded-none border border-zinc-800 hover:border-zinc-600 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-none ${config.color}`}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-zinc-100 truncate">{account.name}</div>
          <span className={`inline-block mt-0.5 text-xs px-1.5 py-0.5 rounded-sm ${config.color}`}>
            {config.label}
          </span>
        </div>
        <div className={`text-sm font-mono ${balance < 0 ? 'text-red-400' : 'text-zinc-100'}`}>
          {formatCurrency(balance)}
        </div>
      </div>
    </button>
  );
});
