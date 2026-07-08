import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { BudgetGroup, CategoryBudget } from '@/engine/types';
import type { CategoryGroup } from '@/types';
import { GroupRow } from './GroupRow';
import { InlineForm } from './InlineForm';

type SortField = 'assigned' | 'activity' | 'available';
type SortDir = 'asc' | 'desc';
type BudgetFilter = 'overspent' | 'underfunded' | 'unfunded' | 'overassigned' | null;

interface BudgetGridProps {
  groups: BudgetGroup[];
  month: string;
  categoryGroups: CategoryGroup[];
  filter: BudgetFilter;
  onAddGroup: () => void;
  onAddCategory: (groupId: string) => void;
  onRenameGroup: (id: string) => void;
  onRenameCategory: (id: string) => void;
  onMoveCategory: (catId: string, newGroupId: string) => void;
  onDeleteGroup: (id: string, name: string) => void;
  onDeleteCategory: (id: string, name: string) => void;
  onCoverFrom: (catId: string) => void;
  onMoveTo: (catId: string) => void;
  onViewDetail: (catId: string) => void;
  onSetTarget: (catId: string) => void;
  showAddGroup: boolean;
  showAddCategory: string | null;
  editingGroup: string | null;
  editingCategory: string | null;
  onCreateGroup: (values: Record<string, string>) => void;
  onCreateCategory: (values: Record<string, string>) => void;
  onRenameGroupSubmit: (id: string, values: Record<string, string>) => void;
  onRenameCategorySubmit: (id: string, values: Record<string, string>) => void;
  onCancelAdd: () => void;
  onCancelEdit: () => void;
}

export const BudgetGrid = observer(function BudgetGrid({
  groups,
  month,
  categoryGroups,
  filter,
  onAddGroup,
  onAddCategory,
  onRenameGroup,
  onRenameCategory,
  onMoveCategory,
  onDeleteGroup,
  onDeleteCategory,
  onCoverFrom,
  onMoveTo,
  onViewDetail,
  onSetTarget,
  showAddGroup,
  showAddCategory,
  editingGroup,
  editingCategory,
  onCreateGroup,
  onCreateCategory,
  onRenameGroupSubmit,
  onRenameCategorySubmit,
  onCancelAdd,
  onCancelEdit,
}: BudgetGridProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function toggleSort(field: SortField) {
    if (sortField === field) {
      if (sortDir === 'desc') setSortDir('asc');
      else { setSortField(null); setSortDir('desc'); }
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  const sortedGroups = (() => {
    if (!sortField) return groups;
    const field = sortField;
    const dir = sortDir;

    const sorted = groups.map((g) => ({
      ...g,
      categories: [...g.categories].sort((a, b) => {
        const aVal = field === 'assigned' ? a.assigned : field === 'activity' ? a.activity : a.available;
        const bVal = field === 'assigned' ? b.assigned : field === 'activity' ? b.activity : b.available;
        const diff = aVal - bVal;
        return dir === 'asc' ? diff : -diff;
      }),
    }));

    sorted.sort((a, b) => {
      const aTotal = a.categories.reduce((sum, c) => {
        const v = field === 'assigned' ? c.assigned : field === 'activity' ? c.activity : c.available;
        return sum + v;
      }, 0);
      const bTotal = b.categories.reduce((sum, c) => {
        const v = field === 'assigned' ? c.assigned : field === 'activity' ? c.activity : c.available;
        return sum + v;
      }, 0);
      return dir === 'asc' ? aTotal - bTotal : bTotal - aTotal;
    });

    return sorted;
  })();

  function SortHeader({ label, field }: { label: string; field: SortField }) {
    const active = sortField === field;
    return (
      <div
        className={`budget-grid__col budget-grid__col--num budget-grid__col--sortable ${active ? 'budget-grid__col--sorted' : ''}`}
        onClick={() => toggleSort(field)}
      >
        {label}
        <span className="budget-grid__sort-icon">
          {active ? (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : <ChevronsUpDown size={10} />}
        </span>
      </div>
    );
  }

  return (
    <div className="budget-grid">
      <div className="budget-grid__header">
        <div className="budget-grid__col budget-grid__col--name">CATEGORY</div>
        <div className="budget-grid__col budget-grid__col--target" />
        <SortHeader label="ASSIGNED" field="assigned" />
        <SortHeader label="ACTIVITY" field="activity" />
        <SortHeader label="AVAILABLE" field="available" />
        <div className="budget-grid__col budget-grid__col--health" />
        <div className="budget-grid__col budget-grid__col--status" />
      </div>
      {sortedGroups.map((group) => (
        <GroupRow
          key={group.groupId}
          group={group}
          month={month}
          categoryGroups={categoryGroups}
          filter={filter}
          isEditing={editingGroup === group.groupId}
          editingCategoryId={editingCategory}
          showAddCategory={showAddCategory === group.groupId}
          onAddCategory={() => onAddCategory(group.groupId)}
          onRename={() => onRenameGroup(group.groupId)}
          onDelete={() => onDeleteGroup(group.groupId, group.name)}
          onRenameCategory={onRenameCategory}
          onMoveCategory={onMoveCategory}
          onDeleteCategory={onDeleteCategory}
          onCoverFrom={onCoverFrom}
          onMoveTo={onMoveTo}
          onViewDetail={onViewDetail}
          onSetTarget={onSetTarget}
          onRenameSubmit={(values) => onRenameGroupSubmit(group.groupId, values)}
          onRenameCategorySubmit={onRenameCategorySubmit}
          onCreateCategory={onCreateCategory}
          onCancelAdd={onCancelAdd}
          onCancelEdit={onCancelEdit}
        />
      ))}
      {groups.length === 0 && (
        <div className="budget-grid__empty">
          <span className="budget-grid__empty-text">No category groups yet</span>
          <button className="btn btn--sm btn--primary" onClick={onAddGroup}>+ Create your first group</button>
        </div>
      )}
      <div className="budget-grid__actions">
        {showAddGroup ? (
          <InlineForm
            fields={[{ key: 'name', label: 'Group name', type: 'text', required: true, placeholder: 'Group name' }]}
            onSubmit={onCreateGroup}
            onCancel={onCancelAdd}
            submitLabel="Create"
          />
        ) : (
          <div className="budget-grid__add-group" onClick={onAddGroup}>
            <span className="budget-grid__add-group-text">Add group...</span>
          </div>
        )}
      </div>
    </div>
  );
});
