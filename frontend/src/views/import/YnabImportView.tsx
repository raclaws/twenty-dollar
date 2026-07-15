import { createSignal, Show, For, type Component } from 'solid-js'
import { Upload, Check, AlertTriangle, FileText } from 'lucide-solid'
import { useStore } from '~/App'
import { apiPost } from '~/lib/api'
import { parseYnabExport, type YnabImportResult } from '~/lib/ynab-parser'

type ImportState = 'idle' | 'parsed' | 'importing' | 'done' | 'error'

const YnabImportView: Component = () => {
  const { raw, reactive } = useStore()

  const [state, setState] = createSignal<ImportState>('idle')
  const [result, setResult] = createSignal<YnabImportResult | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [progress, setProgress] = createSignal('')
  const [stats, setStats] = createSignal<{ skipped: number; created: number }>({ skipped: 0, created: 0 })

  let registerInput: HTMLInputElement | undefined
  let planInput: HTMLInputElement | undefined
  const [registerFile, setRegisterFile] = createSignal<File | null>(null)
  const [planFile, setPlanFile] = createSignal<File | null>(null)

  async function handleParse() {
    const reg = registerFile()
    const plan = planFile()
    if (!reg || !plan) {
      setError('Both Register and Plan TSV files are required.')
      return
    }

    setError(null)
    try {
      const registerText = await reg.text()
      const planText = await plan.text()
      const parsed = parseYnabExport(registerText, planText)
      setResult(parsed)
      setState('parsed')
    } catch (e: any) {
      setError(`Parse failed: ${e.message}`)
      setState('error')
    }
  }

  async function handleImport() {
    const data = result()
    if (!data) return

    setState('importing')
    setError(null)
    let skipped = 0
    let created = 0

    try {
      // Load existing data for dedup
      const existingAccounts = await raw.getAll('accounts')
      const existingGroups = await raw.getAll('category_groups')
      const existingCategories = await raw.getAll('categories')
      const existingPayees = await raw.getAll('payees')
      const existingTxns = await raw.getAll('transactions')

      const existingAccountNames = new Set(existingAccounts.map(a => (a.name as string).toLowerCase()))
      const existingGroupNames = new Set(existingGroups.map(g => (g.name as string).toLowerCase()))
      const existingPayeeNames = new Set(existingPayees.map(p => (p.name as string).toLowerCase()))
      const existingTxKeys = new Set(existingTxns.map(t => `${t.date}|${t.amount}|${t.account_id}`))

      // 1. Create accounts (dedup by name)
      setProgress('Creating accounts...')
      const accountIdMap = new Map<string, string>()
      for (let i = 0; i < data.accounts.length; i++) {
        const acc = data.accounts[i]
        const existing = existingAccounts.find(a => (a.name as string).toLowerCase() === acc.name.toLowerCase())
        if (existing) {
          accountIdMap.set(acc.name, existing.id as string)
          skipped++
          continue
        }
        const id = crypto.randomUUID()
        accountIdMap.set(acc.name, id)
        const record = { id, name: acc.name, type: acc.account_type, icon: null, sort_order: existingAccounts.length + i, created_at: new Date().toISOString(), deleted_at: null }
        await apiPost('/api/accounts', record)
        await raw.put('accounts', record)
        created++
      }
      reactive.notify('accounts')

      // 2. Create category groups + categories (dedup by name)
      setProgress('Creating categories...')
      const categoryIdMap = new Map<string, string>()
      for (let gi = 0; gi < data.category_groups.length; gi++) {
        const group = data.category_groups[gi]
        let groupId: string

        const existingGroup = existingGroups.find(g => (g.name as string).toLowerCase() === group.name.toLowerCase())
        if (existingGroup) {
          groupId = existingGroup.id as string
          skipped++
        } else {
          groupId = crypto.randomUUID()
          await apiPost('/api/category-groups', { id: groupId, name: group.name, icon: null, sort_order: existingGroups.length + gi })
          await raw.put('category_groups', { id: groupId, name: group.name, icon: null, sort_order: existingGroups.length + gi })
          created++
        }

        for (let ci = 0; ci < group.categories.length; ci++) {
          const cat = group.categories[ci]
          const key = `${group.name}::${cat}`
          const existingCat = existingCategories.find(c => (c.name as string).toLowerCase() === cat.toLowerCase() && c.group_id === groupId)
          if (existingCat) {
            categoryIdMap.set(key, existingCat.id as string)
            skipped++
            continue
          }
          const catId = crypto.randomUUID()
          categoryIdMap.set(key, catId)
          await apiPost('/api/categories', { id: catId, group_id: groupId, name: cat, icon: null, sort_order: ci, target_type: null, target_amount: null, target_date: null })
          await raw.put('categories', { id: catId, group_id: groupId, name: cat, icon: null, sort_order: ci, target_type: null, target_amount: null, target_date: null })
          created++
        }
      }
      reactive.notify('category_groups')
      reactive.notify('categories')

      // 3. Create payees (dedup by name) + transfer payees with type='account'
      setProgress('Creating payees...')
      const payeeIdMap = new Map<string, string>()

      // Create account-type transfer payees
      for (const [name, accId] of accountIdMap) {
        const existing = existingPayees.find(p => (p.account_id as string) === accId)
        if (existing) {
          payeeIdMap.set(`__transfer__${name}`, existing.id as string)
          continue
        }
        const id = crypto.randomUUID()
        payeeIdMap.set(`__transfer__${name}`, id)
        const record = { id, name, type: 'account', account_id: accId, created_at: new Date().toISOString() }
        await apiPost('/api/payees', record)
        await raw.put('payees', record)
      }

      // Create regular payees
      for (const p of data.payees) {
        if (existingPayeeNames.has(p.name.toLowerCase())) {
          const existing = existingPayees.find(ep => (ep.name as string).toLowerCase() === p.name.toLowerCase())
          if (existing) payeeIdMap.set(p.name, existing.id as string)
          skipped++
          continue
        }
        const id = crypto.randomUUID()
        payeeIdMap.set(p.name, id)
        const record = { id, name: p.name, type: 'external', account_id: null, created_at: new Date().toISOString() }
        await apiPost('/api/payees', record)
        await raw.put('payees', record)
        created++
      }
      reactive.notify('payees')

      // 4. Create transactions (dedup by date+amount+account)
      setProgress(`Creating transactions...`)
      const batchSize = 20
      let txCreated = 0
      let txSkipped = 0
      for (let i = 0; i < data.transactions.length; i += batchSize) {
        const batch = data.transactions.slice(i, i + batchSize)
        await Promise.all(batch.map(async tx => {
          const id = crypto.randomUUID()
          const accountId = accountIdMap.get(tx.account) || ''
          const txKey = `${tx.date}|${tx.amount}|${accountId}`

          if (existingTxKeys.has(txKey)) {
            txSkipped++
            return
          }
          existingTxKeys.add(txKey)

          const catKey = tx.category_group && tx.category ? `${tx.category_group}::${tx.category}` : null
          const categoryId = catKey ? categoryIdMap.get(catKey) || null : null
          const payeeId = tx.payee ? payeeIdMap.get(tx.payee) || null : null

          const record = {
            id,
            account_id: accountId,
            payee_id: payeeId,
            category_id: tx.splits ? null : categoryId,
            date: tx.date,
            amount: tx.amount,
            memo: tx.memo,
            cleared: tx.cleared ? 1 : 0,
            linked_id: null,
            source: 'ynab-import',
            created_at: new Date().toISOString(),
          }

          const apiSplits = tx.splits ? tx.splits.map(s => {
            const sCatKey = s.category_group && s.category ? `${s.category_group}::${s.category}` : null
            const sCatId = sCatKey ? categoryIdMap.get(sCatKey) || null : null
            return { category_id: sCatId, amount: s.amount, memo: s.memo }
          }) : []

          await apiPost('/api/transactions', { ...record, payee: tx.payee, cleared: tx.cleared, splits: apiSplits })
          await raw.put('transactions', record)

          if (tx.splits) {
            for (const split of apiSplits) {
              const splitId = crypto.randomUUID()
              await raw.put('split_entries', { id: splitId, transaction_id: id, category_id: split.category_id, amount: split.amount, memo: split.memo })
            }
          }
          txCreated++
        }))
        setProgress(`Transactions: ${txCreated} created, ${txSkipped} skipped (${Math.min(i + batchSize, data.transactions.length)}/${data.transactions.length})`)
      }
      reactive.notify('transactions')
      reactive.notify('split_entries')
      created += txCreated
      skipped += txSkipped

      // 5. Create transfers
      setProgress('Creating transfers...')
      for (const tf of data.transfers) {
        const fromId = accountIdMap.get(tf.from_account) || ''
        const toId = accountIdMap.get(tf.to_account) || ''
        const tfKey = `${tf.date}|${-tf.amount}|${fromId}`
        if (existingTxKeys.has(tfKey)) {
          skipped++
          continue
        }
        await apiPost('/api/transfers', { from_account_id: fromId, to_account_id: toId, date: tf.date, amount: tf.amount, memo: tf.memo, cleared: tf.cleared })
        created++
      }

      // 6. Create assignments (upsert by category+month)
      setProgress(`Creating budget assignments...`)
      for (const a of data.assignments) {
        const catKey = `${a.category_group}::${a.category}`
        const categoryId = categoryIdMap.get(catKey)
        if (!categoryId) continue
        await apiPost('/api/budget/assign', { category_id: categoryId, month: a.month, amount: a.amount })
        const id = crypto.randomUUID()
        await raw.put('assignments', { id, category_id: categoryId, month: a.month, amount: a.amount })
        created++
      }
      reactive.notify('assignments')

      setStats({ skipped, created })
      setState('done')
      setProgress('')
    } catch (e: any) {
      setError(`Import failed: ${e.message}`)
      setState('error')
    }
  }

  return (
    <div class="import-view__content">
      <p class="ynab-import__desc">
        Import your YNAB budget data from TSV export files. Creates accounts, categories, transactions, transfers, and budget assignments.
      </p>

        <Show when={state() === 'idle' || state() === 'error'}>
          <div class="ynab-import__fields">
            <div class="ynab-import__field">
              <label class="ynab-import__label">Register TSV</label>
              <div class="ynab-import__file-row">
                <button class="btn btn--sm btn--secondary" onClick={() => registerInput?.click()}>
                  <Upload size={14} /> Choose file
                </button>
                <span class="ynab-import__filename">{registerFile()?.name || 'No file selected'}</span>
              </div>
              <input ref={registerInput} type="file" accept=".tsv" style="display:none" onChange={e => setRegisterFile((e.target as HTMLInputElement).files?.[0] || null)} />
            </div>

            <div class="ynab-import__field">
              <label class="ynab-import__label">Plan TSV</label>
              <div class="ynab-import__file-row">
                <button class="btn btn--sm btn--secondary" onClick={() => planInput?.click()}>
                  <Upload size={14} /> Choose file
                </button>
                <span class="ynab-import__filename">{planFile()?.name || 'No file selected'}</span>
              </div>
              <input ref={planInput} type="file" accept=".tsv" style="display:none" onChange={e => setPlanFile((e.target as HTMLInputElement).files?.[0] || null)} />
            </div>

            <button class="btn btn--primary" onClick={handleParse} disabled={!registerFile() || !planFile()}>
              <FileText size={14} /> Parse Files
            </button>
          </div>
        </Show>

        <Show when={state() === 'parsed' && result()}>
          <div class="ynab-import__preview">
            <h3 class="ynab-import__preview-title">Preview</h3>
            <table class="ynab-import__table">
              <tbody>
                <tr><td>Accounts</td><td class="ynab-import__table-value">{result()!.accounts.length}</td></tr>
                <tr><td>Category Groups</td><td class="ynab-import__table-value">{result()!.category_groups.length}</td></tr>
                <tr><td>Categories</td><td class="ynab-import__table-value">{result()!.category_groups.reduce((s, g) => s + g.categories.length, 0)}</td></tr>
                <tr><td>Payees</td><td class="ynab-import__table-value">{result()!.payees.length}</td></tr>
                <tr><td>Transactions</td><td class="ynab-import__table-value">{result()!.transactions.length}</td></tr>
                <tr><td>Transfers</td><td class="ynab-import__table-value">{result()!.transfers.length}</td></tr>
                <tr><td>Assignments</td><td class="ynab-import__table-value">{result()!.assignments.length}</td></tr>
              </tbody>
            </table>

            <div class="ynab-import__accounts">
              <h4 class="ynab-import__accounts-title">Accounts</h4>
              <For each={result()!.accounts}>
                {a => <div class="ynab-import__accounts-item">{a.name} <span class="ynab-import__accounts-type">({a.account_type})</span></div>}
              </For>
            </div>

            <div class="ynab-import__actions">
              <button class="btn btn--primary" onClick={handleImport}>
                <Check size={14} /> Import All
              </button>
              <button class="btn btn--secondary" onClick={() => { setState('idle'); setResult(null) }}>
                Cancel
              </button>
            </div>
          </div>
        </Show>

        <Show when={state() === 'importing'}>
          <div class="ynab-import__status">
            <p class="ynab-import__progress">{progress()}</p>
          </div>
        </Show>

        <Show when={state() === 'done'}>
          <div class="ynab-import__status ynab-import__status--success">
            <p class="ynab-import__done"><Check size={14} /> Import complete — {stats().created} created, {stats().skipped} skipped (duplicates)</p>
          </div>
        </Show>

        <Show when={error()}>
          <div class="import-error">
            <AlertTriangle size={14} /> {error()}
          </div>
        </Show>
      </div>
  )
}

export default YnabImportView
