import { useState, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { Wallet, X, Plus } from 'lucide-react';
import { useStore } from '@/lib/store-context';
import { computeBudget } from '@/engine/budget';
import './budget.css';
import { formatCurrency } from '@/lib/format';
import type { CategoryBudget } from '@/engine/types';
import type { SplitEntry } from '@/types';
import { BudgetGrid } from './BudgetGrid';
import { MonthNavigator } from './MonthNavigator';
import { RTABanner } from './RTABanner';
import { CoverDialog, type TransferTarget } from './CoverDialog';
import { CategoryDetail } from './CategoryDetail';
import { TargetDialog } from './TargetDialog';
import { InlineForm } from './InlineForm';

type BudgetFilter = 'overspent' | 'underfunded' | 'unfunded' | 'overassigned' | null;

export const BudgetPage = observer(function BudgetPage() {
  const { budgetStore, categoryStore, transactionStore, undoStore } = useStore();
  const month = budgetStore.currentMonth;

  // Compute budget from engine
  const groups = categoryStore.sortedGroups;
  const allCategories = categoryStore.flatCategories;
  const transactions = Array.from(transactionStore.transactions.values());
  const splitEntries: SplitEntry[] = [];
  for (const tx of transactions) {
    const splits = transactionStore.splitsForTransaction(tx.id);
    splitEntries.push(...splits);
  }
  const assignments = Array.from(budgetStore.assignments.values());
  const budgetMonth = computeBudget(groups, allCategories, transactions, splitEntries, assignments, month);

  const hasCategories = budgetMonth.groups.some((g) => g.categories.length > 0);
  const hasGroups = groups.length > 0;

  // UI State
  const [filter, setFilter] = useState<BudgetFilter>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [coverTarget, setCoverTarget] = useState<TransferTarget | null>(null);
  const [detailCatId, setDetailCatId] = useState<string | null>(null);
  const [targetCatId, setTargetCatId] = useState<string | null>(null);

  // Undo keyboard shortcut
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoStore.undo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        undoStore.redo();
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [undoStore]);

  // Scroll to first highlighted row when filter activates
  useEffect(() => {
    if (filter) {
      requestAnimationFrame(() => {
        const highlighted = document.querySelector('.budget-row--highlighted');
        if (highlighted) highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [filter]);

  // Escape dismisses filter
  useEffect(() => {
    function handleFilterEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && filter) {
        const active = document.activeElement as HTMLElement;
        if (!active || active === document.body || active.closest('.budget-grid')) {
          e.stopPropagation();
          setFilter(null);
        }
      }
    }
    document.addEventListener('keydown', handleFilterEscape);
    return () => document.removeEventListener('keydown', handleFilterEscape);
  }, [filter]);

  function openCover(catId: string) {
    const cat = budgetMonth.categoryMap.get(catId);
    const needsFunding = cat && (cat.available < 0 || (cat.target && cat.target.needed > 0));
    setCoverTarget({ catId, catName: getCatName(catId), side: needsFunding ? 'to' : 'from' });
  }

  function getCatName(catId: string): string {
    const cat = categoryStore.getCategory(catId);
    return cat?.name ?? '';
  }

  // CRUD operations
  function createGroup(values: Record<string, string>) {
    const name = values.name.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    categoryStore.createGroup({ id, name, sort_order: groups.length });
    undoStore.push(
      `Created group "${name}"`,
      () => categoryStore.createGroup({ id, name, sort_order: groups.length }),
      () => categoryStore.deleteGroup(id),
    );
    setShowAddGroup(false);
  }

  function createCategory(values: Record<string, string>) {
    const name = values.name.trim();
    const groupId = showAddCategory;
    if (!name || !groupId) return;
    const id = crypto.randomUUID();
    const sortOrder = categoryStore.categoriesForGroup(groupId).length;
    categoryStore.createCategory({
      id,
      group_id: groupId,
      name,
      sort_order: sortOrder,
      target_type: null,
      target_amount: null,
      target_date: null,
    });
    undoStore.push(
      `Created category "${name}"`,
      () => categoryStore.createCategory({ id, group_id: groupId, name, sort_order: sortOrder, target_type: null, target_amount: null, target_date: null }),
      () => categoryStore.deleteCategory(id),
    );
    setShowAddCategory(null);
  }

  function renameGroup(groupId: string, values: Record<string, string>) {
    const name = values.name.trim();
    if (!name) return;
    categoryStore.updateGroup(groupId, { name });
    setEditingGroup(null);
  }

  function renameCategory(catId: string, values: Record<string, string>) {
    const name = values.name.trim();
    if (!name) return;
    categoryStore.updateCategory(catId, { name });
    setEditingCategory(null);
  }

  function moveCategory(catId: string, newGroupId: string) {
    const cat = categoryStore.getCategory(catId);
    if (!cat) return;
    const prevGroupId = cat.group_id;
    categoryStore.moveCategory(catId, newGroupId);
    undoStore.push(
      'Moved category to different group',
      () => categoryStore.moveCategory(catId, newGroupId),
      () => categoryStore.moveCategory(catId, prevGroupId),
    );
  }

  function deleteGroup(groupId: string, groupName: string) {
    const childCats = categoryStore.categoriesForGroup(groupId);
    if (childCats.length > 0) {
      alert(`Cannot delete "${groupName}" — it has ${childCats.length} categor${childCats.length > 1 ? 'ies' : 'y'}. Move or delete them first.`);
      return;
    }
    if (!confirm(`Delete "${groupName}"?`)) return;
    const record = categoryStore.getGroup(groupId);
    categoryStore.deleteGroup(groupId);
    if (record) {
      undoStore.push(
        `Deleted group "${groupName}"`,
        () => categoryStore.deleteGroup(groupId),
        () => categoryStore.createGroup(record),
      );
    }
  }

  function deleteCategory(catId: string, catName: string) {
    // Check for transactions
    const txns = Array.from(transactionStore.transactions.values()).filter((t) => t.category_id === catId);
    if (txns.length > 0) {
      alert(`Cannot delete "${catName}" — it has ${txns.length} transaction${txns.length > 1 ? 's' : ''}. Reassign them to another category first.`);
      return;
    }
    if (!confirm(`Delete "${catName}"?`)) return;
    const record = categoryStore.getCategory(catId);
    categoryStore.deleteCategory(catId);
    if (record) {
      undoStore.push(
        `Deleted category "${catName}"`,
        () => categoryStore.deleteCategory(catId),
        () => categoryStore.createCategory(record),
      );
    }
  }

  // Target dialog data
  const targetCat = targetCatId ? categoryStore.getCategory(targetCatId) : null;
  const targetDialogData = {
    type: targetCat?.target_type ?? null,
    amount: targetCat?.target_amount ?? null,
    date: targetCat?.target_date ?? null,
  };

  // Detail panel data
  const detailBudget = detailCatId ? budgetMonth.categoryMap.get(detailCatId) ?? null : null;

  return (
    <div className="budget-view">
      <div className="budget-view__topbar">
        <MonthNavigator />
        <RTABanner rta={budgetMonth.rta} />
        <div className="budget-view__actions">
          <button className="btn btn--sm btn--ghost" onClick={() => setShowAddGroup(true)} title="Add group">
            <Plus size={14} /> Group
          </button>
        </div>
        {filter && (
          <div className="budget-filter-badge">
            <span className="budget-filter-badge__label">Showing: {filter}</span>
            <button className="budget-filter-badge__clear" onClick={() => setFilter(null)}><X size={12} /></button>
          </div>
        )}
      </div>

      {/* Cover dialog */}
      <CoverDialog
        open={!!coverTarget}
        target={coverTarget}
        onClose={() => setCoverTarget(null)}
      />

      {/* Target dialog */}
      <TargetDialog
        open={!!targetCatId}
        categoryId={targetCatId}
        categoryName={targetCat?.name ?? ''}
        currentTarget={targetDialogData}
        onClose={() => setTargetCatId(null)}
      />

      {/* Main content */}
      {hasCategories || hasGroups ? (
        <BudgetGrid
          groups={budgetMonth.groups}
          month={month}
          categoryGroups={groups}
          filter={filter}
          onAddGroup={() => setShowAddGroup(true)}
          onAddCategory={(groupId) => setShowAddCategory(groupId)}
          onRenameGroup={(id) => setEditingGroup(id)}
          onRenameCategory={(id) => setEditingCategory(id)}
          onMoveCategory={moveCategory}
          onDeleteGroup={deleteGroup}
          onDeleteCategory={deleteCategory}
          onCoverFrom={(catId) => {
            const cat = budgetMonth.categoryMap.get(catId);
            setCoverTarget({ catId, catName: getCatName(catId), side: 'from' });
          }}
          onMoveTo={(catId) => {
            setCoverTarget({ catId, catName: getCatName(catId), side: 'to' });
          }}
          onViewDetail={(catId) => setDetailCatId(catId)}
          onSetTarget={(catId) => setTargetCatId(catId)}
          showAddGroup={showAddGroup}
          showAddCategory={showAddCategory}
          editingGroup={editingGroup}
          editingCategory={editingCategory}
          onCreateGroup={createGroup}
          onCreateCategory={createCategory}
          onRenameGroupSubmit={renameGroup}
          onRenameCategorySubmit={renameCategory}
          onCancelAdd={() => { setShowAddGroup(false); setShowAddCategory(null); }}
          onCancelEdit={() => { setEditingGroup(null); setEditingCategory(null); }}
        />
      ) : (
        <div className="empty-state">
          <div className="empty-state__icon"><Wallet size={32} /></div>
          <p className="empty-state__title">No categories yet</p>
          <p className="empty-state__desc">Create a category group to start budgeting.</p>
          <div className="empty-state__actions">
            {showAddGroup ? (
              <InlineForm
                fields={[{ key: 'name', label: 'Group name', type: 'text', required: true, placeholder: 'e.g. Housing, Food, Transport' }]}
                onSubmit={createGroup}
                onCancel={() => setShowAddGroup(false)}
                submitLabel="Create Group"
              />
            ) : (
              <button className="btn btn--primary" onClick={() => setShowAddGroup(true)}>Create First Group</button>
            )}
          </div>
        </div>
      )}

      {/* Sidebar status counters (filter badges) */}
      <div className="budget-view__sidebar-counters">
        {budgetMonth.counts.overspent > 0 && (
          <button
            className={`budget-counter ${filter === 'overspent' ? 'budget-counter--active' : ''}`}
            onClick={() => setFilter(filter === 'overspent' ? null : 'overspent')}
          >
            Overspent ({budgetMonth.counts.overspent})
          </button>
        )}
        {budgetMonth.counts.underfunded > 0 && (
          <button
            className={`budget-counter ${filter === 'underfunded' ? 'budget-counter--active' : ''}`}
            onClick={() => setFilter(filter === 'underfunded' ? null : 'underfunded')}
          >
            Underfunded ({budgetMonth.counts.underfunded})
          </button>
        )}
        {budgetMonth.counts.unfunded > 0 && (
          <button
            className={`budget-counter ${filter === 'unfunded' ? 'budget-counter--active' : ''}`}
            onClick={() => setFilter(filter === 'unfunded' ? null : 'unfunded')}
          >
            Unfunded ({budgetMonth.counts.unfunded})
          </button>
        )}
      </div>
    </div>
  );
});
