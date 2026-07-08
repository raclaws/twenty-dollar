import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { formatCurrency } from '@/lib/format';
import type { BudgetGroup } from '@/engine/types';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface CategoryGroupRowProps {
  group: BudgetGroup;
  expanded: boolean;
  onToggle: () => void;
}

export const CategoryGroupRow = observer(function CategoryGroupRow({
  group,
  expanded,
  onToggle,
}: CategoryGroupRowProps) {
  const { categoryStore } = useStore();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const handleAddCategory = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAdding(true);
    setNewName('');
  };

  const handleSubmit = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    const cats = categoryStore.categoriesForGroup(group.groupId);
    categoryStore.createCategory({
      id: crypto.randomUUID(),
      group_id: group.groupId,
      name: trimmed,
      sort_order: cats.length,
      target_type: null,
      target_amount: null,
      target_date: null,
    });
    toast.success(`Category "${trimmed}" created`);
    setAdding(false);
    setNewName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      setAdding(false);
    }
  };

  return (
    <div>
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
        className="w-full grid grid-cols-[1fr_120px_120px_120px] items-center gap-2 px-3 py-2 bg-zinc-900/80 border-b border-zinc-800 hover:bg-zinc-800/60 transition-colors cursor-pointer"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 text-left">
          {expanded ? (
            <ChevronDown size={14} className="text-zinc-500" />
          ) : (
            <ChevronRight size={14} className="text-zinc-500" />
          )}
          <span className="text-xs font-medium text-zinc-300 uppercase tracking-wide font-[Figtree]">
            {group.name}
          </span>
          <button
            onClick={handleAddCategory}
            className="ml-1 p-0.5 rounded text-zinc-500 hover:text-indigo-400 hover:bg-zinc-700/50 transition-colors opacity-0 group-hover:opacity-100"
            style={{ opacity: 1 }}
            title="Add category"
            aria-label={`Add category to ${group.name}`}
          >
            <Plus size={12} />
          </button>
        </div>
        <span className="text-right text-xs font-[JetBrains_Mono] text-zinc-500">
          {formatCurrency(group.totalAssigned)}
        </span>
        <span className="text-right text-xs font-[JetBrains_Mono] text-zinc-500">
          {formatCurrency(group.totalActivity)}
        </span>
        <span className="text-right text-xs font-[JetBrains_Mono] text-zinc-500">
          {formatCurrency(group.totalAvailable)}
        </span>
      </div>
      {adding && (
        <div className="grid grid-cols-[1fr_120px_120px_120px] items-center gap-2 px-3 py-1.5 bg-zinc-900/40 border-b border-zinc-800">
          <div className="pl-6">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSubmit}
              placeholder="New category name"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-sm px-2 py-0.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
          </div>
          <div />
          <div />
          <div />
        </div>
      )}
    </div>
  );
});
