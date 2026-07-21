import { createSignal, createEffect, onCleanup, Show, type Component } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { Trash2, ArrowLeftRight, Eye, Scale } from 'lucide-solid'
import { ACCOUNT_TYPE_ICONS } from '~/lib/icons'
import { CreditCard } from 'lucide-solid'
import { formatMoneyUnsigned } from '~/lib/format'
import { useStore } from '~/App'
import { apiPatch, apiDelete } from '~/lib/api'
import { serverFirst } from '~/lib/server-first'
import { pushUndo } from '~/lib/undo'
import { confirmAction } from './ConfirmDialog'
import EntityPicker, { type EntityPickerSection } from './EntityPicker'
import type { Record } from '~/lib/sync-engine/types'

const ACCOUNT_TYPES = [
  { id: 'checking', label: 'Checking' },
  { id: 'savings', label: 'Savings' },
  { id: 'cash', label: 'Cash' },
  { id: 'credit', label: 'Credit' },
]

const typeSections: EntityPickerSection[] = [
  { key: 'types', label: 'Account Type', items: ACCOUNT_TYPES },
]

type ActiveField = 'name' | 'type' | null

interface AccountSheetProps {
  account: Record
  balance: number
  txCount: number
  onClose: () => void
  onDeleted?: () => void
  onReconcile?: (account: Record) => void
}

