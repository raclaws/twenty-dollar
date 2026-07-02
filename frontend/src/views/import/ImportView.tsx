import { createSignal, createMemo, For, Show, type Component } from 'solid-js'
import { Upload, FileText, Check, X, AlertTriangle } from 'lucide-solid'
import { useStore } from '~/App'
import { createQuery } from '~/lib/solid-binding'
import { apiPost } from '~/lib/api'
import { parse, type Transaction } from '~/lib/tx-parser'
import { extractTextFromPDF } from '~/lib/tx-parser/pdf-extract'
import { formatMoneyUnsigned } from '~/lib/format'
import EntityPicker, { type EntityPickerSection } from '~/components/EntityPicker'

type ImportState = 'idle' | 'processing' | 'preview' | 'importing' | 'done'

const ImportView: Component = () => {
  const { raw, reactive } = useStore()
  const accounts = createQuery(reactive, 'accounts')

  const [state, setState] = createSignal<ImportState>('idle')
  const [transactions, setTransactions] = createSignal<Transaction[]>([])
  const [selected, setSelected] = createSignal<Set<number>>(new Set())
  const [accountId, setAccountId] = createSignal<string>('')
  const [showAccountPicker, setShowAccountPicker] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [importCount, setImportCount] = createSignal(0)
  const [fileName, setFileName] = createSignal('')
  let fileInput: HTMLInputElement | undefined

  const activeAccounts = () => accounts().filter(a => !(a.deleted_at as string))

  const accountSections = (): EntityPickerSection[] => [{
    key: 'accounts',
    label: 'Account',
    items: activeAccounts().map(a => ({ id: a.id as string, label: a.name as string })),
  }]

  const selectedAccount = () => activeAccounts().find(a => a.id === accountId())

  const summary = createMemo(() => {
    const txns = transactions()
    const sel = selected()
    const selectedTxns = txns.filter((_, i) => sel.has(i))
    const income = selectedTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const expense = selectedTxns.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)
    return { count: selectedTxns.length, income, expense }
  })

  async function handleFile(file: File) {
    setState('processing')
    setError(null)
    setFileName(file.name)

    try {
      let text: string
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        text = await extractTextFromPDF(file)
      } else {
        text = await file.text()
      }

      const txns = parse(text, { contextYear: new Date().getFullYear() })
      if (txns.length === 0) {
        setError('No transactions detected in this file.')
        setState('idle')
        return
      }

      setTransactions(txns)
      setSelected(new Set(txns.map((_, i) => i)))
      setState('preview')
    } catch (err: any) {
      setError(`Failed to parse file: ${err.message ?? 'unknown error'}`)
      setState('idle')
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer?.files[0]
    if (file) handleFile(file)
  }

  function handleFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) handleFile(file)
  }

  function handlePaste(text: string) {
    if (!text.trim()) return
    setState('processing')
    setError(null)
    setFileName('(pasted text)')

    try {
      const txns = parse(text, { contextYear: new Date().getFullYear() })
      if (txns.length === 0) {
        setError('No transactions detected in pasted text.')
        setState('idle')
        return
      }
      setTransactions(txns)
      setSelected(new Set(txns.map((_, i) => i)))
      setState('preview')
    } catch (err: any) {
      setError(`Failed to parse: ${err.message ?? 'unknown error'}`)
      setState('idle')
    }
  }

  function toggleRow(idx: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(transactions().map((_, i) => i)))
  }

  function selectNone() {
    setSelected(new Set())
  }

  async function confirmImport() {
    if (!accountId()) {
      setError('Select an account first.')
      return
    }
    setState('importing')
    setError(null)

    const txns = transactions()
    const sel = selected()
    const toImport = txns.filter((_, i) => sel.has(i))

    let imported = 0
    const batchSize = 10
    for (let i = 0; i < toImport.length; i += batchSize) {
      const batch = toImport.slice(i, i + batchSize)
      await Promise.all(batch.map(tx => {
        const id = crypto.randomUUID()
        const record = {
          id,
          account_id: accountId(),
          date: tx.date,
          amount: tx.amount,
          payee: tx.description,
          payee_id: null,
          category_id: null,
          memo: null,
          cleared: false,
          linked_id: null,
          splits: [],
        }
        return apiPost('/api/transactions', record).then(() => {
          imported++
          raw.put('transactions', { ...record, cleared: 0, created_at: new Date().toISOString() })
        }).catch(() => {})
      }))
    }

    reactive.notify('transactions')
    setImportCount(imported)
    setState('done')
  }

  function reset() {
    setState('idle')
    setTransactions([])
    setSelected(new Set())
    setError(null)
    setFileName('')
    setImportCount(0)
    if (fileInput) fileInput.value = ''
  }

  return (
    <div class="import-view">
      <div class="import-view__topbar">
        <h1 class="import-view__title">Smart Import</h1>
      </div>

      <div class="import-view__content">
        <Show when={state() === 'idle' || state() === 'processing'}>
          <div
            class={`import-dropzone ${state() === 'processing' ? 'import-dropzone--processing' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInput?.click()}
          >
            <input ref={fileInput} type="file" accept=".pdf,.csv,.txt" style={{ display: 'none' }} onChange={handleFileInput} />
            <div class="import-dropzone__icon">
              {state() === 'processing' ? <FileText size={32} /> : <Upload size={32} />}
            </div>
            <p class="import-dropzone__title">
              {state() === 'processing' ? 'Parsing...' : 'Drop bank statement here'}
            </p>
            <p class="import-dropzone__desc">PDF, CSV, or TXT file</p>
          </div>

          <div class="import-paste">
            <textarea
              class="import-paste__textarea"
              placeholder="Or paste statement text here..."
              rows={4}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handlePaste((e.target as HTMLTextAreaElement).value)
                }
              }}
            />
            <p class="import-paste__hint">Ctrl+Enter to parse</p>
          </div>

          <Show when={error()}>
            <div class="import-error">
              <AlertTriangle size={14} />
              <span>{error()}</span>
            </div>
          </Show>
        </Show>

        <Show when={state() === 'preview'}>
          <div class="import-preview">
            <div class="import-preview__header">
              <span class="import-preview__file">{fileName()}</span>
              <span class="import-preview__count">{summary().count} of {transactions().length} selected</span>
              <button class="btn btn--sm btn--ghost" onClick={selectAll}>All</button>
              <button class="btn btn--sm btn--ghost" onClick={selectNone}>None</button>
              <button class="btn btn--sm btn--ghost" onClick={reset}>Cancel</button>
            </div>

            <div class="import-preview__account">
              <label>Import to:</label>
              <div class="import-preview__account-picker" style={{ position: 'relative' }}>
                <div class="add-txn-dialog__input add-txn-dialog__input--select" onClick={() => setShowAccountPicker(true)}>
                  {selectedAccount() ? selectedAccount()!.name as string : 'Select account...'} ▾
                </div>
                <Show when={showAccountPicker()}>
                  <EntityPicker
                    sections={accountSections()}
                    value={accountId()}
                    placeholder="Search account..."
                    onPick={(id) => { setAccountId(id); setShowAccountPicker(false) }}
                    onCreate={() => {}}
                    onCancel={() => setShowAccountPicker(false)}
                  />
                </Show>
              </div>
            </div>

            <div class="import-preview__table">
              <div class="import-preview__table-header">
                <div class="import-col--check" />
                <div class="import-col--date">Date</div>
                <div class="import-col--desc">Description</div>
                <div class="import-col--amount">Amount</div>
              </div>
              <div class="import-preview__table-body">
                <For each={transactions()}>
                  {(tx, i) => (
                    <div class={`import-row ${selected().has(i()) ? '' : 'import-row--deselected'}`} onClick={() => toggleRow(i())}>
                      <div class="import-col--check">
                        <input type="checkbox" checked={selected().has(i())} onChange={() => toggleRow(i())} />
                      </div>
                      <div class="import-col--date">{tx.date}</div>
                      <div class="import-col--desc">{tx.description.slice(0, 60)}</div>
                      <div class={`import-col--amount ${tx.amount >= 0 ? 'money--positive' : 'money--negative'}`}>
                        {tx.amount < 0 ? '-' : ''}{formatMoneyUnsigned(Math.abs(tx.amount))}
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            <div class="import-preview__footer">
              <Show when={error()}>
                <div class="import-error">
                  <AlertTriangle size={14} />
                  <span>{error()}</span>
                </div>
              </Show>
              <div class="import-preview__summary">
                <span>Income: +{formatMoneyUnsigned(summary().income)}</span>
                <span>Expense: -{formatMoneyUnsigned(Math.abs(summary().expense))}</span>
              </div>
              <button
                class="btn btn--primary"
                disabled={!accountId() || summary().count === 0}
                onClick={confirmImport}
              >
                Import {summary().count} transactions
              </button>
            </div>
          </div>
        </Show>

        <Show when={state() === 'importing'}>
          <div class="import-progress">
            <FileText size={32} />
            <p>Importing transactions...</p>
          </div>
        </Show>

        <Show when={state() === 'done'}>
          <div class="import-done">
            <div class="import-done__icon"><Check size={32} /></div>
            <p class="import-done__title">Import complete</p>
            <p class="import-done__desc">{importCount()} transactions imported.</p>
            <button class="btn btn--primary" onClick={reset}>Import more</button>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default ImportView
