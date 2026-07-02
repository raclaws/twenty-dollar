import { createSignal, Show, type Component } from 'solid-js'
import { Repeat, Download, Lock } from 'lucide-solid'
import MoneyDisplay from '~/components/MoneyDisplay'
import { EntityIcon } from '~/components/IconPicker'
import { PayeePicker, CategoryPicker } from '~/components/Pickers'
import { DatePicker, MemoCell, AmountInput } from '~/components/CellInputs'
import { getInitial, getInitialColor } from '~/lib/icons'
import { useStore } from '~/App'
import { createQuery } from '~/lib/solid-binding'
import { apiPatch } from '~/lib/api'
import { serverFirst } from '~/lib/server-first'
import { pushUndo } from '~/lib/undo'
import type { Record } from '~/lib/sync-engine/types'

type CellField = 'date' | 'payee' | 'category' | 'amount'

const FIELD_ORDER: CellField[] = ['date', 'payee', 'category', 'amount']

interface TransactionRowProps {
  tx: Record
  balance: number
  onContextMenu: (e: MouseEvent, tx: Record) => void
  onSelect?: (txId: string, e: MouseEvent) => void
  onCheckClick?: (txId: string, e: MouseEvent) => void
  onHover?: (txId: string) => void
  selected?: boolean
  showAccount?: boolean
  hideCategory?: boolean
  hideBalance?: boolean
  editingRowId?: string | null
  onEditStart?: (id: string) => void
  onEditEnd?: () => void
  knownPayees: { id: string; name: string }[]
}

