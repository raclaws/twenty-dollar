import { useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { ChevronRight, ChevronDown, Plus, AlertTriangle, TrendingDown } from 'lucide-react';
import { useStore } from '@/lib/store-context';
import { formatCurrency } from '@/lib/format';
import type { BudgetGroup, CategoryBudget } from '@/engine/types';
import type { CategoryGroup } from '@/types';
import { HealthRing } from './HealthRing';
import { InlineForm } from './InlineForm';
import { IconPicker, EntityIcon } from './IconPicker';
import { CategoryRow } from './CategoryRow';

type BudgetFilter = 'overspent' | 'underfunded' | 'unfunded' | 'overassigned' | null;

interface GroupRowProps {
  group: BudgetGroup;
  month: string;
  categoryGroups: CategoryGroup[];
  filter: BudgetFilter;
  isEditing: boolean;
  editingCategoryId: string | null;
  showAddCategory: boolean;
  onAddCategory: () => void;
  onRename: () => void;
  onDelete: () => void;
  onRenameCategory: (id: string) => void;
  onMoveCategory: (catId: string, newGroupId: string) => void;
  onDeleteCategory: (id: string, name: string) => void;
  onCoverFrom: (catId: string) => void;
  onMoveTo: (catId: string) => void;
  onViewDetail: (catId: string) => void;
  onSetTarget: (catId: string) => void;
  onRenameSubmit: (values: Record<string, string>) => void;
  onRenameCategorySubmit: (id: string, values: Record<string, string>) => void;
  onCreateCategory: (values: Record<string, string>) => void;
  onCancelAdd: () => void;
  onCancelEdit: () => void;
}

export const GroupRow = observer(function GroupRow({
  group,
  month,
  categoryGroups,
  filter,
  isEditing,
  editingCategoryId,
  showAddCategory,
  onAddCategory,
  onRename,
  onDelete,
  onRenameCategory,
  onMoveCategory,
  onDeleteCategory,
  onCoverFrom,
  onMoveTo,
  onViewDetail,
  onSetTarget,
  onRenameSubmit,
  onRenameCategorySubmit,
  onCreateCategory,
  onCancelAdd,
  onCancelEdit,
}: GroupRowProps) {
  const { categoryStore, undoStore } = useStore();
  const otherGroups = categoryGroups.filter((g) => g.id !== group.groupId);
  const [collapsed, setCollapsed] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  const overspentCount = group.categories.filter((c) => c.available < 0).length;
  const underfundedCount = group.categories.filter((c) => c.target !== null && c.target.needed > 0).length;

  useEffect(() => {
    function handleGlobalKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && ctxMenu) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        setCtxMenu(null);
      }
    }

    function handleGlobalMousedown(e: MouseEvent) {
      const target = e.target as Node;
      if (headerRef.current && headerRef.current.contains(target)) return;
      if (ctxMenuRef.current && ctxMenuRef.current.contains(target)) return;
      if (ctxMenu) setCtxMenu(null);
    }

    document.addEventListener('keydown', handleGlobalKeydown, true);
    document.addEventListener('mousedown', handleGlobalMousedown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeydown, true);
      document.removeEventListener('mousedown', handleGlobalMousedown);
    };
  }, [ctxMenu]);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }

  function commitGroupIcon(newIcon: string | null) {
    const groupData = categoryStore.getGroup(group.groupId);
    if (!groupData) return;
    categoryStore.updateGroup(group.groupId, { icon: newIcon } as any);
  }

  // Resolve category names/icons from store
  function getCategoryName(catBudget: CategoryBudget): string {
    const cat = categoryStore.getCategory(catBudget.categoryId);
    return cat?.name ?? 'Unknown';
  }

  function getCategoryIcon(catBudget: CategoryBudget): string | null {
    const cat = categoryStore.getCategory(catBudget.categoryId);
    return (cat as any)?.icon ?? null;
  }

  // Get group icon from store
  const groupData = categoryStore.getGroup(group.groupId);
  const groupIcon: string | null = (groupData as any)?.icon ?? null;

  return (
    <div className="budget-group">
      {isEditing ? (
        <div className="budget-group__header">
          <InlineForm
            fields={[{ key: 'name', label: 'Group name', type: 'text', required: true, placeholder: group.name }]}
            onSubmit={onRenameSubmit}
            onCancel={onCancelEdit}
            submitLabel="Rename"
          />
        </div>
      ) : (
        <div ref={headerRef} className="budget-group__header" onContextMenu={handleContextMenu}>
          <div className="budget-group__name" style={{ position: 'relative' }}>
            <span className="budget-group__chevron" onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}>
              {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </span>
            <span
              className="budget-row__icon"
              onClick={(e) => { e.stopPropagation(); setIconPickerOpen(!iconPickerOpen); }}
              title="Change icon"
            >
              <EntityIcon icon={groupIcon} name={group.name} size={14} />
            </span>
            {group.name}
            {iconPickerOpen && (
              <IconPicker
                value={groupIcon}
                entityName={group.name}
                onPick={(iconId) => { commitGroupIcon(iconId); setIconPickerOpen(false); }}
                onCancel={() => setIconPickerOpen(false)}
              />
            )}
            <div className="budget-group__more" onClick={(e) => { e.stopPropagation(); onAddCategory(); }}>
              <span className="budget-group__more-icon"><Plus size={14} /></span>
            </div>
          </div>
          <div className="budget-group__target" />
          <div className="budget-group__assigned">
            <span className="money">{formatCurrency(group.totalAssigned)}</span>
          </div>
          <div className="budget-group__activity cell--computed">
            <span className={group.totalActivity < 0 ? 'money money--negative' : 'money'}>{formatCurrency(group.totalActivity)}</span>
          </div>
          <div className="budget-group__available cell--computed">
            <span className="money">{formatCurrency(group.totalAvailable)}</span>
          </div>
          <div className="budget-group__health">
            <HealthRing available={group.totalAvailable} activity={group.totalActivity} />
          </div>
          <div className="budget-group__status">
            {overspentCount > 0 && (
              <span className="budget-group__badge budget-group__badge--overspent"><AlertTriangle size={11} /> {overspentCount}</span>
            )}
            {underfundedCount > 0 && (
              <span className="budget-group__badge budget-group__badge--underfunded"><TrendingDown size={11} /> {underfundedCount}</span>
            )}
          </div>
        </div>
      )}
      {!collapsed && (
        <>
          {group.categories.map((cat) =>
            editingCategoryId === cat.categoryId ? (
              <div key={cat.categoryId} className="budget-row">
                <InlineForm
                  fields={[{ key: 'name', label: 'Category name', type: 'text', required: true, placeholder: getCategoryName(cat) }]}
                  onSubmit={(values) => onRenameCategorySubmit(cat.categoryId, values)}
                  onCancel={onCancelEdit}
                  submitLabel="Rename"
                />
              </div>
            ) : (
              <CategoryRow
                key={cat.categoryId}
                budget={cat}
                categoryName={getCategoryName(cat)}
                categoryIcon={getCategoryIcon(cat)}
                month={month}
                otherGroups={otherGroups}
                filter={filter}
                onRename={() => onRenameCategory(cat.categoryId)}
                onMove={(newGroupId) => onMoveCategory(cat.categoryId, newGroupId)}
                onDelete={() => onDeleteCategory(cat.categoryId, getCategoryName(cat))}
                onCoverFrom={onCoverFrom}
                onMoveTo={onMoveTo}
                onViewDetail={onViewDetail}
                onSetTarget={onSetTarget}
              />
            )
          )}
          {group.categories.length === 0 && !showAddCategory && (
            <div className="budget-row budget-row--empty" onClick={onAddCategory}>
              <div className="budget-row__name">
                <span className="budget-row__empty-text">No categories yet — click to add one</span>
              </div>
            </div>
          )}
          {showAddCategory && (
            <div className="budget-row">
              <InlineForm
                fields={[{ key: 'name', label: 'Category name', type: 'text', required: true, placeholder: 'New category name' }]}
                onSubmit={onCreateCategory}
                onCancel={onCancelAdd}
                submitLabel="Create"
              />
            </div>
          )}
        </>
      )}
      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="ctx-menu"
          style={{ position: 'fixed', left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px`, zIndex: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ctx-menu__item" onClick={() => { setCtxMenu(null); onAddCategory(); }}>Add category</div>
          <div className="ctx-menu__item" onClick={() => { setCtxMenu(null); setIconPickerOpen(true); }}>Change icon...</div>
          <div className="ctx-menu__sep" />
          <div className="ctx-menu__item" onClick={() => { setCtxMenu(null); onRename(); }}>Rename</div>
          <div className="ctx-menu__item ctx-menu__item--danger" onClick={() => { setCtxMenu(null); onDelete(); }}>Delete</div>
        </div>
      )}
    </div>
  );
});