const AccountSheet: Component<AccountSheetProps> = (props) => {
  const { raw, reactive } = useStore()
  const navigate = useNavigate()
  const [activeField, setActiveField] = createSignal<ActiveField>(null)
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

  const TypeIcon = () => {
    const I = ACCOUNT_TYPE_ICONS[(props.account.type as string) ?? 'checking'] ?? CreditCard
    return <I size={24} />
  }

  async function commitName(value: string) {
    const name = value.trim()
    if (!name || name === (props.account.name as string)) { setActiveField(null); return }

    const oldRecord = { ...props.account }
    const updated = { ...props.account, name }

    await serverFirst({
      async optimistic() {
        await raw.put('accounts', updated)
        reactive.notify('accounts')
      },
      request: () => apiPatch(`/api/accounts/${props.account.id}`, { name }),
      async rollback() {
        await raw.put('accounts', oldRecord)
        reactive.notify('accounts')
      },
    })

    pushUndo({
      description: `Renamed account "${oldRecord.name}" → "${name}"`,
      async undo() { await raw.put('accounts', oldRecord); reactive.notify('accounts') },
      async redo() { await raw.put('accounts', updated); reactive.notify('accounts') },
    })
    setActiveField(null)
  }

  async function commitType(newType: string) {
    if (newType === (props.account.type as string)) { setActiveField(null); return }

    const oldRecord = { ...props.account }
    const updated = { ...props.account, type: newType }

    await serverFirst({
      async optimistic() {
        await raw.put('accounts', updated)
        reactive.notify('accounts')
      },
      request: () => apiPatch(`/api/accounts/${props.account.id}`, { type: newType }),
      async rollback() {
        await raw.put('accounts', oldRecord)
        reactive.notify('accounts')
      },
    })

    pushUndo({
      description: `Changed account type to "${newType}"`,
      async undo() { await raw.put('accounts', oldRecord); reactive.notify('accounts') },
      async redo() { await raw.put('accounts', updated); reactive.notify('accounts') },
    })
    setActiveField(null)
  }

  async function handleDelete() {
    const name = props.account.name as string
    if (props.txCount > 0) {
      await confirmAction({
        message: `Cannot delete "${name}" — it has ${props.txCount} transaction${props.txCount > 1 ? 's' : ''}. Move or delete them first.`,
        actionLabel: 'OK',
        danger: false,
      })
      return
    }
    const confirmed = await confirmAction({ message: `Delete "${name}"?`, actionLabel: 'Delete Account' })
    if (!confirmed) return

    const now = new Date().toISOString()
    const softDeleted = { ...props.account, deleted_at: now }
    await raw.put('accounts', softDeleted)
    reactive.notify('accounts')
    apiDelete(`/api/accounts/${props.account.id}`).catch(() => {})

    pushUndo({
      description: `Deleted account "${name}"`,
      async undo() { await raw.put('accounts', props.account); reactive.notify('accounts') },
      async redo() { await raw.put('accounts', softDeleted); reactive.notify('accounts') },
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
        aria-label={`Edit ${props.account.name as string}`}
        onKeyDown={handleKeyDown}
      >
        <div class="txn-sheet__handle" aria-hidden="true" />

        {/* Hero */}
        <div class="txn-sheet__hero">
          <div class="txn-sheet__hero-amount" style={{ display: 'flex', "align-items": 'center', "justify-content": 'center', gap: 'var(--sp-2)' }}>
            <TypeIcon />
            <span>{props.account.name as string}</span>
          </div>
          <div class={`txn-sheet__hero-category ${props.balance >= 0 ? 'money--positive' : 'money--negative'}`} style={{ "font-size": "var(--fs-xl)", "font-weight": "var(--fw-bold)", "margin-top": "var(--sp-2)" }}>
            {props.balance < 0 ? '-' : ''}{formatMoneyUnsigned(Math.abs(props.balance))}
          </div>
          <div class="txn-sheet__hero-category">{props.txCount} transaction{props.txCount !== 1 ? 's' : ''}</div>
        </div>

        {/* Fields */}
        <div class="txn-sheet__fields">
          {/* Name */}
          <Show when={activeField() !== 'name'}>
            <button type="button" class="txn-sheet__field" onClick={() => setActiveField('name')}>
              <span class="txn-sheet__field-label">Name</span>
              <span class="txn-sheet__field-value">{props.account.name as string}</span>
            </button>
          </Show>
          <Show when={activeField() === 'name'}>
            <div class="txn-sheet__field txn-sheet__field--active">
              <span class="txn-sheet__field-label">Name</span>
              <input
                type="text"
                class="txn-sheet__memo-input"
                value={props.account.name as string}
                onBlur={(e) => commitName(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                autofocus
              />
            </div>
          </Show>

          {/* Type */}
          <button
            type="button"
            class={`txn-sheet__field ${activeField() === 'type' ? 'txn-sheet__field--active' : ''}`}
            onClick={() => setActiveField(activeField() === 'type' ? null : 'type')}
          >
            <span class="txn-sheet__field-label">Type</span>
            <span class="txn-sheet__field-value">
              {ACCOUNT_TYPES.find(t => t.id === (props.account.type as string))?.label ?? props.account.type as string}
            </span>
          </button>
          <Show when={activeField() === 'type'}>
            <div class="txn-sheet__picker-area">
              <EntityPicker
                sections={typeSections}
                value={props.account.type as string ?? 'checking'}
                placeholder="Select type..."
                onPick={commitType}
                onCreate={() => {}}
                onCancel={() => setActiveField(null)}
              />
            </div>
          </Show>

          {/* Balance — read-only */}
          <div class="txn-sheet__field" style={{ cursor: "default" }}>
            <span class="txn-sheet__field-label">Balance</span>
            <span class={`txn-sheet__field-value ${props.balance >= 0 ? 'money--positive' : 'money--negative'}`}>
              {props.balance < 0 ? '-' : ''}{formatMoneyUnsigned(Math.abs(props.balance))}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div class="txn-sheet__actions" style={{ "flex-wrap": "wrap" }}>
          <button type="button" class="txn-sheet__btn-delete" style={{ flex: "1 1 45%" }} onClick={() => { props.onClose(); navigate(`/transactions?account=${props.account.id}`) }}>
            <Eye size={14} /> Transactions
          </button>
          <button type="button" class="txn-sheet__btn-delete" style={{ flex: "1 1 45%" }} onClick={() => { props.onReconcile?.(props.account); props.onClose() }}>
            <Scale size={14} /> Reconcile
          </button>
          <button type="button" class="txn-sheet__btn-delete" style={{ flex: "1 1 45%", background: "var(--c-negative-bg)", color: "var(--c-negative)" }} onClick={handleDelete}>
            <Trash2 size={14} /> Delete
          </button>
          <button type="button" class="txn-sheet__btn-done" style={{ flex: "1 1 45%" }} onClick={props.onClose}>
            Done
          </button>
        </div>
      </div>
    </>
  )
}

export default AccountSheet
