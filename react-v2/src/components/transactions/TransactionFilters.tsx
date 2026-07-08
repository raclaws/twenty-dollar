import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';

interface TransactionFiltersProps {
  selectedAccountId: string | null;
  onAccountChange: (accountId: string | null) => void;
}

export const TransactionFilters = observer(function TransactionFilters({
  selectedAccountId,
  onAccountChange,
}: TransactionFiltersProps) {
  const { accountStore } = useStore();
  const accounts = accountStore.sortedAccounts;

  return (
    <select
      value={selectedAccountId ?? ''}
      onChange={(e) => onAccountChange(e.target.value || null)}
      className="bg-zinc-800 text-zinc-200 text-sm px-3 py-1.5 rounded border border-zinc-700 outline-none focus:border-blue-500"
      aria-label="Filter by account"
    >
      <option value="">All Accounts</option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name}
        </option>
      ))}
    </select>
  );
});
