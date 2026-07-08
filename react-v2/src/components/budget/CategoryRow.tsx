import { useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import {
  ChevronLeft, AlertTriangle, TrendingDown, CircleDot, CheckCircle,
  Target, Repeat, Calendar, PiggyBank,
} from 'lucide-react';
import { useStore } from '@/lib/store-context';
import { formatCurrency } from '@/lib/format';
import type { CategoryBudget } from '@/engine/types';
import type { CategoryGroup } from '@/types';
import { HealthRing } from './HealthRing';
import { IconPicker, EntityIcon } from './IconPicker';
import { AssignmentInput } from './AssignmentInput';

type BudgetFilter = 'overspent' | 'underfunded' | 'unfunded' | 'overassigned' | null;

interface CategoryRowProps {
  budget: CategoryBudget;
  categoryName: string;
  categoryIcon: string | null;
  month: string;
  otherGroups: CategoryGroup[];
  filter: BudgetFilter;
  onRename: () => void;
  onMove: (newGroupId: string) => void;
  onDelete: () => void;
  onCoverFrom?: (catId: string) => void;
  onMoveTo?: (catId: string) => void;
  onViewDetail?: (catId: string) => void;
  onSetTarget?: (catId: string) => void;
}

export const CategoryRow = observer(function CategoryRow({
  budget,
  categoryName,
  categoryIcon,
  month,
  otherGroups,
  filter,
  onRename,
  onMove,
  onDelete,
  onCoverFrom,
  onMoveTo,
  onViewDetail,
  onSetTarget,
}: CategoryRowProps) {
  const { budgetStore, categoryStore, undoStore } = useStore();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxSub, setCtxSub] = useState<'groups' | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleGlobalKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (ctxSub) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          setCtxSub(null);
          return;
        }
        if (ctxMenu) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          setCtxMenu(null);
          return;
        }
      }
    }

    function handleGlobalMousedown(e: MouseEvent) {
      const target = e.target as Node;
      if (rowRef.current && rowRef.current.contains(target)) return;
      if (ctxMenuRef.current && ctxMenuRef.current.contains(target)) return;
      if (ctxMenu) setCtxMenu(null);
    }

    document.addEventListener('keydown', handleGlobalKeydown, true);
    document.addEventListener('mousedown', handleGlobalMousedown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeydown, true);
      document.removeEventListener('mousedown', handleGlobalMousedown);
    };
  }, [ctxMenu, ctxSub]);

  const isHighlighted = (() => {
    if (!filter) return false;
    switch (filter) {
      case 'overspent': return budget.activity < 0 && budget.available < 0;
      case 'underfunded': return budget.target !== null && budget.target.needed > 0;
      case 'unfunded': return budget.assigned === 0 && budget.available <= 0;
      case 'overassigned': return false;
    }
  })();

  const availableVariant = (() => {
    if (budget.available < 0) return 'overspent';
    if (budget.target && budget.target.needed > 0) return 'underfunded';
    if (budget.available > 0) return 'funded';
    return 'neutral';
  })();

  const statusLabel = (() => {
    if (budget.available < 0) return { text: 'Overspent', Icon: AlertTriangle, color: 'var(--c-negative)' };
    if (budget.target && budget.target.needed > 0) return { text: 'Underfunded', Icon: TrendingDown, color: 'var(--c-warning)' };
    if (budget.assigned === 0 && budget.available <= 0) return { text: 'Unfunded', Icon: CircleDot, color: 'var(--c-overlay0)' };
    return { text: 'Healthy', Icon: CheckCircle, color: 'var(--c-positive)' };
  })();

  function handleAssign(newAmount: number) {
    const oldAmount = budget.assigned;
    if (newAmount === oldAmount) return;
    budgetStore.assign(budget.categoryId, month, newAmount);
    undoStore.push(
      `Assigned ${(newAmount / 100).toFixed(2)} to ${categoryName}`,
      () => budgetStore.assign(budget.categoryId, month, newAmount),
      () => budgetStore.assign(budget.categoryId, month, oldAmount),
    );
  }

  function handleStatusClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (statusLabel.text === 'Overspent' || statusLabel.text === 'Underfunded' || statusLabel.text === 'Unfunded') {
      onMoveTo?.(budget.categoryId);
    } else if (statusLabel.text === 'Healthy') {
      onCoverFrom?.(budget.categoryId);
    }
  }

  function commitIcon(newIcon: string | null) {
    const cat = categoryStore.getCategory(budget.categoryId);
    if (!cat) return;
    const oldIcon = cat.target_type; // icon is not in type - use updateCategory
    categoryStore.updateCategory(budget.categoryId, { icon: newIcon } as any);
    // Undo not critical for icon changes in React version
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }

  function closeCtxMenu() {
    setCtxMenu(null);
    setCtxSub(null);
  }

  const { Icon: StatusIcon } = statusLabel;

  return (
    <>
      <div
        ref={rowRef}
        className={`budget-row ${isHighlighted ? 'budget-row--highlighted' : ''}`}
        onContextMenu={handleContextMenu}
      >
        <div className="budget-row__name" style={{ cursor: 'pointer', position: 'relative' }}>
          <span
            className="budget-row__icon"
            onClick={(e) => { e.stopPropagation(); setIconPickerOpen(!iconPickerOpen); }}
            title="Change icon"
          >
            <EntityIcon icon={categoryIcon} name={categoryName} size={16} />
          </span>
          <span onClick={() => onViewDetail?.(budget.categoryId)}>{categoryName}</span>
          {iconPickerOpen && (
            <IconPicker
              value={categoryIcon}
              entityName={categoryName}
              onPick={(iconId) => { commitIcon(iconId); setIconPickerOpen(false); }}
              onCancel={() => setIconPickerOpen(false)}
            />
          )}
        </div>
        <div className="budget-row__target">
          {budget.target ? (() => {
            const target = budget.target;
            const isSavings = target.type === 'savings' || target.type === 'by_date';
            const progressValue = isSavings ? budget.available : budget.assigned;
            const assignedProgress = Math.min(Math.max(progressValue / target.amount, 0), 1);
            const fillClass =
              progressValue >= target.amount ? 'budget-target__fill--funded' :
              progressValue > 0 ? 'budget-target__fill--partial' :
              'budget-target__fill--overspent';
            const label = isSavings
              ? `${formatCurrency(Math.max(0, budget.available))} / ${formatCurrency(target.amount)}`
              : `${formatCurrency(budget.assigned)} / ${formatCurrency(target.amount)}`;
            const TypeIcon = target.type === 'monthly' ? Repeat : target.type === 'by_date' ? Calendar : PiggyBank;
            const desc = target.type === 'monthly' ? 'monthly target' :
              target.type === 'by_date' ? `save by ${target.date || 'date'}` : 'saving goal';

            return (
              <div className="budget-target" onClick={(e) => { e.stopPropagation(); onSetTarget?.(budget.categoryId); }}>
                <span className="budget-target__icon"><TypeIcon size={14} /></span>
                <div className="budget-target__content">
                  <span className="budget-target__label">{label} <span className="budget-target__desc">— {desc}</span></span>
                  <div className="budget-target__track">
                    <div className={`budget-target__fill ${fillClass}`} style={{ width: `${assignedProgress * 100}%` }} />
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="budget-target budget-target--empty" onClick={(e) => { e.stopPropagation(); onSetTarget?.(budget.categoryId); }}>
              <Target size={11} />
              <span className="budget-target__empty-text">Set target</span>
            </div>
          )}
        </div>
        <div className="budget-row__assigned cell--number">
          <AssignmentInput value={budget.assigned} onCommit={handleAssign} />
        </div>
        <div className="budget-row__activity cell--computed">
          <span className={budget.activity < 0 ? 'money money--negative' : 'money'}>{formatCurrency(budget.activity)}</span>
        </div>
        <div className="budget-row__available cell--computed">
          <span className={`badge badge--${availableVariant}`}>
            {formatCurrency(Math.abs(budget.available))}
          </span>
        </div>
        <div className="budget-row__health">
          <HealthRing available={budget.available} activity={budget.activity} />
        </div>
        <div className="budget-row__status">
          <span className="budget-row__status-label" style={{ color: statusLabel.color }} onClick={handleStatusClick}>
            <StatusIcon size={12} />
            <span className="budget-row__status-text">{statusLabel.text}</span>
          </span>
        </div>
      </div>
      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="ctx-menu"
          style={{ position: 'fixed', left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px`, zIndex: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxSub === 'groups' ? (
            <>
              <div className="ctx-menu__item ctx-menu__item--back" onClick={() => setCtxSub(null)}>
                <ChevronLeft size={12} /> Back
              </div>
              <div className="ctx-menu__sep" />
              {otherGroups.map((g) => (
                <div key={g.id} className="ctx-menu__item" onClick={() => { closeCtxMenu(); onMove(g.id); }}>
                  {g.name}
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="ctx-menu__item" onClick={() => { closeCtxMenu(); onViewDetail?.(budget.categoryId); }}>View transactions...</div>
              <div className="ctx-menu__item" onClick={() => { closeCtxMenu(); onCoverFrom?.(budget.categoryId); }}>Move budget...</div>
              <div className="ctx-menu__item" onClick={() => { closeCtxMenu(); onSetTarget?.(budget.categoryId); }}>Set target...</div>
              <div className="ctx-menu__item" onClick={() => { closeCtxMenu(); setIconPickerOpen(true); }}>Change icon...</div>
              {otherGroups.length > 0 && (
                <div className="ctx-menu__item" onClick={() => setCtxSub('groups')}>Change group...</div>
              )}
              <div className="ctx-menu__sep" />
              <div className="ctx-menu__item" onClick={() => { closeCtxMenu(); onRename(); }}>Rename</div>
              <div className="ctx-menu__item ctx-menu__item--danger" onClick={() => { closeCtxMenu(); onDelete(); }}>Delete</div>
            </>
          )}
        </div>
      )}
    </>
  );
});
