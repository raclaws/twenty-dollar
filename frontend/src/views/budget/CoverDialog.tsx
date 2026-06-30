import { createSignal, createMemo, Show, type Component, type Accessor } from 'solid-js'
import { ArrowRight, Wallet } from 'lucide-solid'
import { formatMoney, formatMoneyUnsigned, parseMoney } from '~/lib/format'
import { useStore, useMonth } from '~/App'
import { createBudgetStore } from '~/lib/budget-signals'
import { apiPost } from '~/lib/api'
import { pushUndo } from '~/lib/undo'
import EntityPicker, { type EntityPickerSection } from '~/components/EntityPicker'

const RTA_ID = '__rta__'

export interface TransferTarget {
  catId: string
  catName: string
  side: 'from' | 'to'
}

interface CoverDialogProps {
  open: boolean
  target?: TransferTarget | null
  onClose: () => void
}

const CoverDialog: Component<CoverDialogProps> = (props) => {
  const { raw, reactive } = useStore()
  const { month } = useMonth()
  const budgetStore = createBudgetStore(reactive, month)

  const [fromId, setFromId] = createSignal('')
  const [fromLabel, setFromLabel] = createSignal('')
  const [toId, setToId] = createSignal('')
  const [toLabel, setToLabel] = createSignal('')
  const [showFromPicker, setShowFromPicker] = createSignal(false)
  const [showToPicker, setShowToPicker] = createSignal(false)
  const [amountInput, setAmountInput] = createSignal('')
  const [error, setError] = createSignal('')
  let fromPickerJustClosed = false
  let toPickerJustClosed = false
  let dlgRef: HTMLDivElement | undefined

  const categories = () => budgetStore.budget().groups.flatMap(g => g.categories)
  const rta = () => budgetStore.rta()

  function availableFor(id: string): number {
    if (id === RTA_ID) return rta()
    const cat = categories().find(c => c.categoryId === id)
    return cat?.available ?? 0
  }

  function labelFor(id: string): string {
    if (id === RTA_ID) return 'Ready to Assign'
    const cat = categories().find(c => c.categoryId === id)
    return cat?.categoryName ?? ''
  }

  const fromSections = (): EntityPickerSection[] => [
    { key: 'budget', label: 'Budget', items: [{ id: RTA_ID, label: 'Ready to Assign', meta: formatMoney(rta()) }] },
    { key: 'categories', label: 'Category', items: categories()
      .filter(c => c.categoryId !== toId())
      .filter(c => c.available > 0)
      .map(c => ({ id: c.categoryId, label: c.categoryName, meta: formatMoney(c.available) }))
    },
  ]

  const toSections = (): EntityPickerSection[] => [
    { key: 'budget', label: 'Budget', items: [{ id: RTA_ID, label: 'Ready to Assign', meta: formatMoney(rta()) }] },
    { key: 'categories', label: 'Category', items: categories()
      .filter(c => c.categoryId !== fromId())
      .map(c => ({ id: c.categoryId, label: c.categoryName, meta: formatMoney(c.available) }))
    },
  ]

  const fromAvailable = createMemo(() => availableFor(fromId()))
  const toAvailable = createMemo(() => availableFor(toId()))
  const maxAmount = createMemo(() => Math.max(0, fromAvailable()))
  const parsedAmount = createMemo(() => parseMoney(amountInput()) ?? 0)
  const isValid = createMemo(() => fromId() !== '' && toId() !== '' && parsedAmount() > 0)

  const smartAllAmount = createMemo(() => {
    const src = Math.max(0, fromAvailable())
    const destCat = categories().find(c => c.categoryId === toId())
    const destDeficit = toAvailable() < 0 ? Math.abs(toAvailable()) : 0
    const targetGap = destCat?.target?.isUnderfunded ? destCat.target.needed : 0
    const need = Math.max(destDeficit, targetGap)
    if (need > 0) return Math.min(need, src)
    return src
  })

  function fillMax() {
    const v = smartAllAmount()
    if (v > 0) setAmountInput((v / 100).toFixed(2))
  }

  function prefill() {
    const t = props.target
    if (!t) return
    if (t.side === 'from') {
      setFromId(t.catId || RTA_ID)
      setFromLabel(t.catName || 'Ready to Assign')
      setToId('')
      setToLabel('')
    } else {
      setToId(t.catId)
      setToLabel(t.catName)
      setFromId('')
      setFromLabel('')
    }
    setAmountInput('')
    setError('')
  }

  function reset() {
    setFromId('')
    setFromLabel('')
    setToId('')
    setToLabel('')
    setAmountInput('')
    setError('')
    setShowFromPicker(false)
    setShowToPicker(false)
  }

  function handleClose() {
    reset()
    props.onClose()
  }

  function handleFromPick(id: string) {
    setFromId(id)
    setFromLabel(labelFor(id))
    setShowFromPicker(false)
    setError('')
    refocusDialog()
  }

  function handleToPick(id: string) {
    setToId(id)
    setToLabel(labelFor(id))
    setShowToPicker(false)
    setError('')
    refocusDialog()
  }

  function refocusDialog() {
    requestAnimationFrame(() => { if (dlgRef) dlgRef.focus() })
  }

  function cancelFromPicker() {
    fromPickerJustClosed = true
    setShowFromPicker(false)
    setTimeout(() => { fromPickerJustClosed = false }, 50)
    refocusDialog()
  }

  function cancelToPicker() {
    toPickerJustClosed = true
    setShowToPicker(false)
    setTimeout(() => { toPickerJustClosed = false }, 50)
    refocusDialog()
  }

  async function handleSubmit() {
    if (!isValid()) return
    setError('')

    const amount = parsedAmount()
    const sourceAvail = fromAvailable()

    if (amount <= 0) {
      setError('Amount must be greater than zero')
      return
    }

    if (fromId() !== RTA_ID && amount > sourceAvail) {
      setError(`Exceeds available (${formatMoneyUnsigned(sourceAvail)})`)
      return
    }

    const m = month()
    const from = fromId()
    const to = toId()

    try {
      // Deduct from source (unless RTA — RTA is implicit)
      if (from !== RTA_ID) {
        const fromAssignments = await raw.query('assignments', { where: { category_id: from, month: m } })
        const fromRecord = fromAssignments[0]
        if (fromRecord) {
          await raw.put('assignments', { ...fromRecord, amount: (fromRecord.amount as number) - amount })
        } else {
          await raw.put('assignments', { id: crypto.randomUUID(), category_id: from, month: m, amount: -amount })
        }
      }

      // Add to destination (unless RTA)
      if (to !== RTA_ID) {
        const toAssignments = await raw.query('assignments', { where: { category_id: to, month: m } })
        const toRecord = toAssignments[0]
        if (toRecord) {
          await raw.put('assignments', { ...toRecord, amount: (toRecord.amount as number) + amount })
        } else {
          await raw.put('assignments', { id: crypto.randomUUID(), category_id: to, month: m, amount })
        }
      }

      reactive.notify('assignments')

      apiPost('/api/budget/move', { from_category_id: from, to_category_id: to, amount, month: m }).catch(() => {})

      const fromName = labelFor(from)
      const toName = labelFor(to)

      pushUndo({
        description: `Moved ${(amount / 100).toFixed(2)} from ${fromName} to ${toName}`,
        async undo() {
          if (from !== RTA_ID) {
            const fa = await raw.query('assignments', { where: { category_id: from, month: m } })
            if (fa[0]) await raw.put('assignments', { ...fa[0], amount: (fa[0].amount as number) + amount })
          }
          if (to !== RTA_ID) {
            const ta = await raw.query('assignments', { where: { category_id: to, month: m } })
            if (ta[0]) await raw.put('assignments', { ...ta[0], amount: (ta[0].amount as number) - amount })
          }
          reactive.notify('assignments')
        },
        async redo() {
          if (from !== RTA_ID) {
            const fa = await raw.query('assignments', { where: { category_id: from, month: m } })
            if (fa[0]) await raw.put('assignments', { ...fa[0], amount: (fa[0].amount as number) - amount })
          }
          if (to !== RTA_ID) {
            const ta = await raw.query('assignments', { where: { category_id: to, month: m } })
            if (ta[0]) await raw.put('assignments', { ...ta[0], amount: (ta[0].amount as number) + amount })
          }
          reactive.notify('assignments')
        },
      })

      handleClose()
    } catch (e: any) {
      setError(e.message ?? 'Transfer failed')
    }
  }

  function handleDialogKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (fromPickerJustClosed || toPickerJustClosed || showFromPicker() || showToPicker()) return
      const active = document.activeElement as HTMLElement | null
      if (active && active.tagName === 'INPUT' && active.closest('.add-txn-dialog')) {
        active.blur()
        e.stopPropagation()
        return
      }
      handleClose()
    }
  }

  // Prefill when dialog opens
  const prevOpen = { value: false }
  createMemo(() => {
    if (props.open && !prevOpen.value) prefill()
    prevOpen.value = props.open
  })

  return (
    <Show when={props.open}>
      <div class="add-txn-overlay" onClick={handleClose}>
        <div class="add-txn-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={handleDialogKeydown} tabIndex={-1} ref={(el) => { dlgRef = el; requestAnimationFrame(() => el.focus()) }}>
          <div class="add-txn-dialog__header">
            <div class="add-txn-dialog__title">
              <span class="add-txn-dialog__icon"><Wallet size={16} /></span>
              <span>Move Budget</span>
            </div>
            <button class="add-txn-dialog__close" onClick={handleClose}>Esc</button>
          </div>

          <div class="add-txn-dialog__body">
            {/* Context card — shows the category that triggered this dialog */}
            {(() => {
              const anchorId = () => props.target?.catId || ''
              const cat = () => categories().find(c => c.categoryId === anchorId())
              const target = () => cat()?.target
              const summary = () => {
                const c = cat()
                if (!c) return ''
                if (c.available < 0) return `Need ${formatMoneyUnsigned(Math.abs(c.available))} to cover overspending`
                if (target()?.isUnderfunded) return `Need ${formatMoneyUnsigned(target()!.needed)} more to reach target`
                if (target() && !target()!.isUnderfunded) return 'Target met — budget is healthy'
                if (c.assigned === 0) return 'No budget assigned yet'
                return 'Budget is on track'
              }
              return (
                <Show when={cat()}>
                  <div class="cover-dialog__dest-card">
                    <div class="cover-dialog__dest-stats">
                      <Show when={target()}>
                        <span>Target: <strong class="cover-dialog__val">{formatMoneyUnsigned(target()!.targetAmount)}</strong></span>
                      </Show>
                      <span>Assigned: <strong class="cover-dialog__val">{formatMoneyUnsigned(cat()!.assigned)}</strong></span>
                      <span>Spent: <strong class={cat()!.activity < 0 ? 'cover-dialog__val--negative' : 'cover-dialog__val'}>{formatMoney(cat()!.activity)}</strong></span>
                      <span>Available: <strong class={cat()!.available < 0 ? 'cover-dialog__val--negative' : cat()!.available > 0 ? 'cover-dialog__val--positive' : 'cover-dialog__val'}>{formatMoney(cat()!.available)}</strong></span>
                    </div>
                    <span class={`cover-dialog__dest-summary ${cat()!.available < 0 ? 'cover-dialog__dest-summary--negative' : target()?.isUnderfunded ? 'cover-dialog__dest-summary--warning' : 'cover-dialog__dest-summary--positive'}`}>{summary()}</span>
                  </div>
                </Show>
              )
            })()}

            {/* From */}
            <div class="add-txn-dialog__field">
              <label class="add-txn-dialog__label">From</label>
              <div class="add-txn-dialog__input-wrap" style={{ position: 'relative' }}>
                <div class={`add-txn-dialog__input add-txn-dialog__input--select ${props.target?.side === 'from' ? 'add-txn-dialog__input--locked' : ''}`} onClick={() => { if (props.target?.side !== 'from') setShowFromPicker(true) }}>
                  <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', 'min-width': '0' }}>{fromLabel() || 'Select source...'}</span> {props.target?.side !== 'from' ? '▾' : ''}
                </div>
                <Show when={showFromPicker()}>
                  <EntityPicker
                    sections={fromSections()}
                    value={fromId()}
                    placeholder="Search..."
                    onPick={handleFromPick}
                    onCreate={() => {}}
                    onCancel={cancelFromPicker}
                  />
                </Show>
              </div>
              <Show when={fromId()}>
                <span class="cover-dialog__source-hint">
                  {formatMoney(fromAvailable())} available
                </span>
              </Show>
            </div>

            {/* Arrow */}
            <div style={{ display: 'flex', 'justify-content': 'center', color: 'var(--c-overlay0)' }}>
              <ArrowRight size={16} />
            </div>

            {/* To */}
            <div class="add-txn-dialog__field">
              <label class="add-txn-dialog__label">To</label>
              <div class="add-txn-dialog__input-wrap" style={{ position: 'relative' }}>
                <div class={`add-txn-dialog__input add-txn-dialog__input--select ${props.target?.side === 'to' ? 'add-txn-dialog__input--locked' : ''}`} onClick={() => { if (props.target?.side !== 'to') setShowToPicker(true) }}>
                  <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', 'min-width': '0' }}>{toLabel() || 'Select destination...'}</span> {props.target?.side !== 'to' ? '▾' : ''}
                </div>
                <Show when={showToPicker()}>
                  <EntityPicker
                    sections={toSections()}
                    value={toId()}
                    placeholder="Search..."
                    onPick={handleToPick}
                    onCreate={() => {}}
                    onCancel={cancelToPicker}
                  />
                </Show>
              </div>
              <Show when={toId()}>
                <span class="cover-dialog__source-hint">
                  {formatMoney(toAvailable())} available
                </span>
              </Show>
            </div>

            {/* Amount */}
            <div class="add-txn-dialog__field">
              <label class="add-txn-dialog__label">Amount</label>
              <div class="cover-dialog__amount-row">
                <input
                  class={`add-txn-dialog__input cover-dialog__amount-input ${error() ? 'input--error' : ''}`}
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amountInput()}
                  onInput={(e) => { setAmountInput(e.currentTarget.value); setError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit() } }}
                />
                <Show when={fromId() && toId() && smartAllAmount() > 0}>
                  <button class="btn btn--sm btn--ghost cover-dialog__all-btn" onClick={fillMax}>All</button>
                </Show>
              </div>
              <Show when={fromId() && toId() && smartAllAmount() > 0}>
                <input
                  class="cover-dialog__slider"
                  type="range"
                  min="0"
                  max={maxAmount() / 100}
                  step="0.01"
                  value={parsedAmount() / 100}
                  onInput={(e) => { setAmountInput(e.currentTarget.value); setError('') }}
                />
              </Show>
              <Show when={fromId() !== RTA_ID && parsedAmount() > 0 && parsedAmount() > fromAvailable()}>
                <span class="cover-dialog__warning">Exceeds available ({formatMoneyUnsigned(fromAvailable())})</span>
              </Show>
            </div>

            <Show when={error()}>
              <div class="add-txn-dialog__errors"><span class="field-error">{error()}</span></div>
            </Show>
          </div>

          <div class="add-txn-dialog__footer">
            <div class="add-txn-dialog__footer-left" />
            <div class="add-txn-dialog__footer-right">
              <button class="btn btn--sm btn--secondary" onClick={handleClose}>Cancel</button>
              <button class="btn btn--sm btn--primary" disabled={!isValid()} onClick={handleSubmit}>
                Move {parsedAmount() > 0 ? formatMoneyUnsigned(parsedAmount()) : ''} ⌘Enter
              </button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}

export default CoverDialog
export type { TransferTarget }
