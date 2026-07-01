import { createSignal, createMemo, onMount, onCleanup, Show, For, type Component } from 'solid-js'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-solid'
import { useStore } from '~/App'
import { createQuery } from '~/lib/solid-binding'
import { apiPatch, apiDelete } from '~/lib/api'
import { confirmAction } from '~/components/ConfirmDialog'
import { pushUndo } from '~/lib/undo'
import { clampMenuPosition } from '~/lib/ui'
import TransactionRow from './TransactionRow'
import AddTransactionRow from './AddTransactionRow'
import ScheduleDialog from './ScheduleDialog'
import type { Record } from '~/lib/sync-engine/types'

interface TransactionTableProps {
  accountId?: string
  categoryId?: string
  compact?: boolean
}

const TransactionTable: Component<TransactionTableProps> = (props) => {
  const { raw, reactive } = useStore()
  const allTransactions = createQuery(reactive, 'transactions')
  const accounts = createQuery(reactive, 'accounts')
  const payees = createQuery(reactive, 'payees')
  const categories = createQuery(reactive, 'categories')

  // Sort & filter state
  type SortField = 'date' | 'payee' | 'amount'
  const [sortField, setSortField] = createSignal<SortField>('date')
  const [sortDir, setSortDir] = createSignal<'asc' | 'desc'>('asc')
  const [categoryFilter, setCategoryFilter] = createSignal<Set<string>>(new Set())
  const [showCatFilter, setShowCatFilter] = createSignal(false)

  function toggleSort(field: SortField) {
    if (sortField() === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function toggleCategoryFilter(catId: string) {
    setCategoryFilter(prev => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId); else next.add(catId)
      return next
    })
  }

  function clearCategoryFilter() {
    setCategoryFilter(new Set())
    setShowCatFilter(false)
  }

  const payeeNameMap = createMemo(() => {
    const map = new Map<string, string>()
    for (const p of payees()) map.set(p.id as string, p.name as string)
    return map
  })

  const knownPayees = createMemo(() => {
    return payees().filter(p => !(p.account_id as string)).map(p => ({ id: p.id as string, name: p.name as string }))
  })

  const sorted = createMemo(() => {
    let txns = allTransactions()
    if (props.accountId) {
      txns = txns.filter(tx => tx.account_id === props.accountId)
    }
    if (props.categoryId) {
      txns = txns.filter(tx => tx.category_id === props.categoryId)
    }

    // Apply category filter
    const catFilter = categoryFilter()
    const filtered = catFilter.size > 0
      ? txns.filter(tx => catFilter.has((tx.category_id as string) ?? ''))
      : txns

    // Apply sort
    const field = sortField()
    const dir = sortDir()
    const nameMap = payeeNameMap()
    return filtered.slice().sort((a, b) => {
      let cmp = 0
      if (field === 'date') {
        cmp = (a.date as string).localeCompare(b.date as string)
        if (cmp === 0) cmp = (a.created_at as string).localeCompare(b.created_at as string)
      } else if (field === 'payee') {
        const nameA = nameMap.get(a.payee_id as string) ?? ''
        const nameB = nameMap.get(b.payee_id as string) ?? ''
        cmp = nameA.localeCompare(nameB)
      } else if (field === 'amount') {
        cmp = (a.amount as number) - (b.amount as number)
      }
      return dir === 'asc' ? cmp : -cmp
    })
  })

  const runningBalances = createMemo(() => {
    const txns = sorted()
    const balances = new Array<number>(txns.length)
    let total = 0
    for (let i = 0; i < txns.length; i++) {
      total += txns[i].amount as number
      balances[i] = total
    }
    return balances
  })

  // Virtual scroll state
  const ROW_HEIGHT = 36
  const BUFFER = 5
  let containerRef: HTMLDivElement | undefined
  const [scrollTop, setScrollTop] = createSignal(0)
  const [containerHeight, setContainerHeight] = createSignal(600)

  const visibleRange = createMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop() / ROW_HEIGHT) - BUFFER)
    const end = Math.min(sorted().length, Math.ceil((scrollTop() + containerHeight()) / ROW_HEIGHT) + BUFFER)
    return { start, end }
  })

  const totalHeight = createMemo(() => sorted().length * ROW_HEIGHT)

  function handleScroll() {
    if (containerRef) {
      setScrollTop(containerRef.scrollTop)
    }
  }

  onMount(() => {
    if (containerRef) {
      setContainerHeight(containerRef.clientHeight)
      const observer = new ResizeObserver(() => {
        if (containerRef) setContainerHeight(containerRef.clientHeight)
      })
      observer.observe(containerRef)
      onCleanup(() => observer.disconnect())
    }
  })

  // Row-level edit tracking (only one row editable at a time)
  const [editingRowId, setEditingRowId] = createSignal<string | null>(null)

  // Context menu
  const [ctxMenu, setCtxMenu] = createSignal<{ x: number; y: number; tx: Record } | null>(null)

  function handleContextMenu(e: MouseEvent, tx: Record) {
    e.preventDefault()
    const pos = clampMenuPosition(e.clientX, e.clientY)
    setCtxMenu({ x: pos.x, y: pos.y, tx })
  }

  function closeCtxMenu() {
    setCtxMenu(null)
    setShowCatFilter(false)
  }

  onMount(() => {
    document.addEventListener('click', closeCtxMenu)
    onCleanup(() => document.removeEventListener('click', closeCtxMenu))
  })

  async function ctxToggleCleared(tx: Record) {
    const id = tx.id as string
    const oldCleared = tx.cleared as number
    const newCleared = oldCleared ? 0 : 1
    const updated = { ...tx, cleared: newCleared }
    await raw.put('transactions', updated)
    reactive.notify('transactions')
    apiPatch(`/api/transactions/${id}`, { cleared: !!newCleared }).catch(async () => {
      await raw.put('transactions', { ...tx, cleared: oldCleared })
      reactive.notify('transactions')
    })
    closeCtxMenu()
  }

  async function ctxDelete(tx: Record) {
    closeCtxMenu()
    const id = tx.id as string
    const payeeName = payeeNameMap().get(tx.payee_id as string) ?? 'transaction'
    const confirmed = await confirmAction({
      message: `Delete "${payeeName}"?`,
      actionLabel: 'Delete Transaction',
    })
    if (!confirmed) return

    const oldRecord = { ...tx }
    // If linked (transfer), delete mirror too
    const linkedId = tx.linked_id as string | null
    let linkedRecord: Record | undefined
    if (linkedId) {
      linkedRecord = await raw.get('transactions', linkedId)
      if (linkedRecord) await raw.delete('transactions', linkedId)
    }
    await raw.delete('transactions', id)
    reactive.notify('transactions')

    apiDelete(`/api/transactions/${id}`).catch(async () => {
      await raw.put('transactions', oldRecord)
      if (linkedRecord) await raw.put('transactions', linkedRecord)
      reactive.notify('transactions')
    })

    pushUndo({
      description: `Deleted transaction: ${payeeName}`,
      async undo() {
        await raw.put('transactions', oldRecord)
        if (linkedRecord) await raw.put('transactions', linkedRecord)
        reactive.notify('transactions')
      },
      async redo() {
        await raw.delete('transactions', id)
        if (linkedRecord) await raw.delete('transactions', linkedId!)
        reactive.notify('transactions')
      },
    })
  }

  function ctxEdit(tx: Record) {
    closeCtxMenu()
    setEditingRowId(tx.id as string)
  }

  const [scheduleTx, setScheduleTx] = createSignal<Record | null>(null)

  function ctxMakeRecurring(tx: Record) {
    closeCtxMenu()
    setScheduleTx(tx)
  }

  return (
    <div class="txn-table">
      <Show when={props.accountId && !props.compact}>
        <AddTransactionRow accountId={props.accountId!} />
      </Show>

      <div class="txn-table__header">
        <div class="txn-table__col txn-table__col--check" />
        <div class={`txn-table__col txn-table__col--date txn-header txn-header--sortable ${sortField() === 'date' ? 'txn-header--active' : ''}`} onClick={() => toggleSort('date')}>
          DATE <span class="txn-header__indicator">{sortField() === 'date' ? (sortDir() === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : <ChevronsUpDown size={10} />}</span>
        </div>
        <Show when={!props.accountId || props.compact}>
          <div class="txn-table__col txn-table__col--account">ACCOUNT</div>
        </Show>
        <div class={`txn-table__col txn-table__col--payee txn-header txn-header--sortable ${sortField() === 'payee' ? 'txn-header--active' : ''}`} onClick={() => toggleSort('payee')}>
          PAYEE <span class="txn-header__indicator">{sortField() === 'payee' ? (sortDir() === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : <ChevronsUpDown size={10} />}</span>
        </div>
        <Show when={!props.compact}>
          <div class="txn-table__col txn-table__col--category txn-header txn-header--filterable" onClick={() => setShowCatFilter(!showCatFilter())}>
            CATEGORY <span class="txn-header__indicator">▾</span>
            <Show when={categoryFilter().size > 0}>
              <span class="txn-header__badge">{categoryFilter().size}</span>
            </Show>
          </div>
        </Show>
        <div class="txn-table__col txn-table__col--memo" />
        <div class={`txn-table__col txn-table__col--amount txn-header txn-header--sortable ${sortField() === 'amount' ? 'txn-header--active' : ''}`} onClick={() => toggleSort('amount')}>
          AMOUNT <span class="txn-header__indicator">{sortField() === 'amount' ? (sortDir() === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : <ChevronsUpDown size={10} />}</span>
        </div>
        <Show when={!props.compact}>
          <div class="txn-table__col txn-table__col--balance">BALANCE</div>
        </Show>
        <div class="txn-table__col txn-table__col--status" />
      </div>

      <Show when={showCatFilter()}>
        <div class="cat-filter" onClick={(e) => e.stopPropagation()}>
          <div class="cat-filter__header">
            <span class="cat-filter__title">Filter by category</span>
            <button class="btn btn--sm btn--ghost" onClick={clearCategoryFilter}>Clear</button>
          </div>
          <div class="cat-filter__list">
            <For each={categories().filter(c => !(c.deleted_at as string))}>
              {(cat) => (
                <label class="cat-filter__item">
                  <input
                    type="checkbox"
                    checked={categoryFilter().has(cat.id as string)}
                    onChange={() => toggleCategoryFilter(cat.id as string)}
                  />
                  <span>{cat.name as string}</span>
                </label>
              )}
            </For>
            <label class="cat-filter__item">
              <input
                type="checkbox"
                checked={categoryFilter().has('')}
                onChange={() => toggleCategoryFilter('')}
              />
              <span class="cat-filter__uncategorized">Uncategorized</span>
            </label>
          </div>
        </div>
      </Show>

      <div
        class="txn-table__scroll"
        ref={containerRef}
        onScroll={handleScroll}
      >
        <Show when={sorted().length > 0} fallback={
          <div class="txn-table__empty">
            <span class="txn-table__empty-text">No transactions yet</span>
            <span class="txn-table__empty-hint">Click "+ Add transaction..." above or press ⌘N to get started</span>
          </div>
        }>
          <div style={{ height: `${totalHeight()}px`, position: 'relative' }}>
            <div style={{ transform: `translateY(${visibleRange().start * ROW_HEIGHT}px)` }}>
              <For each={sorted().slice(visibleRange().start, visibleRange().end)}>
                {(tx, i) => (
                  <TransactionRow
                    tx={tx}
                    balance={runningBalances()[visibleRange().start + i()]}
                    onContextMenu={handleContextMenu}
                    showAccount={!props.accountId || !!props.compact}
                    hideCategory={!!props.compact}
                    hideBalance={!!props.compact}
                    editingRowId={editingRowId()}
                    onEditStart={setEditingRowId}
                    onEditEnd={() => setEditingRowId(null)}
                    knownPayees={knownPayees()}
                  />
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>

      <Show when={ctxMenu()}>
        {(menu) => (
          <div class="ctx-menu" style={{ position: 'fixed', left: `${menu().x}px`, top: `${menu().y}px` }}>
            <div class="ctx-menu__item" onClick={() => ctxEdit(menu().tx)}>Edit</div>
            <div class="ctx-menu__item" onClick={() => ctxToggleCleared(menu().tx)}>Toggle Cleared</div>
            <div class="ctx-menu__item" onClick={() => ctxMakeRecurring(menu().tx)}>Make Recurring</div>
            <div class="ctx-menu__sep" />
            <div class="ctx-menu__item ctx-menu__item--danger" onClick={() => ctxDelete(menu().tx)}>Delete</div>
          </div>
        )}
      </Show>

      <Show when={scheduleTx()}>
        {(tx) => (
          <ScheduleDialog
            transaction={{
              account_id: tx().account_id as string,
              category_id: tx().category_id as string | null,
              payee: tx().payee_id ? (payeeNameMap().get(tx().payee_id as string) ?? null) : null,
              amount: tx().amount as number,
              memo: tx().memo as string | null,
            }}
            onClose={() => setScheduleTx(null)}
            onCreated={() => reactive.notify('schedules')}
          />
        )}
      </Show>
    </div>
  )
}

export default TransactionTable
