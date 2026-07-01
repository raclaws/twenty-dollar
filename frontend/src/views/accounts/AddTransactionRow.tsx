import { createSignal, createMemo, onMount, onCleanup, For, Show, type Component } from 'solid-js'
import { Plus, Minus } from 'lucide-solid'
import { parseMoney, formatMoneyUnsigned } from '~/lib/format'
import { useStore } from '~/App'
import { createQuery } from '~/lib/solid-binding'
import { apiPost } from '~/lib/api'
import { pushUndo } from '~/lib/undo'
import { PayeePicker, CategoryPicker } from '~/components/Pickers'
import { DatePicker } from '~/components/CellInputs'

interface AddTransactionRowProps {
  accountId: string
}

interface SplitLine {
  categoryId: string
  amount: string
  memo: string
}

const AddTransactionRow: Component<AddTransactionRowProps> = (props) => {
  const { raw, reactive } = useStore()
  const categoryGroups = createQuery(reactive, 'category_groups')
  const categories = createQuery(reactive, 'categories')
  const accounts = createQuery(reactive, 'accounts')
  const payees = createQuery(reactive, 'payees')

  const [isOpen, setIsOpen] = createSignal(false)
  const [addMore, setAddMore] = createSignal(false)
  let pickerJustClosed = false

  const [date, setDate] = createSignal(new Date().toISOString().slice(0, 10))
  const [showDatePicker, setShowDatePicker] = createSignal(false)
  const [payeeId, setPayeeId] = createSignal<string | null>(null)
  const [payeeLabel, setPayeeLabel] = createSignal('')
  const [showPayeePicker, setShowPayeePicker] = createSignal(false)
  const [categoryId, setCategoryId] = createSignal('')
  const [categoryLabel, setCategoryLabel] = createSignal('')
  const [showCatPicker, setShowCatPicker] = createSignal(false)
  const [memo, setMemo] = createSignal('')
  const [amountInput, setAmountInput] = createSignal('')
  const [isOutflow, setIsOutflow] = createSignal(true)
  const [isCleared, setIsCleared] = createSignal(false)
  const [isSplit, setIsSplit] = createSignal(false)
  const [splits, setSplits] = createSignal<SplitLine[]>([{ categoryId: '', amount: '', memo: '' }])
  const [errors, setErrors] = createSignal<Record<string, string>>({})

  const knownPayees = createMemo(() => {
    return payees().filter(p => (p.type as string) === 'external').map(p => ({ id: p.id as string, name: p.name as string }))
  })

  function openDialog() {
    setIsOpen(true)
  }

  function closeDialog() {
    setIsOpen(false)
    resetAll()
  }

  function handlePayeePick(pid: string) {
    if (pid === '__none__') {
      setPayeeId(null)
      setPayeeLabel('')
    } else {
      setPayeeId(pid)
      const p = payees().find(p => p.id === pid)
      setPayeeLabel(p ? p.name as string : '')
    }
    setShowPayeePicker(false)
    setErrors({})
  }

  function cancelPicker(which: 'date' | 'payee' | 'category') {
    pickerJustClosed = true
    if (which === 'date') setShowDatePicker(false)
    else if (which === 'payee') setShowPayeePicker(false)
    else if (which === 'category') setShowCatPicker(false)
    setTimeout(() => { pickerJustClosed = false }, 50)
  }

  function handleCategoryPick(catId: string) {
    if (catId === '__none__') {
      setCategoryId('')
      setCategoryLabel('')
    } else {
      setCategoryId(catId)
      const cat = categories().find(c => c.id === catId)
      setCategoryLabel(cat ? cat.name as string : catId)
    }
    setShowCatPicker(false)
    setErrors({})
  }

  function isTransferPayee() {
    if (!payeeId()) return false
    const p = payees().find(p => p.id === payeeId())
    return p ? (p.type as string) === 'account' : false
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!date()) errs.date = 'Date is required'
    if (!amountInput().trim()) errs.amount = 'Amount is required'
    else if (parseMoney(amountInput()) === null) errs.amount = 'Invalid number'
    else if (parseMoney(amountInput()) === 0) errs.amount = 'Amount cannot be zero'
    if (isSplit()) {
      const total = splits().reduce((sum, s) => sum + (parseMoney(s.amount) ?? 0), 0)
      const main = parseMoney(amountInput()) ?? 0
      if (total !== main) errs.splits = `Split total must equal ${formatMoneyUnsigned(Math.abs(main))}`
      if (splits().some(s => !s.categoryId)) errs.splits = 'All splits need a category'
      if (splits().some(s => parseMoney(s.amount) === null)) errs.splits = 'All splits need a valid amount'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function addSplitLine() {
    setSplits(s => [...s, { categoryId: '', amount: '', memo: '' }])
  }

  function removeSplitLine(index: number) {
    setSplits(s => s.filter((_, i) => i !== index))
  }

  function updateSplit(index: number, field: keyof SplitLine, value: string) {
    setSplits(s => s.map((line, i) => i === index ? { ...line, [field]: value } : line))
  }

  function resetAll() {
    setDate(new Date().toISOString().slice(0, 10))
    setShowDatePicker(false)
    setPayeeId(null)
    setPayeeLabel('')
    setShowPayeePicker(false)
    setCategoryId('')
    setCategoryLabel('')
    setShowCatPicker(false)
    setMemo('')
    setAmountInput('')
    setIsOutflow(true)
    setIsCleared(false)
    setIsSplit(false)
    setSplits([{ categoryId: '', amount: '', memo: '' }])
    setErrors({})
  }

  function resetForAddMore() {
    // Keep the date, reset everything else
    setShowDatePicker(false)
    setPayeeId(null)
    setPayeeLabel('')
    setShowPayeePicker(false)
    setCategoryId('')
    setCategoryLabel('')
    setShowCatPicker(false)
    setMemo('')
    setAmountInput('')
    setIsOutflow(true)
    setIsCleared(false)
    setIsSplit(false)
    setSplits([{ categoryId: '', amount: '', memo: '' }])
    setErrors({})
  }

  async function handleSubmit() {
    if (!validate()) return

    const rawAmount = parseMoney(amountInput())!
    const amount = isOutflow() ? -Math.abs(rawAmount) : Math.abs(rawAmount)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (isTransferPayee()) {
      const mirrorId = crypto.randomUUID()
      const destPayee = payees().find(p => p.id === payeeId())
      const destAccountId = destPayee?.account_id as string
      const sourcePayee = payees().find(p => (p.account_id as string) === props.accountId)

      const sourceTx = {
        id,
        account_id: props.accountId,
        payee_id: payeeId(),
        category_id: null,
        date: date(),
        amount,
        memo: memo() || null,
        cleared: isCleared() ? 1 : 0,
        linked_id: mirrorId,
        created_at: now,
      }

      const mirrorTx = {
        id: mirrorId,
        account_id: destAccountId,
        payee_id: sourcePayee?.id ?? null,
        category_id: null,
        date: date(),
        amount: -amount,
        memo: memo() || null,
        cleared: isCleared() ? 1 : 0,
        linked_id: id,
        created_at: now,
      }

      await raw.put('transactions', sourceTx)
      await raw.put('transactions', mirrorTx)
      reactive.notify('transactions')

      const destName = destPayee?.name as string ?? 'Unknown'
      pushUndo({
        description: `Transfer ${(Math.abs(rawAmount) / 100).toFixed(2)} to ${destName}`,
        async undo() {
          await raw.delete('transactions', id)
          await raw.delete('transactions', mirrorId)
          reactive.notify('transactions')
        },
        async redo() {
          await raw.put('transactions', sourceTx)
          await raw.put('transactions', mirrorTx)
          reactive.notify('transactions')
        },
      })

      if (addMore()) { resetForAddMore() } else { closeDialog() }
      return
    }

    const txRecord = {
      id,
      account_id: props.accountId,
      payee_id: payeeId(),
      category_id: isSplit() ? null : (categoryId() || null),
      date: date(),
      amount,
      memo: memo() || null,
      cleared: isCleared() ? 1 : 0,
      linked_id: null,
      created_at: now,
    }

    await raw.put('transactions', txRecord)

    const splitRecords = isSplit() ? splits().map(s => ({
      id: crypto.randomUUID(),
      transaction_id: id,
      category_id: s.categoryId,
      amount: parseMoney(s.amount) ?? 0,
      memo: s.memo || null,
    })) : []

    for (const sr of splitRecords) {
      await raw.put('split_entries', sr)
    }

    reactive.notify('transactions')
    if (splitRecords.length) reactive.notify('split_entries')

    apiPost('/api/transactions', {
      account_id: props.accountId,
      payee: payeeLabel() || null,
      payee_id: payeeId(),
      category_id: txRecord.category_id,
      date: txRecord.date,
      amount: txRecord.amount,
      memo: txRecord.memo,
      cleared: isCleared(),
      splits: splitRecords.map(s => ({ category_id: s.category_id, amount: s.amount, memo: s.memo })),
    }).catch(() => {})

    pushUndo({
      description: `Added transaction: ${payeeLabel() || 'Unknown'} ${(amount / 100).toFixed(2)}`,
      async undo() {
        await raw.delete('transactions', id)
        for (const sr of splitRecords) await raw.delete('split_entries', sr.id)
        reactive.notify('transactions')
        reactive.notify('split_entries')
      },
      async redo() {
        await raw.put('transactions', txRecord)
        for (const sr of splitRecords) await raw.put('split_entries', sr)
        reactive.notify('transactions')
        reactive.notify('split_entries')
      },
    })

    if (addMore()) { resetForAddMore() } else { closeDialog() }
  }

  // Global keyboard shortcut: Ctrl+N or Cmd+N opens dialog, Escape closes it (layered)
  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault()
      if (!isOpen()) openDialog()
    }
    if (e.key === 'Escape' && isOpen()) {
      if (pickerJustClosed || showDatePicker() || showPayeePicker() || showCatPicker()) {
        return
      }
      closeDialog()
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleGlobalKeydown)
    onCleanup(() => document.removeEventListener('keydown', handleGlobalKeydown))
  })

  return (
    <>
      {/* Trigger row */}
      <div class="add-txn-trigger" onClick={openDialog}>
        <span class="add-txn-trigger__icon"><Plus size={16} /></span>
        <span class="add-txn-trigger__label">Add transaction...</span>
        <span class="add-txn-trigger__shortcut">⌘N</span>
      </div>

      {/* Popup dialog */}
      <Show when={isOpen()}>
        <div class="add-txn-overlay" onClick={closeDialog}>
          <div class="add-txn-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape' && !pickerJustClosed && !showDatePicker() && !showPayeePicker() && !showCatPicker()) { closeDialog() } }}>
            {/* Header */}
            <div class="add-txn-dialog__header">
              <div class="add-txn-dialog__title">
                <span class="add-txn-dialog__icon"><Plus size={16} /></span>
                <span>New Transaction</span>
              </div>
              <button class="add-txn-dialog__close" onClick={closeDialog}>Esc</button>
            </div>

            {/* Body */}
            <div class="add-txn-dialog__body">
              {/* Date */}
              <div class="add-txn-dialog__field">
                <label class="add-txn-dialog__label">Date</label>
                <div class="add-txn-dialog__input-wrap" style={{ position: 'relative' }}>
                  <input
                    class={`add-txn-dialog__input ${errors().date ? 'input--error' : ''}`}
                    type="text"
                    value={date()}
                    readOnly
                    onClick={() => setShowDatePicker(true)}
                    placeholder="Select date..."
                  />
                  <Show when={showDatePicker()}>
                    <DatePicker
                      value={date()}
                      onCommit={(v) => { setDate(v); setShowDatePicker(false); setErrors(er => { const { date, ...rest } = er; return rest }) }}
                      onCancel={() => cancelPicker('date')}
                    />
                  </Show>
                </div>
              </div>

              {/* Payee */}
              <div class="add-txn-dialog__field">
                <label class="add-txn-dialog__label">Payee</label>
                <div class="add-txn-dialog__input-wrap" style={{ position: 'relative' }}>
                  <input
                    class="add-txn-dialog__input"
                    type="text"
                    placeholder="Search or add payee..."
                    value={payeeLabel()}
                    onFocus={() => setShowPayeePicker(true)}
                    onInput={(e) => { setPayeeLabel(e.currentTarget.value); setPayeeId(null); setShowPayeePicker(true) }}
                  />
                  <Show when={showPayeePicker()}>
                    <PayeePicker
                      value={payeeId() ?? ''}
                      knownPayees={knownPayees()}
                      accounts={accounts().filter(a => !(a.deleted_at as string) && a.id !== props.accountId)}
                      onPick={handlePayeePick}
                      onCancel={() => cancelPicker('payee')}
                    />
                  </Show>
                </div>
              </div>

              {/* Category */}
              <div class="add-txn-dialog__field">
                <label class="add-txn-dialog__label">Category</label>
                <Show when={!isSplit() && !isTransferPayee()} fallback={
                  <div class="add-txn-dialog__input-wrap">
                    <div class="add-txn-dialog__input add-txn-dialog__input--locked">
                      {isTransferPayee() ? 'Transfer' : 'Split'}
                    </div>
                  </div>
                }>
                  <div class="add-txn-dialog__input-wrap" style={{ position: 'relative' }}>
                    <input
                      class="add-txn-dialog__input"
                      type="text"
                      placeholder="Select category..."
                      value={categoryLabel()}
                      readOnly
                      onClick={() => setShowCatPicker(true)}
                    />
                    <Show when={showCatPicker()}>
                      <CategoryPicker
                        value={categoryId()}
                        groups={categoryGroups()}
                        categories={categories()}
                        onPick={handleCategoryPick}
                        onCancel={() => cancelPicker('category')}
                      />
                    </Show>
                  </div>
                </Show>
              </div>

              {/* Amount */}
              <div class="add-txn-dialog__field">
                <label class="add-txn-dialog__label">Amount</label>
                <div class="add-txn-dialog__input-wrap add-txn-dialog__amount-wrap">
                  <div class="sign-toggle">
                    <button
                      class={`sign-toggle__btn sign-toggle__btn--out ${isOutflow() ? 'sign-toggle__btn--active' : ''}`}
                      onClick={() => setIsOutflow(true)}
                    >−</button>
                    <button
                      class={`sign-toggle__btn sign-toggle__btn--in ${!isOutflow() ? 'sign-toggle__btn--active' : ''}`}
                      onClick={() => setIsOutflow(false)}
                    >+</button>
                  </div>
                  <input
                    class={`add-txn-dialog__input add-txn-dialog__input--amount ${errors().amount ? 'input--error' : ''}`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={amountInput()}
                    onInput={(e) => { setAmountInput(e.currentTarget.value); setErrors(er => { const { amount, ...rest } = er; return rest }) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit() } }}
                  />
                </div>
              </div>

              {/* Memo */}
              <div class="add-txn-dialog__field">
                <label class="add-txn-dialog__label">Memo</label>
                <div class="add-txn-dialog__input-wrap">
                  <input
                    class="add-txn-dialog__input"
                    type="text"
                    placeholder="Add a note..."
                    value={memo()}
                    onInput={(e) => setMemo(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit() } }}
                  />
                </div>
              </div>

              {/* Splits */}
              <Show when={isSplit()}>
                <div class="add-txn-dialog__splits">
                  <For each={splits()}>
                    {(line, i) => (
                      <div class="add-txn-dialog__split-line">
                        <select class="add-txn-dialog__input" value={line.categoryId} onChange={(e) => updateSplit(i(), 'categoryId', e.currentTarget.value)}>
                          <option value="">Category...</option>
                          <For each={categories()}>
                            {(cat) => <option value={cat.id as string}>{cat.name as string}</option>}
                          </For>
                        </select>
                        <input class="add-txn-dialog__input" type="number" step="0.01" placeholder="0.00" value={line.amount} onInput={(e) => updateSplit(i(), 'amount', e.currentTarget.value)} />
                        <input class="add-txn-dialog__input" type="text" placeholder="Memo" value={line.memo} onInput={(e) => updateSplit(i(), 'memo', e.currentTarget.value)} />
                        <button class="btn btn--sm btn--ghost" onClick={() => removeSplitLine(i())}>×</button>
                      </div>
                    )}
                  </For>
                  <div class="add-txn-dialog__split-footer">
                    <button class="btn btn--sm btn--ghost" onClick={addSplitLine}>+ Add split</button>
                    <Show when={errors().splits}><span class="field-error">{errors().splits}</span></Show>
                  </div>
                </div>
              </Show>

              {/* Errors */}
              <Show when={errors().amount || errors().date}>
                <div class="add-txn-dialog__errors">
                  <Show when={errors().date}><span class="field-error">{errors().date}</span></Show>
                  <Show when={errors().amount}><span class="field-error">{errors().amount}</span></Show>
                </div>
              </Show>
            </div>

            {/* Footer */}
            <div class="add-txn-dialog__footer">
              <div class="add-txn-dialog__footer-left">
                <div class="add-txn-dialog__cleared" onClick={() => setIsCleared(!isCleared())}>
                  <span class={`txn-row__status-dot ${isCleared() ? 'txn-row__status-dot--cleared' : ''}`} />
                  <span class="add-txn-dialog__cleared-label">Cleared</span>
                </div>
                <label class="add-txn-dialog__add-more">
                  <input type="checkbox" checked={addMore()} onChange={(e) => setAddMore(e.currentTarget.checked)} />
                  <span>Add more</span>
                </label>
              </div>
              <div class="add-txn-dialog__footer-right">
                <Show when={!isTransferPayee()}>
                  <button class="btn btn--sm btn--secondary" onClick={() => setIsSplit(!isSplit())}>
                    {isSplit() ? 'Single' : 'Split'}
                  </button>
                </Show>
                <button class="btn btn--sm btn--primary" onClick={() => handleSubmit()}>Add ⌘Enter</button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}

export default AddTransactionRow
