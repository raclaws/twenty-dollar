import { observer } from 'mobx-react-lite';
import { formatCurrency } from '@/lib/format';

interface RTABannerProps {
  rta: number; // cents
}

export const RTABanner = observer(function RTABanner({ rta }: RTABannerProps) {
  const colorClass =
    rta > 0
      ? 'text-[#a6e3a1]'
      : rta < 0
        ? 'text-[#f38ba8]'
        : 'text-zinc-400';

  const bgClass =
    rta > 0
      ? 'bg-emerald-500/5 border-emerald-500/20'
      : rta < 0
        ? 'bg-red-500/5 border-red-500/20'
        : 'bg-zinc-800/50 border-zinc-700/50';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 rounded-sm border ${bgClass}`}
    >
      <span className="text-xs text-zinc-400 font-[Figtree]">Ready to Assign</span>
      <span className={`text-lg font-medium font-[JetBrains_Mono] ${colorClass}`}>
        {formatCurrency(rta)}
      </span>
    </div>
  );
});
