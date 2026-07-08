import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ArrowRightLeft, Target } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { CategoryBudget } from '@/engine/types';
import { AssignmentInput } from './AssignmentInput';

interface CategoryDetailProps {
  budget: CategoryBudget;
  categoryName: string;
  onMoveBudget?: (catId: string) => void;
  onSetTarget?: (catId: string) => void;
  onAssign?: (catId: string, amount: number) => void;
}

export const CategoryDetail = observer(function CategoryDetail({
  budget,
  categoryName,
  onMoveBudget,
  onSetTarget,
  onAssign,
}: CategoryDetailProps) {
  const [editingAssigned, setEditingAssigned] = useState(false);

  return (
    <>
      <div className="detail-dialog__summary">
        <div className="detail-dialog__stat">
          <span className="detail-dialog__stat-label">Assigned</span>
          <span
            className="detail-dialog__stat-value detail-dialog__stat-value--editable"
            onClick={() => setEditingAssigned(true)}
          >
            {editingAssigned ? (
              <AssignmentInput
                value={budget.assigned}
                onCommit={(v) => { onAssign?.(budget.categoryId, v); setEditingAssigned(false); }}
              />
            ) : (
              formatCurrency(budget.assigned)
            )}
          </span>
        </div>
        <div className="detail-dialog__stat">
          <span className="detail-dialog__stat-label">Activity</span>
          <span className="detail-dialog__stat-value">
            <span className={budget.activity < 0 ? 'money money--negative' : 'money'}>
              {formatCurrency(budget.activity)}
            </span>
          </span>
        </div>
        <div className="detail-dialog__stat">
          <span className="detail-dialog__stat-label">Available</span>
          <span className="detail-dialog__stat-value">
            <span className={budget.available < 0 ? 'money money--negative' : 'money'}>
              {formatCurrency(budget.available)}
            </span>
            <button
              className="detail-dialog__action-icon"
              title="Move budget"
              onClick={() => onMoveBudget?.(budget.categoryId)}
            >
              <ArrowRightLeft size={12} />
            </button>
          </span>
        </div>
        <div className="detail-dialog__stat">
          <span className="detail-dialog__stat-label">Target</span>
          <span className="detail-dialog__stat-value">
            {budget.target ? (
              <span>{formatCurrency(budget.target.amount)} ({budget.target.type})</span>
            ) : (
              <span className="detail-dialog__stat-muted">None</span>
            )}
            <button
              className="detail-dialog__action-icon"
              title="Set target"
              onClick={() => onSetTarget?.(budget.categoryId)}
            >
              <Target size={12} />
            </button>
          </span>
        </div>
      </div>
      {/* Transaction table for category would go here */}
      <div className="detail-dialog__transactions">
        <p className="text-sm text-zinc-500">Transactions for {categoryName}</p>
      </div>
    </>
  );
});
