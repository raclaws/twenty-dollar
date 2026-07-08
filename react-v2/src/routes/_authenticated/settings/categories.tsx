import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

export const SettingsCategoriesPage = observer(function SettingsCategoriesPage() {
  const { categoryStore } = useStore();
  const groups = categoryStore.sortedGroups;

  const [newGroupName, setNewGroupName] = useState('');
  const [addingCategoryGroupId, setAddingCategoryGroupId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    categoryStore.createGroup({
      id: crypto.randomUUID(),
      name: trimmed,
      sort_order: groups.length,
    });
    toast.success(`Group "${trimmed}" created`);
    setNewGroupName('');
  };

  const handleCreateCategory = (groupId: string) => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setAddingCategoryGroupId(null);
      return;
    }
    const cats = categoryStore.categoriesForGroup(groupId);
    categoryStore.createCategory({
      id: crypto.randomUUID(),
      group_id: groupId,
      name: trimmed,
      sort_order: cats.length,
      target_type: null,
      target_amount: null,
      target_date: null,
    });
    toast.success(`Category "${trimmed}" created`);
    setNewCategoryName('');
    setAddingCategoryGroupId(null);
  };

  const handleCategoryKeyDown = (e: React.KeyboardEvent, groupId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateCategory(groupId);
    } else if (e.key === 'Escape') {
      setAddingCategoryGroupId(null);
    }
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h2 className="text-lg font-medium text-zinc-100">Categories</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Manage your category groups and categories.
        </p>
      </div>

      {/* Create group form */}
      <form onSubmit={handleCreateGroup} className="flex items-center gap-2">
        <input
          type="text"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          placeholder="New group name"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={!newGroupName.trim()}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add Group
        </button>
      </form>

      {groups.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4">No categories yet. Create a group above to get started.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const cats = categoryStore.categoriesForGroup(group.id);
            return (
              <div key={group.id} className="border border-zinc-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-zinc-300">{group.name}</span>
                    <span className="ml-2 text-xs text-zinc-500">({cats.length})</span>
                  </div>
                  <button
                    onClick={() => {
                      setAddingCategoryGroupId(group.id);
                      setNewCategoryName('');
                    }}
                    className="p-1 text-zinc-500 hover:text-indigo-400 transition-colors"
                    title="Add category to this group"
                    aria-label={`Add category to ${group.name}`}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className="divide-y divide-zinc-800/50">
                  {cats.map((cat) => (
                    <div key={cat.id} className="px-4 py-2 flex items-center justify-between">
                      <span className="text-sm text-zinc-300">{cat.name}</span>
                      {cat.target_type && (
                        <span className="text-xs text-zinc-500 capitalize">{cat.target_type}</span>
                      )}
                    </div>
                  ))}
                  {addingCategoryGroupId === group.id && (
                    <div className="px-4 py-2">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => handleCategoryKeyDown(e, group.id)}
                        onBlur={() => handleCreateCategory(group.id)}
                        placeholder="New category name"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-sm px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