const TransactionRow: Component<TransactionRowProps> = (props) => {
  const { raw, reactive } = useStore()
  const categoryGroups = createQuery(reactive, 'category_groups')
  const categories = createQuery(reactive, 'categories')
  const accounts = createQuery(reactive, 'accounts')
  const payees = createQuery(reactive, 'payees')
  const [activeCell, setActiveCell] = createSignal<CellField | null>(null)

  const payeeName = () => {
    const pid = props.tx.payee_id as string | null
    if (pid) {
      const p = payees().find(p => p.id === pid)
      if (p) return p.name as string
    }
    return (props.tx.payee as string) ?? ''
  }

  const isTransfer = () => {
    const pid = props.tx.payee_id as string | null
    if (!pid) return false
    const p = payees().find(p => p.id === pid)
    return p ? (p.type as string) === 'account' : false
  }

  const categoryName = () => {
    const catId = props.tx.category_id as string | null
    if (!catId) return ''
    const cat = categories().find(c => c.id === catId)
    return cat ? cat.name as string : ''
  }

  const categoryIcon = () => {
    const catId = props.tx.category_id as string | null
    if (!catId) return null
    const cat = categories().find(c => c.id === catId)
    return cat ? (cat.icon as string) ?? null : null
  }

  const accountName = () => {
    const accId = props.tx.account_id as string
    const acc = accounts().find(a => a.id === accId)
    return acc ? acc.name as string : ''
  }

  function isActive() {
    return props.editingRowId === (props.tx.id as string)
  }

  const isSystemPayee = () => {
    const p = (props.tx.payee as string) ?? ''
    return p === 'Starting Balance' || p === 'Balance Adjustment' || p === 'Import Carry'
  }

  function startCell(field: CellField, e?: MouseEvent) {
    if (field === 'category' && isTransfer()) return
    if (isSystemPayee() && field !== 'amount') return
    if (e) e.stopPropagation()
    if (props.onEditStart) props.onEditStart(props.tx.id as string)
    setActiveCell(field)
  }

  function endCell() {
    setActiveCell(null)
    if (props.onEditEnd) props.onEditEnd()
  }

  function advanceCell(current: CellField) {
    const idx = FIELD_ORDER.indexOf(current)
    let next = FIELD_ORDER[idx + 1]
    if (next === 'category' && isTransfer()) next = FIELD_ORDER[idx + 2]
    if (next) {
      setActiveCell(next)
    } else {
      endCell()
    }
  }

  async function commitField(field: string, newValue: unknown) {
    if (newValue === props.tx[field]) return
    const id = props.tx.id as string
    const oldRecord = { ...props.tx }
    const updated = { ...props.tx, [field]: newValue }

    const linkedId = props.tx.linked_id as string | null
    let oldLinked: Record | undefined
    if (linkedId && (field === 'date' || field === 'amount' || field === 'memo')) {
      oldLinked = await raw.get('transactions', linkedId)
    }

    await serverFirst({
      async optimistic() {
        await raw.put('transactions', updated)
        reactive.notify('transactions')
        if (oldLinked) {
          const mirrorValue = field === 'amount' ? -(newValue as number) : newValue
          await raw.put('transactions', { ...oldLinked, [field]: mirrorValue })
          reactive.notify('transactions')
        }
      },
      request: () => apiPatch(`/api/transactions/${id}`, { [field]: newValue }),
      async rollback() {
        await raw.put('transactions', oldRecord)
        if (oldLinked) await raw.put('transactions', oldLinked)
        reactive.notify('transactions')
      },
    })

    pushUndo({
      description: `Edited ${field}: ${payeeName() || 'transaction'}`,
      async undo() {
        await raw.put('transactions', oldRecord)
        if (oldLinked) await raw.put('transactions', oldLinked)
        reactive.notify('transactions')
      },
      async redo() {
        await raw.put('transactions', updated)
        if (oldLinked && (field === 'date' || field === 'amount' || field === 'memo')) {
          const mirrorValue = field === 'amount' ? -(newValue as number) : newValue
          await raw.put('transactions', { ...oldLinked, [field]: mirrorValue })
        }
        reactive.notify('transactions')
      },
    })
  }

  async function commitPayee(payeeId: string) {
    if (payeeId === '__none__') {
      if (props.tx.payee_id === null || props.tx.payee_id === undefined) return
      await commitField('payee_id', null)
      return
    }
    const oldPayeeId = props.tx.payee_id as string | null
    if (payeeId === oldPayeeId) return

    const id = props.tx.id as string
    const oldRecord = { ...props.tx }

    // Check if new payee is an account (creates transfer)
    const newPayee = payees().find(p => p.id === payeeId)
    const isNewTransfer = newPayee && (newPayee.type as string) === 'account'
    const wasTransfer = isTransfer()

    if (isNewTransfer && !wasTransfer) {
      // Convert to transfer: create mirror transaction
      const destAccountId = newPayee.account_id as string
      const sourcePayee = payees().find(p => (p.account_id as string) === (props.tx.account_id as string))
      const mirrorId = crypto.randomUUID()
      const now = new Date().toISOString()

      const updated = { ...props.tx, payee_id: payeeId, category_id: null, linked_id: mirrorId }
      const mirror: Record = {
        id: mirrorId,
        account_id: destAccountId,
        payee_id: sourcePayee?.id ?? null,
        category_id: null,
        date: props.tx.date as string,
        amount: -(props.tx.amount as number),
        memo: props.tx.memo,
        cleared: 0,
        linked_id: id,
        created_at: now,
      }

      await raw.put('transactions', updated)
      await raw.put('transactions', mirror)
      reactive.notify('transactions')

      pushUndo({
        description: `Converted to transfer → ${newPayee.name}`,
        async undo() {
          await raw.put('transactions', oldRecord)
          await raw.delete('transactions', mirrorId)
          reactive.notify('transactions')
        },
        async redo() {
          await raw.put('transactions', updated)
          await raw.put('transactions', mirror)
          reactive.notify('transactions')
        },
      })
    } else if (!isNewTransfer && wasTransfer) {
      // Convert from transfer to normal: delete mirror
      const linkedId = props.tx.linked_id as string
      const oldLinked = await raw.get('transactions', linkedId)
      const updated = { ...props.tx, payee_id: payeeId, linked_id: null }

      await raw.put('transactions', updated)
      if (oldLinked) await raw.delete('transactions', linkedId)
      reactive.notify('transactions')

      pushUndo({
        description: `Converted from transfer to ${newPayee?.name ?? 'payee'}`,
        async undo() {
          await raw.put('transactions', oldRecord)
          if (oldLinked) await raw.put('transactions', oldLinked)
          reactive.notify('transactions')
        },
        async redo() {
          await raw.put('transactions', updated)
          if (oldLinked) await raw.delete('transactions', linkedId)
          reactive.notify('transactions')
        },
      })
    } else {
      // Simple payee change (both normal, or both transfer to different account)
      await commitField('payee_id', payeeId)
    }
  }

  async function toggleCleared(e: MouseEvent) {
    e.stopPropagation()
    const id = props.tx.id as string
    const oldCleared = props.tx.cleared as number
    const newCleared = oldCleared ? 0 : 1
    const updated = { ...props.tx, cleared: newCleared }
    await serverFirst({
      async optimistic() {
        await raw.put('transactions', updated)
        reactive.notify('transactions')
      },
      request: () => apiPatch(`/api/transactions/${id}`, { cleared: !!newCleared }),
      async rollback() {
        await raw.put('transactions', { ...props.tx, cleared: oldCleared })
        reactive.notify('transactions')
      },
    })
  }

  return (
    <div
      class={`txn-row ${(props.tx.cleared as number) ? 'txn-row--cleared' : ''} ${(props.tx.reconciled_at as string) ? 'txn-row--reconciled' : ''} ${props.selected ? 'txn-row--selected' : ''}`}
      onContextMenu={(e) => props.onContextMenu(e, props.tx)}
      onClick={(e) => { if (!activeCell() && props.onSelect) props.onSelect(props.tx.id as string, e) }}
      onMouseEnter={() => { if (props.onHover) props.onHover(props.tx.id as string) }}
    >
      {/* Select checkbox */}
      <div class="txn-row__check" onClick={(e) => { e.stopPropagation(); if (props.onCheckClick) props.onCheckClick(props.tx.id as string, e) }}>
        <Show when={props.selected}>
          <span class="txn-row__check-mark">✓</span>
        </Show>
      </div>

      {/* Date cell */}
      <div class="txn-row__date cell--text" onClick={(e) => startCell('date', e)} style={{ position: 'relative' }}>
        <Show when={activeCell() === 'date' && isActive()} fallback={
          <span class="txn-row__date-display">
            <span>{props.tx.date as string}</span>
            <Show when={props.tx.schedule_id}><span class="txn-row__schedule-badge" title="Recurring"><Repeat size={11} /></span></Show>
          </span>
        }>
          <DatePicker
            value={props.tx.date as string}
            required
            onCommit={(v) => { if (v && v !== (props.tx.date as string)) commitField('date', v); endCell() }}
            onCancel={endCell}
          />
        </Show>
      </div>

      {/* Account (read-only display) */}
      <Show when={props.showAccount}>
        <div class="txn-row__account">{accountName()}</div>
      </Show>

      {/* Payee cell */}
      <div class="txn-row__payee cell--select" onClick={(e) => startCell('payee', e)}>
        <Show when={activeCell() === 'payee' && isActive()} fallback={
          <span class="txn-row__payee-display">
            <Show when={payeeName()} fallback={
              <Show when={(props.tx.source as string) === 'import'} fallback={<span class="cell-placeholder">Payee</span>}>
                <span class="txn-row__source-icon txn-row__source-icon--import"><Download size={12} /></span>
                <span class="cell-placeholder">Imported</span>
              </Show>
            }>
              <Show when={(props.tx.source as string) === 'system'}>
                <span class="txn-row__source-icon txn-row__source-icon--system"><Lock size={12} /></span>
              </Show>
              <Show when={(props.tx.source as string) === 'import'}>
                <span class="txn-row__source-icon txn-row__source-icon--import"><Download size={12} /></span>
              </Show>
              <Show when={(props.tx.source as string) !== 'system' && (props.tx.source as string) !== 'import'}>
                <span class="payee-initial" style={{ 'background-color': getInitialColor(payeeName()) }}>{getInitial(payeeName())}</span>
              </Show>
              <span>{payeeName()}</span>
            </Show>
          </span>
        }>
          <PayeePicker
            value={props.tx.payee_id as string ?? ''}
            knownPayees={props.knownPayees}
            accounts={accounts().filter(a => !(a.deleted_at as string) && a.id !== props.tx.account_id)}
            onPick={(payeeId) => { commitPayee(payeeId); endCell() }}
            onCancel={endCell}
            onTab={() => advanceCell('payee')}
          />
        </Show>
      </div>

      {/* Category cell */}
      <Show when={!props.hideCategory}>
      <Show when={isTransfer()} fallback={
        <div class="txn-row__category cell--select" onClick={(e) => startCell('category', e)}>
          <Show when={activeCell() === 'category' && isActive()} fallback={
            <span class="txn-row__category-display">
              <Show when={categoryName()} fallback={<span class="cell-placeholder">Category</span>}>
                <EntityIcon icon={categoryIcon()} name={categoryName()} size={14} />
                <span>{categoryName()}</span>
              </Show>
            </span>
          }>
            <CategoryPicker
              value={(props.tx.category_id as string) ?? ''}
              groups={categoryGroups()}
              categories={categories()}
              onPick={(catId) => { const nv = catId === '__none__' ? null : (catId || null); if (nv !== ((props.tx.category_id as string) ?? null)) commitField('category_id', nv); endCell() }}
              onCancel={endCell}
              onTab={() => advanceCell('category')}
            />
          </Show>
        </div>
      }>
        <div class="txn-row__category cell--computed" title="Transfers are not categorized">
          <span class="txn-row__transfer-label">Transfer</span>
        </div>
      </Show>
      </Show>

      {/* Memo cell */}
      <div class="txn-row__memo cell--memo">
        <MemoCell
          value={(props.tx.memo as string) ?? ''}
          onCommit={(v) => { const nv = v.trim() || null; if (nv !== ((props.tx.memo as string) ?? null)) commitField('memo', nv) }}
        />
      </div>

      {/* Amount cell */}
      <div class="txn-row__amount cell--number" onClick={(e) => startCell('amount', e)}>
        <Show when={activeCell() === 'amount' && isActive()} fallback={<MoneyDisplay amount={props.tx.amount as number} />}>
          <AmountInput
            amount={props.tx.amount as number}
            onCommit={(newAmt) => { if (newAmt !== (props.tx.amount as number)) commitField('amount', newAmt); endCell() }}
            onCancel={endCell}
          />
        </Show>
      </div>

      {/* Balance (read-only) */}
      <Show when={!props.hideBalance}>
      <div class={`txn-row__balance cell--computed ${!(props.tx.cleared as number) ? 'txn-row__balance--uncleared' : ''}`}>
        <MoneyDisplay amount={props.balance} unsigned />
      </div>
      </Show>

      {/* Cleared/Reconciled status (far right) */}
      <div class="txn-row__status" onClick={toggleCleared}>
        <span class={`txn-row__status-dot ${(props.tx.reconciled_at as string) ? 'txn-row__status-dot--reconciled' : (props.tx.cleared as number) ? 'txn-row__status-dot--cleared' : ''}`} />
      </div>
    </div>
  )
}

export default TransactionRow
