import { createSignal, createEffect, onCleanup, Show, type Component } from 'solid-js'
import { X, Trash2 } from 'lucide-solid'
import MoneyDisplay from './MoneyDisplay'
import { PayeePicker, CategoryPicker } from './Pickers'
import { DatePicker, AmountInput } from './CellInputs'
import { useStore } from '~/App'
import { createQuery } from '~/lib/solid-binding'
import { apiPatch, apiDelete } from '~/lib/api'
import { serverFirst } from '~/lib/server-first'
import { pushUndo } from '~/lib/undo'
import { confirmAction } from './ConfirmDialog'
import { formatMoneyUnsigned } from '~/lib/format'
import type { Record } from '~/lib/sync-engine/types'

type ActiveField = 'date' | 'payee' | 'category' | 'amount' | 'memo' | null

interface TransactionSheetProps {
  tx: Record
  onClose: () => void
  onDeleted?: () => void
}

const TransactionSheet: Component<TransactionSheetProps> = (props) => {
  const { raw, reactive } = useStore()
  const categories = createQuery(reactive, 'categories')
  const categoryGroups = createQuery(reactive, 'category_groups')
  const accounts = createQuery(reactive, 'accounts')
  const payees = createQuery(reactive, 'payees')

  const [activeField, setActiveField] = createSignal<ActiveField>(null)
  let sheetRef: HTMLDivElement | undefined
  let triggerRef: HTMLElement | null = null

  // Store trigger element for focus restore
  triggerRef = document.activeElement as HTMLElement

  // Focus trap
  createEffect(() => {
    if (!sheetRef) return
    const focusables = sheetRef.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (focusables.length > 0) focusables[0].focus()

    // Set inert on siblings of the sheet's portal-like position
    // We target .sidebar and .mobile-nav specifically, not .main (which contains us)
    const toInert = document.querySelectorAll('.sidebar, .mobile-nav')
    toInert.forEach(el => el.setAttribute('inert', ''))

    onCleanup(() => {
      toInert.forEach(el => el.removeAttribute('inert'))
      triggerRef?.focus()
    })
  })

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (activeField()) {
        setActiveField(null)
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

  // Derived values
  const payeeName = () => {
    const pid = props.tx.payee_id as string | null
    if (pid) {
      const p = payees().find(p => p.id === pid)
      if (p) return p.name as string
    }
    return (props.tx.payee as string) ?? ''
  }

  const categoryName = () => {
    const catId = props.tx.category_id as string | null
    if (!catId) return ''
    const cat = categories().find(c => c.id === catId)
    return cat ? cat.name as string : ''
  }

  const amount = () => props.tx.amount as number
  const isInflow = () => amount() > 0

  const knownPayees = () =>
    payees().filter(p => (p.type as string) === 'external').map(p => ({ id: p.id as string, name: p.name as string }))

  // Commit logic (mirrors TransactionRow)
  async function commitField(field: string, newValue: unknown) {
    if (newValue === props.tx[field]) return
    const id = props.tx.id as string
    const oldRecord = { ...props.tx }
    const updated = { ...props.tx, [field]: newValue }

    await serverFirst({
      async optimistic() {
        await raw.put('transactions', updated)
        reactive.notify('transactions')
      },
      request: () => apiPatch(`/api/transactions/${id}`, { [field]: newValue }),
      async rollback() {
        await raw.put('transactions', oldRecord)
        reactive.notify('transactions')
      },
    })

    pushUndo({
      description: `Edited ${field}`,
      async undo() {
        await raw.put('transactions', oldRecord)
        reactive.notify('transactions')
      },
      async redo() {
        await raw.put('transactions', updated)
        reactive.notify('transactions')
      },
    })
  }

  async function commitPayee(payeeId: string) {
    if (payeeId === '__none__') {
      await commitField('payee_id', null)
    } else {
      await commitField('payee_id', payeeId)
    }
    setActiveField(null)
  }

  async function commitCategory(catId: string) {
    if (catId === '__none__') {
      await commitField('category_id', null)
    } else {
      await commitField('category_id', catId)
    }
    setActiveField(null)
  }

  async function commitDate(date: string) {
    await commitField('date', date)
    setActiveField(null)
  }

  async function commitAmount(val: number) {
    await commitField('amount', val)
    setActiveField(null)
  }

  async function commitMemo(e: FocusEvent) {
    const val = (e.target as HTMLInputElement).value
    if (val !== (props.tx.memo as string ?? '')) {
      await commitField('memo', val || null)
    }
    setActiveField(null)
  }

  async function handleDelete() {
    const confirmed = await confirmAction({ message: 'Delete this transaction?', actionLabel: 'Delete' })
    if (!confirmed) return
    const id = props.tx.id as string
    const oldRecord = { ...props.tx }
    await serverFirst({
      async optimistic() {
        await raw.delete('transactions', id)
        reactive.notify('transactions')
      },
      request: () => apiDelete(`/api/transactions/${id}`),
      async rollback() {
        await raw.put('transactions', oldRecord)
        reactive.notify('transactions')
      },
    })
    pushUndo({
      description: 'Deleted transaction',
      async undo() {
        await raw.put('transactions', oldRecord)
        reactive.notify('transactions')
      },
      async redo() {
        await raw.delete('transactions', id)
        reactive.notify('transactions')
      },
    })
    props.onDeleted?.()
    props.onClose()
  }

  return (
    <>
      <div class="txn-sheet-scrim" onClick={handleScrimClick} />
      <div
        ref={sheetRef}
        class="txn-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Edit transaction"
        onKeyDown={handleKeyDown}
      >
        <div class="txn-sheet__handle" aria-hidden="true" />

        {/* Hero */}
        <div class="txn-sheet__hero">
          <div class={`txn-sheet__hero-amount ${isInflow() ? 'money--positive' : ''}`}>
            {isInflow() ? '+' : '-'}{formatMoneyUnsigned(Math.abs(amount()))}
          </div>
          <div class="txn-sheet__hero-category">{categoryName() || 'Uncategorized'}</div>
        </div>

        {/* Fields */}
        <div class="txn-sheet__fields">
          {/* Date */}
          <button
            type="button"
            class={`txn-sheet__field ${activeField() === 'date' ? 'txn-sheet__field--active' : ''}`}
            onClick={() => setActiveField(activeField() === 'date' ? null : 'date')}
          >
            <span class="txn-sheet__field-label">Date</span>
            <span class="txn-sheet__field-value">{props.tx.date as string}</span>
          </button>
          <Show when={activeField() === 'date'}>
            <div class="txn-sheet__picker-area">
              <DatePicker value={props.tx.date as string} onCommit={commitDate} onCancel={() => setActiveField(null)} />
            </div>
          </Show>

          {/* Payee */}
          <button
            type="button"
            class={`txn-sheet__field ${activeField() === 'payee' ? 'txn-sheet__field--active' : ''}`}
            onClick={() => setActiveField(activeField() === 'payee' ? null : 'payee')}
          >
            <span class="txn-sheet__field-label">Payee</span>
            <span class={`txn-sheet__field-value ${!payeeName() ? 'txn-sheet__field-value--empty' : ''}`}>
              {payeeName() || 'None'}
            </span>
          </button>
          <Show when={activeField() === 'payee'}>
            <div class="txn-sheet__picker-area">
              <PayeePicker
                value={props.tx.payee_id as string ?? ''}
                knownPayees={knownPayees()}
                accounts={accounts()}
                onPick={commitPayee}
                onCancel={() => setActiveField(null)}
              />
            </div>
          </Show>

          {/* Category */}
          <button
            type="button"
            class={`txn-sheet__field ${activeField() === 'category' ? 'txn-sheet__field--active' : ''}`}
            onClick={() => setActiveField(activeField() === 'category' ? null : 'category')}
          >
            <span class="txn-sheet__field-label">Category</span>
            <span class={`txn-sheet__field-value ${!categoryName() ? 'txn-sheet__field-value--empty' : ''}`}>
              {categoryName() || 'Uncategorized'}
            </span>
          </button>
          <Show when={activeField() === 'category'}>
            <div class="txn-sheet__picker-area">
              <CategoryPicker
                value={props.tx.category_id as string ?? ''}
                groups={categoryGroups()}
                categories={categories()}
                onPick={commitCategory}
                onCancel={() => setActiveField(null)}
              />
            </div>
          </Show>

          {/* Amount */}
          <button
            type="button"
            class={`txn-sheet__field ${activeField() === 'amount' ? 'txn-sheet__field--active' : ''}`}
            onClick={() => setActiveField(activeField() === 'amount' ? null : 'amount')}
          >
            <span class="txn-sheet__field-label">Amount</span>
            <span class="txn-sheet__field-value">
              <MoneyDisplay amount={amount()} />
            </span>
          </button>
          <Show when={activeField() === 'amount'}>
            <div class="txn-sheet__picker-area">
              <AmountInput
                amount={amount()}
                showSign={true}
                onCommit={(v) => commitAmount(v)}
                onCancel={() => setActiveField(null)}
              />
            </div>
          </Show>

          {/* Memo */}
          <Show when={activeField() !== 'memo'}>
            <button
              type="button"
              class={`txn-sheet__field ${activeField() === 'memo' ? 'txn-sheet__field--active' : ''}`}
              onClick={() => setActiveField('memo')}
            >
              <span class="txn-sheet__field-label">Memo</span>
              <span class={`txn-sheet__field-value ${!(props.tx.memo as string) ? 'txn-sheet__field-value--empty' : ''}`}>
                {(props.tx.memo as string) || 'None'}
              </span>
            </button>
          </Show>
          <Show when={activeField() === 'memo'}>
            <div class="txn-sheet__field txn-sheet__field--active">
              <span class="txn-sheet__field-label">Memo</span>
              <input
                type="text"
                class="txn-sheet__memo-input"
                value={(props.tx.memo as string) ?? ''}
                onBlur={commitMemo}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                autofocus
              />
            </div>
          </Show>
        </div>

        {/* Actions */}
        <div class="txn-sheet__actions">
          <button type="button" class="txn-sheet__btn-delete" onClick={handleDelete}>
            <Trash2 size={14} /> Delete
          </button>
          <button type="button" class="txn-sheet__btn-done" onClick={props.onClose}>
            Done
          </button>
        </div>
      </div>
    </>
  )
}

export default TransactionSheet
