import { createSignal, createMemo, onMount, onCleanup, For, Show, type Component } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { Plus, CreditCard } from 'lucide-solid'
import { ACCOUNT_TYPE_ICONS } from '~/lib/icons'
import { useStore } from '~/App'
import { createQuery } from '~/lib/solid-binding'
import { formatMoneyUnsigned } from '~/lib/format'
import { apiPost, apiPatch, apiDelete } from '~/lib/api'
import { pushUndo } from '~/lib/undo'
import { clampMenuPosition } from '~/lib/ui'
import { confirmAction } from '~/components/ConfirmDialog'
import EntityPicker, { type EntityPickerSection } from '~/components/EntityPicker'
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

function typeLabel(type: string): string {
  return ACCOUNT_TYPES.find(t => t.id === type)?.label ?? type
}

type CellField = 'name' | 'type'

const AccountsView: Component = () => {
  const { raw, reactive } = useStore()
  const navigate = useNavigate()
  const accounts = createQuery(reactive, 'accounts')
  const transactions = createQuery(reactive, 'transactions')

  // Add dialog state
  const [isDialogOpen, setIsDialogOpen] = createSignal(false)
  const [addMore, setAddMore] = createSignal(false)
  const [newName, setNewName] = createSignal('')
  const [newType, setNewType] = createSignal('checking')
  const [showNewTypePicker, setShowNewTypePicker] = createSignal(false)
  const [nameError, setNameError] = createSignal('')
  let pickerJustClosed = false

  // Per-cell edit state
  const [editingRowId, setEditingRowId] = createSignal<string | null>(null)
  const [activeCell, setActiveCell] = createSignal<CellField | null>(null)

  // Context menu state
  const [ctxMenu, setCtxMenu] = createSignal<{ x: number; y: number; account: Record } | null>(null)

  const activeAccounts = () => accounts().filter(a => !(a.deleted_at as string))

  const accountStats = createMemo(() => {
    const stats = new Map<string, { balance: number; txCount: number }>()
    for (const acc of activeAccounts()) {
      stats.set(acc.id as string, { balance: 0, txCount: 0 })
    }
    for (const tx of transactions()) {
      const accId = tx.account_id as string
      const s = stats.get(accId)
      if (s) {
        s.balance += tx.amount as number
        s.txCount += 1
      }
    }
    return stats
  })

  // --- Add dialog ---
  function openDialog() { setIsDialogOpen(true) }
  function closeDialog() { setIsDialogOpen(false); resetForm() }
  function resetForm() { setNewName(''); setNewType('checking'); setNameError(''); setShowNewTypePicker(false) }
  function resetForAddMore() { setNewName(''); setNameError(''); setShowNewTypePicker(false) }

  function cancelNewTypePicker() {
    pickerJustClosed = true
    setShowNewTypePicker(false)
    setTimeout(() => { pickerJustClosed = false }, 50)
  }

  async function handleAddAccount() {
    const name = newName().trim()
    if (!name) { setNameError('Account name is required'); return }
    const duplicate = activeAccounts().find(a => (a.name as string).toLowerCase() === name.toLowerCase())
    if (duplicate) { setNameError(`Account "${name}" already exists`); return }
    setNameError('')

    const id = crypto.randomUUID()
    const payeeId = crypto.randomUUID()
    const now = new Date().toISOString()
    const record = { id, name, type: newType(), sort_order: activeAccounts().length, created_at: now, deleted_at: null }
    const payeeRecord = { id: payeeId, name, type: 'account', account_id: id, created_at: now }

    await raw.put('accounts', record)
    await raw.put('payees', payeeRecord)
    reactive.notify('accounts')
    reactive.notify('payees')

    apiPost('/api/accounts', { name, type: newType() }).catch(() => {})

    pushUndo({
      description: `Created account "${name}"`,
      async undo() { await raw.delete('accounts', id); await raw.delete('payees', payeeId); reactive.notify('accounts'); reactive.notify('payees') },
      async redo() { await raw.put('accounts', record); await raw.put('payees', payeeRecord); reactive.notify('accounts'); reactive.notify('payees') },
    })

    if (addMore()) { resetForAddMore() } else { closeDialog() }
  }

  // --- Per-cell editing ---
  function startCell(accountId: string, field: CellField, e?: MouseEvent) {
    if (e) e.stopPropagation()
    setEditingRowId(accountId)
    setActiveCell(field)
  }

  function endCell() {
    setEditingRowId(null)
    setActiveCell(null)
  }

  async function commitName(account: Record, newNameVal: string) {
    const name = newNameVal.trim()
    if (!name || name === (account.name as string)) { endCell(); return }

    const oldRecord = { ...account }
    const updated = { ...account, name }
    await raw.put('accounts', updated)
    reactive.notify('accounts')

    apiPatch(`/api/accounts/${account.id}`, { name }).catch(() => {})

    pushUndo({
      description: `Renamed account "${oldRecord.name}" → "${name}"`,
      async undo() { await raw.put('accounts', oldRecord); reactive.notify('accounts') },
      async redo() { await raw.put('accounts', updated); reactive.notify('accounts') },
    })

    endCell()
  }

  async function commitType(account: Record, newTypeVal: string) {
    if (newTypeVal === (account.type as string)) { endCell(); return }

    const oldRecord = { ...account }
    const updated = { ...account, type: newTypeVal }
    await raw.put('accounts', updated)
    reactive.notify('accounts')

    apiPatch(`/api/accounts/${account.id}`, { type: newTypeVal }).catch(() => {})

    pushUndo({
      description: `Changed account "${account.name}" type to "${newTypeVal}"`,
      async undo() { await raw.put('accounts', oldRecord); reactive.notify('accounts') },
      async redo() { await raw.put('accounts', updated); reactive.notify('accounts') },
    })

    endCell()
  }

  // --- Delete ---
  async function deleteAccount(id: string, name: string) {
    const txns = await raw.query('transactions', { where: { account_id: id } })
    if (txns.length > 0) {
      await confirmAction({
        message: `Cannot delete "${name}" — it has ${txns.length} transaction${txns.length > 1 ? 's' : ''}. Move or delete them first.`,
        actionLabel: 'OK',
        danger: false,
      })
      return
    }
    const confirmed = await confirmAction({ message: `Delete "${name}"?`, actionLabel: 'Delete Account' })
    if (!confirmed) return

    const record = await raw.get('accounts', id)
    await raw.delete('accounts', id)
    reactive.notify('accounts')

    apiDelete(`/api/accounts/${id}`).catch(() => {})

    pushUndo({
      description: `Deleted account "${name}"`,
      async undo() { if (record) { await raw.put('accounts', record); reactive.notify('accounts') } },
      async redo() { await raw.delete('accounts', id); reactive.notify('accounts') },
    })
  }

  // --- Navigation ---
  function handleRowClick(account: Record) {
    if (editingRowId() === (account.id as string)) return
    navigate(`/transactions?account=${account.id}`)
  }

  // --- Context menu ---
  function handleContextMenu(e: MouseEvent, account: Record) {
    e.preventDefault()
    const pos = clampMenuPosition(e.clientX, e.clientY)
    setCtxMenu({ x: pos.x, y: pos.y, account })
  }

  function closeCtxMenu() { setCtxMenu(null) }

  onMount(() => {
    document.addEventListener('click', closeCtxMenu)
    onCleanup(() => document.removeEventListener('click', closeCtxMenu))
  })

  // --- Global keyboard ---
  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'n') {
      e.preventDefault()
      if (!isDialogOpen()) openDialog()
    }
    if (e.key === 'Escape' && isDialogOpen()) {
      if (pickerJustClosed || showNewTypePicker()) return
      closeDialog()
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleGlobalKeydown)
    onCleanup(() => document.removeEventListener('keydown', handleGlobalKeydown))
  })

  return (
    <div class="accounts-view">
      <div class="accounts-view__topbar">
        <h1 class="accounts-view__title">Accounts</h1>
      </div>

      <Show when={activeAccounts().length > 0} fallback={
        <div class="empty-state">
          <div class="empty-state__icon"><CreditCard size={32} /></div>
          <p class="empty-state__title">No accounts yet</p>
          <p class="empty-state__desc">Create your first account to start tracking transactions.</p>
          <div class="empty-state__actions">
            <button class="btn btn--primary" onClick={openDialog}>Create First Account</button>
          </div>
        </div>
      }>
      <div class="accounts-table">
        {/* Add trigger */}
        <div class="add-txn-trigger" onClick={openDialog}>
          <span class="add-txn-trigger__icon"><Plus size={16} /></span>
          <span class="add-txn-trigger__label">Add account...</span>
          <span class="add-txn-trigger__shortcut">⌘⇧N</span>
        </div>

        {/* Header */}
        <div class="accounts-table__header">
          <div class="accounts-table__col accounts-table__col--name">NAME</div>
          <div class="accounts-table__col accounts-table__col--type">TYPE</div>
          <div class="accounts-table__col accounts-table__col--balance">BALANCE</div>
          <div class="accounts-table__col accounts-table__col--count">TRANSACTIONS</div>
        </div>

        {/* Rows */}
        <div class="accounts-table__body">
            <For each={activeAccounts()}>
              {(account) => {
                const stats = () => accountStats().get(account.id as string) ?? { balance: 0, txCount: 0 }
                const isEditing = () => editingRowId() === (account.id as string)
                return (
                  <div
                    class="accounts-table__row"
                    onClick={() => handleRowClick(account)}
                    onContextMenu={(e) => handleContextMenu(e, account)}
                  >
                    {/* Name cell — editable */}
                    <div class="accounts-table__col accounts-table__col--name cell--text" onClick={(e) => startCell(account.id as string, 'name', e)}>
                      <Show when={isEditing() && activeCell() === 'name'} fallback={
                        <span class="accounts-table__name-content">
                          <span class="accounts-table__type-icon">{(() => { const I = ACCOUNT_TYPE_ICONS[(account.type as string) ?? 'checking'] ?? CreditCard; return <I size={14} /> })()}</span>
                          {account.name as string}
                        </span>
                      }>
                        <input
                          class="txn-cell-input"
                          type="text"
                          value={account.name as string}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitName(account, (e.target as HTMLInputElement).value); if (e.key === 'Escape') endCell() }}
                          onBlur={(e) => commitName(account, e.currentTarget.value)}
                          ref={(el) => setTimeout(() => { el.focus(); el.select() }, 0)}
                        />
                      </Show>
                    </div>

                    {/* Type cell — editable via picker */}
                    <div class="accounts-table__col accounts-table__col--type cell--select" onClick={(e) => startCell(account.id as string, 'type', e)}>
                      <Show when={isEditing() && activeCell() === 'type'} fallback={<span>{typeLabel(account.type as string ?? 'checking')}</span>}>
                        <EntityPicker
                          sections={typeSections}
                          value={account.type as string ?? 'checking'}
                          placeholder="Select type..."
                          onPick={(id) => commitType(account, id)}
                          onCreate={() => {}}
                          onCancel={endCell}
                        />
                      </Show>
                    </div>

                    {/* Balance — computed, navigates */}
                    <div class="accounts-table__col accounts-table__col--balance cell--computed">
                      <span class={stats().balance >= 0 ? 'money--positive' : 'money--negative'}>
                        {stats().balance < 0 ? '-' : ''}{formatMoneyUnsigned(Math.abs(stats().balance))}
                      </span>
                    </div>

                    {/* Tx count — computed, navigates */}
                    <div class="accounts-table__col accounts-table__col--count cell--computed">{stats().txCount}</div>
                  </div>
                )
              }}
            </For>
        </div>
      </div>
      </Show>

      {/* Context menu */}
      <Show when={ctxMenu()}>
        {(menu) => (
          <div class="ctx-menu" style={{ position: 'fixed', left: `${menu().x}px`, top: `${menu().y}px` }}>
            <div class="ctx-menu__item" onClick={() => { startCell(menu().account.id as string, 'name'); closeCtxMenu() }}>Edit</div>
            <div class="ctx-menu__sep" />
            <div class="ctx-menu__item ctx-menu__item--danger" onClick={() => { deleteAccount(menu().account.id as string, menu().account.name as string); closeCtxMenu() }}>Delete</div>
          </div>
        )}
      </Show>

      {/* Add Account Dialog */}
      <Show when={isDialogOpen()}>
        <div class="add-txn-overlay" onClick={closeDialog}>
          <div class="add-txn-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape' && !pickerJustClosed && !showNewTypePicker()) closeDialog() }}>
            <div class="add-txn-dialog__header">
              <div class="add-txn-dialog__title">
                <span class="add-txn-dialog__icon"><Plus size={16} /></span>
                <span>New Account</span>
              </div>
              <button class="add-txn-dialog__close" onClick={closeDialog}>Esc</button>
            </div>
            <div class="add-txn-dialog__body">
              <div class="add-txn-dialog__field">
                <label class="add-txn-dialog__label">Name</label>
                <div class="add-txn-dialog__input-wrap">
                  <input
                    class={`add-txn-dialog__input ${nameError() ? 'input--error' : ''}`}
                    type="text"
                    placeholder="Account name..."
                    value={newName()}
                    onInput={(e) => { setNewName(e.currentTarget.value); setNameError('') }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAddAccount() } }}
                    ref={(el) => setTimeout(() => el.focus(), 50)}
                  />
                  <Show when={nameError()}><span class="field-error">{nameError()}</span></Show>
                </div>
              </div>
              <div class="add-txn-dialog__field">
                <label class="add-txn-dialog__label">Type</label>
                <div class="add-txn-dialog__input-wrap" style={{ position: 'relative' }}>
                  <div class="add-txn-dialog__input add-txn-dialog__input--select" onClick={() => setShowNewTypePicker(true)}>
                    {typeLabel(newType())} ▾
                  </div>
                  <Show when={showNewTypePicker()}>
                    <EntityPicker
                      sections={typeSections}
                      value={newType()}
                      placeholder="Select type..."
                      onPick={(id) => { setNewType(id); setShowNewTypePicker(false) }}
                      onCreate={() => {}}
                      onCancel={cancelNewTypePicker}
                    />
                  </Show>
                </div>
              </div>
            </div>
            <div class="add-txn-dialog__footer">
              <div class="add-txn-dialog__footer-left">
                <label class="add-txn-dialog__add-more">
                  <input type="checkbox" checked={addMore()} onChange={(e) => setAddMore(e.currentTarget.checked)} />
                  <span>Add more</span>
                </label>
              </div>
              <div class="add-txn-dialog__footer-right">
                <button class="btn btn--sm btn--primary" onClick={() => handleAddAccount()}>Add ⌘Enter</button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}

export default AccountsView
