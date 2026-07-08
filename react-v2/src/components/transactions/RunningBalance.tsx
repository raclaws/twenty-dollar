import { formatCurrency } from '@/lib/format';

interface RunningBalanceProps {
  balance: number;
}

export function RunningBalance({ balance }: RunningBalanceProps) {
  const color = balance >= 0 ? 'text-emerald-400' : 'text-red-400';
  return (
    <span className={`text-sm font-[JetBrains_Mono] ${color}`}>
      {formatCurrency(balance)}
    </span>
  );
}
