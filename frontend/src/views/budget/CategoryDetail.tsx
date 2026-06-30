import { createSignal, Show, type Component } from 'solid-js'
import { ArrowRightLeft, Target } from 'lucide-solid'
import { formatMoneyUnsigned } from '~/lib/format'
import MoneyDisplay from '~/components/MoneyDisplay'
import { AmountInput } from '~/components/CellInputs'
import TransactionTable from '~/views/accounts/TransactionTable'
import type { CategoryBudget } from '~/lib/budget-engine'

interface CategoryDetailProps {
  budget: CategoryBudget
  onMoveBudget?: (catId: string) => void
  onSetTarget?: (catId: string) => void
  onAssign?: (catId: string, amount: number) => void
}

const CategoryDetail: Component<CategoryDetailProps> = (props) => {
  const [editingAssigned, setEditingAssigned] = createSignal(false)

  return (
    <>
      <div class="detail-dialog__summary">
        <div class="detail-dialog__stat">
          <span class="detail-dialog__stat-label">Assigned</span>
          <span class="detail-dialog__stat-value detail-dialog__stat-value--editable" onClick={() => setEditingAssigned(true)}>
            <Show when={editingAssigned()} fallback={formatMoneyUnsigned(props.budget.assigned)}>
              <AmountInput
                amount={props.budget.assigned}
                showSign={false}
                onCommit={(v) => { props.onAssign?.(props.budget.categoryId, v); setEditingAssigned(false) }}
                onCancel={() => setEditingAssigned(false)}
              />
            </Show>
          </span>
        </div>
        <div class="detail-dialog__stat">
          <span class="detail-dialog__stat-label">Activity</span>
          <span class="detail-dialog__stat-value"><MoneyDisplay amount={props.budget.activity} /></span>
        </div>
        <div class="detail-dialog__stat">
          <span class="detail-dialog__stat-label">Available</span>
          <span class="detail-dialog__stat-value">
            <MoneyDisplay amount={props.budget.available} />
            <button
              class="detail-dialog__action-icon"
              title="Move budget"
              onClick={() => props.onMoveBudget?.(props.budget.categoryId)}
            >
              <ArrowRightLeft size={12} />
            </button>
          </span>
        </div>
        <div class="detail-dialog__stat">
          <span class="detail-dialog__stat-label">Target</span>
          <span class="detail-dialog__stat-value">
            <Show when={props.budget.target} fallback={<span class="detail-dialog__stat-muted">None</span>}>
              {(t) => <span>{formatMoneyUnsigned(t().targetAmount)} ({t().targetType})</span>}
            </Show>
            <button
              class="detail-dialog__action-icon"
              title="Set target"
              onClick={() => props.onSetTarget?.(props.budget.categoryId)}
            >
              <Target size={12} />
            </button>
          </span>
        </div>
      </div>
      <TransactionTable categoryId={props.budget.categoryId} compact />
    </>
  )
}

export default CategoryDetail
