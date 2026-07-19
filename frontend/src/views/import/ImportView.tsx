import { createSignal, createMemo, For, Show, onCleanup, type Component } from 'solid-js'
import { Upload, FileText, Check, X, AlertTriangle, Tag } from 'lucide-solid'
import { useStore } from '~/App'
import { createQuery } from '~/lib/solid-binding'
import { apiPost, apiPatch, apiGet, apiDelete } from '~/lib/api'
import { parse, type Transaction } from '~/lib/tx-parser'
import { extractTextFromPDF } from '~/lib/tx-parser/pdf-extract'
import { clusterDescriptions, matchAgainstRules, extractSignature, signatureKey, type DescriptionCluster } from '~/lib/tx-parser/clusterer'
import { formatMoneyUnsigned } from '~/lib/format'
import { pushUndo } from '~/lib/undo'
import { confirmAction } from '~/components/ConfirmDialog'
import EntityPicker, { type EntityPickerSection } from '~/components/EntityPicker'
import { PayeePicker, CategoryPicker } from '~/components/Pickers'
import YnabImportView from './YnabImportView'

type ImportState = 'idle' | 'processing' | 'preview' | 'importing' | 'categorize' | 'done'

function dayBefore(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

type ImportSource = 'smart' | 'ynab'

const ImportView: Component = () => {
  const { raw, reactive } = useStore()
  const accounts = createQuery(reactive, 'accounts')
  const payees = createQuery(reactive, 'payees')
  const categories = createQuery(reactive, 'categories')
  const categoryGroups = createQuery(reactive, 'category_groups')

  const [source, setSource] = createSignal<ImportSource>('smart')
  const [state, setState] = createSignal<ImportState>('idle')
  const [transactions, setTransactions] = createSignal<Transaction[]>([])
  const [selected, setSelected] = createSignal<Set<number>>(new Set())
  const [accountId, setAccountId] = createSignal<string>('')
  const [showAccountPicker, setShowAccountPicker] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [importCount, setImportCount] = createSignal(0)
  const [skippedCount, setSkippedCount] = createSignal(0)
  const [fileName, setFileName] = createSignal('')
  const [clusters, setClusters] = createSignal<DescriptionCluster[]>([])
  const [clusterAssignments, setClusterAssignments] = createSignal<Map<string, { payeeId: string | null; categoryId: string | null }>>(new Map())
  const [editingCluster, setEditingCluster] = createSignal<{ key: string; field: 'payee' | 'category' } | null>(null)
  const [importedTxIds, setImportedTxIds] = createSignal<string[]>([])
  const [prefilledKeys, setPrefilledKeys] = createSignal<Set<string>>(new Set())
  let fileInput: HTMLInputElement | undefined

  // Auto-cancel on unmount: if navigating away mid-import, delete imported transactions
  onCleanup(() => {
    const ids = importedTxIds()
    const s = state()
    if (ids.length > 0 && (s === 'categorize' || s === 'importing')) {
      for (const id of ids) {
        raw.delete('transactions', id)
        apiDelete(`/api/transactions/${id}`).catch(() => {})
      }
      reactive.notify('transactions')
    }
  })

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
    const selectedTxns = txns.filter((_, i) => sel.has(i))

    // Dedup: skip transactions matching existing date+amount+account
    const existingTxns = await raw.query('transactions', { where: { account_id: accountId() } })
    const existingKeys = new Set(existingTxns.map(t => `${t.date}|${t.amount}|${t.account_id}`))
    const toImport = selectedTxns.filter(tx => !existingKeys.has(`${tx.date}|${tx.amount}|${accountId()}`))
    const skipped = selectedTxns.length - toImport.length

    let imported = 0
    const txIds: string[] = []
    const batchSize = 10
    for (let i = 0; i < toImport.length; i += batchSize) {
      const batch = toImport.slice(i, i + batchSize)
      await Promise.all(batch.map(tx => {
        const id = crypto.randomUUID()
        txIds.push(id)
        const record = {
          id,
          account_id: accountId(),
          date: tx.date,
          amount: tx.amount,
          payee: null,
          payee_id: null,
          category_id: null,
          memo: tx.description,
          cleared: false,
          linked_id: null,
          source: 'import',
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
    setSkippedCount(skipped)
    setImportedTxIds(txIds)

    // Push undo for the entire import batch
    const importedIds = [...txIds]
    pushUndo({
      description: `Imported ${imported} transactions`,
      async undo() {
        for (const id of importedIds) await raw.delete('transactions', id)
        reactive.notify('transactions')
      },
      async redo() {
        // Re-import not supported via undo — transactions are gone from server too
      },
    })

    // Import Carry: create a counterbalance transaction so Starting Balance stays truthful.
    // Dated 1 day before earliest imported transaction. Amount = inverse of imported net.
    const allTxns = await raw.query('transactions', { where: { account_id: accountId() } })
    const startingBal = allTxns.find(t => (t.payee as string) === 'Starting Balance')
    if (startingBal) {
      const startDate = startingBal.date as string
      const importedBefore = toImport.filter(t => t.date < startDate)
      if (importedBefore.length > 0) {
        const net = importedBefore.reduce((sum, t) => sum + t.amount, 0)
        if (net !== 0) {
          const earliest = importedBefore.reduce((min, t) => t.date < min ? t.date : min, importedBefore[0].date)
          const carryDate = dayBefore(earliest)
          const carryId = crypto.randomUUID()
          const carryRecord = {
            id: carryId, account_id: accountId(), date: carryDate, amount: -net,
            payee: 'Import Carry', payee_id: null, category_id: null,
            memo: `Offset for ${importedBefore.length} imported transactions`, cleared: true,
            linked_id: null, source: 'system', splits: [], created_at: new Date().toISOString(),
          }
          txIds.push(carryId)
          await raw.put('transactions', { ...carryRecord, cleared: 1 })
          reactive.notify('transactions')
          apiPost('/api/transactions', carryRecord).catch(() => {})
        }
      }
    }

    // Build clusters for categorize step
    const descriptions = toImport.map(t => t.description)
    const amounts = toImport.map(t => t.amount)
    const importClusters = clusterDescriptions(descriptions, amounts)

    // Pre-fill from saved rules
    let rules: { tokens: string[]; payeeId: string | null; categoryId: string | null }[] = []
    try {
      const savedRules = await apiGet('/api/import-rules') as any[]
      rules = savedRules.map(r => ({
        tokens: (r.tokens as string).split(' '),
        payeeId: r.payee_id,
        categoryId: r.category_id,
      }))
    } catch {}

    const assignments = new Map<string, { payeeId: string | null; categoryId: string | null }>()
    const matched = new Set<string>()
    for (const cluster of importClusters) {
      const match = matchAgainstRules(cluster.sampleDescription, rules)
      if (match) {
        assignments.set(cluster.key, match)
        matched.add(cluster.key)
      }
    }

    setClusters(importClusters)
    setClusterAssignments(assignments)
    setPrefilledKeys(matched)

    if (importClusters.length > 0) {
      setState('categorize')
    } else {
      setState('done')
    }
  }

  function setClusterPayee(key: string, payeeId: string | null) {
    setClusterAssignments(prev => {
      const next = new Map(prev)
      const existing = next.get(key) ?? { payeeId: null, categoryId: null }
      next.set(key, { ...existing, payeeId })
      return next
    })
    setEditingCluster(null)
  }

  function setClusterCategory(key: string, categoryId: string | null) {
    setClusterAssignments(prev => {
      const next = new Map(prev)
      const existing = next.get(key) ?? { payeeId: null, categoryId: null }
      next.set(key, { ...existing, categoryId })
      return next
    })
    setEditingCluster(null)
  }

  async function applyCategorization() {
    const txns = transactions()
    const sel = selected()
    const toImport = txns.filter((_, i) => sel.has(i))
    const txIds = importedTxIds()
    const assignMap = clusterAssignments()
    const clusterList = clusters()

    // Apply assignments to imported transactions
    for (const cluster of clusterList) {
      const assignment = assignMap.get(cluster.key)
      if (!assignment || (!assignment.payeeId && !assignment.categoryId)) continue

      for (const idx of cluster.indices) {
        const txId = txIds[idx]
        if (!txId) continue

        const tx = await raw.get('transactions', txId)
        if (!tx) continue

        const patch: any = {}
        if (assignment.payeeId) { patch.payee_id = assignment.payeeId }
        if (assignment.categoryId) { patch.category_id = assignment.categoryId }

        await raw.put('transactions', { ...tx, ...patch })
        apiPatch(`/api/transactions/${txId}`, patch).catch(() => {})
      }
    }
    reactive.notify('transactions')

    // Save new rules
    for (const cluster of clusterList) {
      const assignment = assignMap.get(cluster.key)
      if (!assignment || (!assignment.payeeId && !assignment.categoryId)) continue

      const ruleId = crypto.randomUUID()
      const tokens = signatureKey(cluster.tokens)
      apiPost('/api/import-rules', {
        id: ruleId,
        tokens,
        payee_id: assignment.payeeId,
        category_id: assignment.categoryId,
      }).catch(() => {})
    }

    setState('done')
  }

  function skipCategorize() {
    setState('done')
  }

  async function cancelImport() {
    const ids = importedTxIds()
    if (ids.length === 0) return

    const confirmed = await confirmAction({
      message: `Cancel import? This will delete ${ids.length} imported transaction${ids.length > 1 ? 's' : ''}.`,
      actionLabel: 'Cancel Import',
    })
    if (!confirmed) return

    for (const id of ids) {
      await raw.delete('transactions', id)
      apiDelete(`/api/transactions/${id}`).catch(() => {})
    }
    reactive.notify('transactions')
    reset()
  }

  function reset() {
    setState('idle')
    setTransactions([])
    setSelected(new Set())
    setError(null)
    setFileName('')
    setImportCount(0)
    setSkippedCount(0)
    setClusters([])
    setClusterAssignments(new Map())
    setEditingCluster(null)
    setImportedTxIds([])
    setPrefilledKeys(new Set())
    if (fileInput) fileInput.value = ''
  }

  return (
    <div class="import-view">
      <div class="import-view__topbar">
        <h1 class="import-view__title">Import</h1>
        <div class="import-view__tabs">
          <button class={`import-view__tab ${source() === 'smart' ? 'import-view__tab--active' : ''}`} onClick={() => setSource('smart')}>Smart Import</button>
          <button class={`import-view__tab ${source() === 'ynab' ? 'import-view__tab--active' : ''}`} onClick={() => setSource('ynab')}>YNAB Export</button>
        </div>
      </div>

      <Show when={source() === 'ynab'}>
        <YnabImportView />
      </Show>

      <Show when={source() === 'smart'}>
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

        <Show when={state() === 'categorize'}>
          <div class="import-categorize">
            <div class="import-categorize__header">
              <div class="import-categorize__title">
                <Tag size={16} />
                <span>Categorize {importCount()} transactions</span>
              </div>
              <p class="import-categorize__desc">Assign payee and category per group. These rules auto-apply on future imports.</p>
            </div>

            <div class="import-categorize__list">
              <For each={clusters()}>
                {(cluster) => {
                  const assignment = () => clusterAssignments().get(cluster.key)
                  const isEditingPayee = () => editingCluster()?.key === cluster.key && editingCluster()?.field === 'payee'
                  const isEditingCategory = () => editingCluster()?.key === cluster.key && editingCluster()?.field === 'category'
                  return (
                    <div class="import-cluster">
                      <div class="import-cluster__info">
                        <div class="import-cluster__sample">{cluster.sampleDescription.slice(0, 80)}</div>
                        <div class="import-cluster__meta">
                          <span class="import-cluster__count">{cluster.indices.length} txn{cluster.indices.length > 1 ? 's' : ''}</span>
                          <span class="import-cluster__range">
                            {cluster.amountMin < 0 ? '-' : ''}{formatMoneyUnsigned(Math.abs(cluster.amountMin))}
                            {cluster.amountMin !== cluster.amountMax ? ` – ${cluster.amountMax < 0 ? '-' : ''}${formatMoneyUnsigned(Math.abs(cluster.amountMax))}` : ''}
                          </span>
                        </div>
                      </div>
                      <div class="import-cluster__assignments">
                        <div class="import-cluster__field" style={{ position: 'relative' }}>
                          {(() => {
                            const a = assignment()
                            const pid = a?.payeeId
                            const payee = pid ? payees().find(p => p.id === pid) : null
                            const label = payee ? payee.name as string : null
                            const isAuto = pid && prefilledKeys().has(cluster.key)
                            return (
                              <div class={`import-cluster__pill ${label ? (isAuto ? 'import-cluster__pill--auto' : 'import-cluster__pill--set') : ''}`} onClick={() => setEditingCluster({ key: cluster.key, field: 'payee' })}>
                                {label ? (isAuto ? `⚡ ${label}` : label) : 'Set payee...'}
                              </div>
                            )
                          })()}
                          <Show when={isEditingPayee()}>
                            <PayeePicker
                              value={assignment()?.payeeId ?? ''}
                              knownPayees={payees().filter(p => (p.type as string) !== 'account').map(p => ({ id: p.id as string, name: p.name as string }))}
                              accounts={[]}
                              onPick={(id) => setClusterPayee(cluster.key, id)}
                              onCancel={() => setEditingCluster(null)}
                              onTab={() => setEditingCluster({ key: cluster.key, field: 'category' })}
                            />
                          </Show>
                        </div>
                        <div class="import-cluster__field" style={{ position: 'relative' }}>
                          {(() => {
                            const a = assignment()
                            const cid = a?.categoryId
                            const cat = cid ? categories().find(c => c.id === cid) : null
                            const label = cat ? cat.name as string : null
                            const isAuto = cid && prefilledKeys().has(cluster.key)
                            return (
                              <div class={`import-cluster__pill ${label ? (isAuto ? 'import-cluster__pill--auto' : 'import-cluster__pill--set') : ''}`} onClick={() => setEditingCluster({ key: cluster.key, field: 'category' })}>
                                {label ? (isAuto ? `⚡ ${label}` : label) : 'Set category...'}
                              </div>
                            )
                          })()}
                          <Show when={isEditingCategory()}>
                            <CategoryPicker
                              value={assignment()?.categoryId ?? ''}
                              groups={categoryGroups()}
                              categories={categories()}
                              onPick={(id) => setClusterCategory(cluster.key, id)}
                              onCancel={() => setEditingCluster(null)}
                              onTab={() => setEditingCluster(null)}
                            />
                          </Show>
                        </div>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>

            <div class="import-categorize__footer">
              <button class="btn btn--sm btn--ghost btn--danger" onClick={cancelImport}>Cancel Import</button>
              <button class="btn btn--sm btn--ghost" onClick={skipCategorize}>Skip</button>
              <button class="btn btn--primary" onClick={applyCategorization}>Apply & Save Rules</button>
            </div>
          </div>
        </Show>

        <Show when={state() === 'done'}>
          <div class="import-done">
            <div class="import-done__icon"><Check size={32} /></div>
            <p class="import-done__title">Import complete</p>
            <p class="import-done__desc">{importCount()} transactions imported{skippedCount() > 0 ? `, ${skippedCount()} skipped (duplicates)` : ''}.</p>

            <button class="btn btn--primary" onClick={reset}>Import more</button>
            <button class="btn btn--sm btn--ghost btn--danger" onClick={cancelImport}>Cancel Import</button>
          </div>
        </Show>
      </div>
      </Show>
    </div>
  )
}

export default ImportView
