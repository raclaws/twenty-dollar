import { createSignal, createEffect, onCleanup, Show, type Component, type Accessor } from 'solid-js'
import { Trash2, Eye, Target, ArrowRightLeft } from 'lucide-solid'
import MoneyDisplay from './MoneyDisplay'
import HealthRing from './HealthRing'
import { AmountInput } from './CellInputs'
import { formatMoneyUnsigned } from '~/lib/format'
import { useStore } from '~/App'
import { apiPost } from '~/lib/api'
import { pushUndo } from '~/lib/undo'
import type { CategoryBudget } from '~/lib/budget-engine'

interface BudgetSheetProps {
  budget: CategoryBudget
  month: Accessor<string>
  onClose: () => void
  onViewDetail?: (catId: string) => void
  onSetTarget?: (catId: string) => void
  onCoverFrom?: (catId: string) => void
  onMoveTo?: (catId: string) => void
}

const BudgetSheet: Component<BudgetSheetProps> = (props) => {
  const { raw, reactive } = useStore()
  const [editingAssigned, setEditingAssigned] = createSignal(false)
  let sheetRef: HTMLDivElement | undefined
  let triggerRef: HTMLElement | null = document.activeElement as HTMLElement

  createEffect(() => {
    if (!sheetRef) return
    const focusables = sheetRef.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (focusables.length > 0) focusables[0].focus()

    const toInert = document.querySelectorAll('.sidebar, .mobile-nav')
    toInert.forEach(el => el.setAttribute('inert', ''))

    onCleanup(() => {
      toInert.forEach(el => el.removeAttribute('inert'))
      triggerRef?.focus()
    })
  })

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (editingAssigned()) {
        setEditingAssigned(false)
        e.stopPropagation()
      } else {
        props.onClose()
      }
    }
  }

  function handleScrimClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('txn-sheet-scrim')) {
      props.onClose()
    }
  }

  async function handleAssign(newAmount: number) {
    const oldAmount = props.budget.assigned
    if (newAmount === oldAmount) { setEditingAssigned(false); return }
    const categoryId = props.budget.categoryId
    const month = props.month() // capture before any await

    const existingAssignments = await raw.query('assignments', {
      where: { category_id: categoryId, month },
    })

    const id = existingAssignments.length > 0
      ? existingAssignments[0].id as string
      : crypto.randomUUID()

    const record = { id, category_id: categoryId, month, amount: newAmount }

    await raw.put('assignments', record)
    reactive.notify('assignments')
    await new Promise(r => setTimeout(r, 0))

    apiPost('/api/budget/assign', { category_id: categoryId, month, amount: newAmount }).catch(() => {})

    pushUndo({
      description: `Assigned ${formatMoneyUnsigned(newAmount)} to ${props.budget.categoryName}`,
      async undo() {
        if (oldAmount === 0 && existingAssignments.length === 0) {
          await raw.delete('assignments', id)
        } else {
          await raw.put('assignments', { id, category_id: categoryId, month, amount: oldAmount })
        }
        reactive.notify('assignments')
        apiPost('/api/budget/assign', { category_id: categoryId, month, amount: oldAmount }).catch(() => {})
      },
      async redo() {
        await raw.put('assignments', record)
        reactive.notify('assignments')
        apiPost('/api/budget/assign', { category_id: categoryId, month, amount: newAmount }).catch(() => {})
      },
    })

    setEditingAssigned(false)
  }

  const availableClass = () => {
    if (props.budget.available > 0) return 'money--positive'
    if (props.budget.available < 0) return 'money--negative'
    return ''
  }

  return (
    <>
      <div class="txn-sheet-scrim" onClick={handleScrimClick} />
      <div
        ref={sheetRef}
        class="txn-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${props.budget.categoryName} budget`}
        onKeyDown={handleKeyDown}
      >
        <div class="txn-sheet__handle" aria-hidden="true" />

        {/* Hero */}
        <div class="txn-sheet__hero">
          <div class="txn-sheet__hero-amount">
            <HealthRing available={props.budget.available} activity={props.budget.activity} size={28} />
            <span style={{ "margin-left": "var(--sp-2)" }}>{props.budget.categoryName}</span>
          </div>
          <div class={`txn-sheet__hero-category ${availableClass()}`} style={{ "font-size": "var(--fs-xl)", "font-weight": "var(--fw-bold)", "margin-top": "var(--sp-2)" }}>
            <MoneyDisplay amount={props.budget.available} /> available
          </div>
        </div>

        {/* Fields */}
        <div class="txn-sheet__fields">
          {/* Assigned — editable */}
          <Show when={!editingAssigned()}>
            <button
              type="button"
              class="txn-sheet__field"
              onClick={() => setEditingAssigned(true)}
            >
              <span class="txn-sheet__field-label">Assigned</span>
              <span class="txn-sheet__field-value">
                <MoneyDisplay amount={props.budget.assigned} />
              </span>
            </button>
          </Show>
          <Show when={editingAssigned()}>
            <div class="txn-sheet__field txn-sheet__field--active">
              <span class="txn-sheet__field-label">Assigned</span>
              <div class="txn-sheet__picker-area" style={{ flex: 1 }}>
                <AmountInput
                  amount={props.budget.assigned}
                  showSign={false}
                  onCommit={handleAssign}
                  onCancel={() => setEditingAssigned(false)}
                />
              </div>
            </div>
          </Show>

          {/* Activity — read-only */}
          <div class="txn-sheet__field" style={{ cursor: "default" }}>
            <span class="txn-sheet__field-label">Activity</span>
            <span class="txn-sheet__field-value">
              <MoneyDisplay amount={props.budget.activity} />
            </span>
          </div>

          {/* Target — read-only display + action */}
          <button
            type="button"
            class="txn-sheet__field"
            onClick={() => { props.onSetTarget?.(props.budget.categoryId); props.onClose() }}
          >
            <span class="txn-sheet__field-label">Target</span>
            <span class={`txn-sheet__field-value ${!props.budget.target ? 'txn-sheet__field-value--empty' : ''}`}>
              {props.budget.target
                ? `${formatMoneyUnsigned(props.budget.target.targetAmount)} / mo`
                : 'No target set'}
            </span>
          </button>
        </div>

        {/* Actions */}
        <div class="txn-sheet__actions" style={{ "flex-wrap": "wrap" }}>
          <button type="button" class="txn-sheet__btn-delete" style={{ flex: "1 1 45%" }} onClick={() => { props.onViewDetail?.(props.budget.categoryId); props.onClose() }}>
            <Eye size={14} /> Transactions
          </button>
          <button type="button" class="txn-sheet__btn-delete" style={{ flex: "1 1 45%" }} onClick={() => { props.onCoverFrom?.(props.budget.categoryId); props.onClose() }}>
            <ArrowRightLeft size={14} /> Move budget
          </button>
          <button type="button" class="txn-sheet__btn-done" onClick={props.onClose}>
            Done
          </button>
        </div>
      </div>
    </>
  )
}

export default BudgetSheet
