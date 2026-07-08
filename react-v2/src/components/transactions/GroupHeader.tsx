import { observer } from 'mobx-react-lite';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface GroupHeaderProps {
  label: string;
  count: number;
  aggregate: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  showAccountColumn?: boolean;
}

export const GroupHeader = observer(function GroupHeader({
  label,
  count,
  aggregate,
  collapsed,
  onToggleCollapse,
  showAccountColumn = true,
}: GroupHeaderProps) {
  const gridCols = showAccountColumn
    ? 'grid-cols-[40px_100px_120px_1fr_1fr_1fr_100px_100px_40px]'
    : 'grid-cols-[40px_100px_1fr_1fr_1fr_100px_100px_40px]';

  return (
    <div
      className={`grid ${gridCols} gap-1 px-2 py-1 items-center bg-zinc-800/50 cursor-pointer select-none`}
      onClick={onToggleCollapse}
      role="row"
    >
      <div className="flex items-center justify-center" role="gridcell">
        {collapsed ? (
          <ChevronRight size={14} className="text-zinc-400" />
        ) : (
          <ChevronDown size={14} className="text-zinc-400" />
        )}
      </div>
      <div
        className="text-xs uppercase text-zinc-400 font-medium tracking-wide col-span-4"
        role="gridcell"
      >
        {label}
        <span className="ml-2 text-zinc-500">({count})</span>
      </div>
      {/* spacer cols */}
      <div role="gridcell" />
      <div className="text-xs font-[JetBrains_Mono] text-right text-zinc-400" role="gridcell">
        {formatCurrency(aggregate)}
      </div>
      <div role="gridcell" />
      {showAccountColumn && <div role="gridcell" />}
    </div>
  );
});
