import { observer } from 'mobx-react-lite';
import type { Account } from '@/types';

interface AccountPickerProps {
  value: string;
  onChange: (accountId: string) => void;
  accounts: Account[];
  className?: string;
}

export const AccountPicker = observer(function AccountPicker({
  value,
  onChange,
  accounts,
  className = '',
}: AccountPickerProps) {
  const typeBadge = (type: string) => {
    const colors: Record<string, string> = {
      checking: 'bg-blue-500/20 text-blue-300',
      savings: 'bg-emerald-500/20 text-emerald-300',
      credit: 'bg-amber-500/20 text-amber-300',
      cash: 'bg-purple-500/20 text-purple-300',
    };
    return colors[type] ?? 'bg-zinc-500/20 text-zinc-300';
  };

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-zinc-800 text-zinc-200 text-sm px-1.5 py-1 rounded border border-zinc-700 outline-none focus:border-indigo-500 w-full appearance-none cursor-pointer ${className}`}
      aria-label="Select account"
    >
      <option value="">Account</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} ({a.type})
        </option>
      ))}
    </select>
  );
});
