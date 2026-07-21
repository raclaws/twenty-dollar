import { createSignal, createMemo, onMount, onCleanup, Show, For, type Component } from 'solid-js'
import { ChevronUp, ChevronDown, ChevronsUpDown, Layers, CircleCheck } from 'lucide-solid'
import { useStore } from '~/App'
import { createQuery } from '~/lib/solid-binding'
import { apiPatch, apiDelete } from '~/lib/api'
import { serverFirst } from '~/lib/server-first'
import { confirmAction } from '~/components/ConfirmDialog'
import { pushUndo, useUndoKeyboard } from '~/lib/undo'
import { clampMenuPosition } from '~/lib/ui'
import { groupItems, type GroupConfig } from '~/lib/grouping'
import GroupHeader from '~/components/GroupHeader'
import MoneyDisplay from '~/components/MoneyDisplay'
import TransactionRow from './TransactionRow'
import TransactionSheet from '~/components/TransactionSheet'
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
  useUndoKeyboard()
  const allTransactions = createQuery(reactive, 'transactions')
  const accounts = createQuery(reactive, 'accounts')
  const payees = createQuery(reactive, 'payees')
  const categories = createQuery(reactive, 'categories')

  // Mobile detection + sheet state
  const [isMobile, setIsMobile] = createSignal(window.matchMedia('(max-width: 768px)').matches)
  const [sheetTx, setSheetTx] = createSignal<Record | null>(null)

  onMount(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    onCleanup(() => mq.removeEventListener('change', handler))
  })

  // Sort & filter state
  type SortField = 'date' | 'payee' | 'category' | 'amount'
  const [sortField, setSortField] = createSignal<SortField>('date')
  const [sortDir, setSortDir] = createSignal<'asc' | 'desc'>('desc')
  const [categoryFilter, setCategoryFilter] = createSignal<Set<string>>(new Set())
  const [showCatFilter, setShowCatFilter] = createSignal(false)

  // Grouping state
  type GroupByField = 'none' | 'month' | 'date' | 'payee' | 'category' | 'account'
  const [groupBy, setGroupBy] = createSignal<GroupByField>('month')
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set())
  const [showGroupMenu, setShowGroupMenu] = createSignal(false)

  // Bulk selection state
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set())
  const [lastSelectedId, setLastSelectedId] = createSignal<string | null>(null)
  const [selectionAnchor, setSelectionAnchor] = createSignal<number>(-1)

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function toggleSort(field: SortField) {
    if (sortField() === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function handleHeaderClick(field: SortField, e: MouseEvent) {
    if (e.shiftKey) {
      const groupField: GroupByField = field === 'date' ? 'month' : field === 'amount' ? 'none' : field
      setGroupBy(prev => prev === groupField ? 'none' : groupField)
      setCollapsed(new Set())
    } else {
      toggleSort(field)
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

  const categoryNameMap = createMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories()) map.set(c.id as string, c.name as string)
    return map
  })

  const accountNameMap = createMemo(() => {
    const map = new Map<string, string>()
    for (const a of accounts()) map.set(a.id as string, a.name as string)
    return map
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
    const catMap = categoryNameMap()
    return filtered.slice().sort((a, b) => {
      let cmp = 0
      if (field === 'date') {
        cmp = (a.date as string).localeCompare(b.date as string)
        if (cmp === 0) cmp = (a.created_at as string).localeCompare(b.created_at as string)
      } else if (field === 'payee') {
        const nameA = nameMap.get(a.payee_id as string) ?? ''
        const nameB = nameMap.get(b.payee_id as string) ?? ''
        cmp = nameA.localeCompare(nameB)
      } else if (field === 'category') {
        const catA = catMap.get((a.category_id as string) ?? '') ?? ''
        const catB = catMap.get((b.category_id as string) ?? '') ?? ''
        cmp = catA.localeCompare(catB)
      } else if (field === 'amount') {
        cmp = (a.amount as number) - (b.amount as number)
      }
      return dir === 'asc' ? cmp : -cmp
    })
  })

  const clearedStats = createMemo(() => {
    const txns = sorted()
    const total = txns.length
    const cleared = txns.filter(tx => (tx.cleared as number) === 1).length
    return { cleared, total }
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

  // Grouping configs

  function getGroupConfig(): GroupConfig<Record> | null {
    const field = groupBy()
    if (field === 'none') return null
    const pMap = payeeNameMap()
    const cMap = categoryNameMap()
    const aMap = accountNameMap()
    const descending = sortDir() === 'desc'
    switch (field) {
      case 'month': return { key: (tx) => ((tx.date as string) ?? '').slice(0, 7), label: (k) => k || 'No date', sort: (a, b) => descending ? b.localeCompare(a) : a.localeCompare(b) }
      case 'date': return { key: (tx) => (tx.date as string) ?? '', label: (k) => k || 'No date', sort: (a, b) => descending ? b.localeCompare(a) : a.localeCompare(b) }
      case 'payee': return { key: (tx) => (tx.payee_id as string) ?? (tx.payee as string) ?? '', label: (k) => k ? (pMap.get(k) ?? k) : 'No payee' }
      case 'category': return { key: (tx) => (tx.category_id as string) ?? '', label: (k) => k ? (cMap.get(k) ?? 'Unknown') : 'Uncategorized' }
      case 'account': return { key: (tx) => (tx.account_id as string) ?? '', label: (k) => k ? (aMap.get(k) ?? 'Unknown') : 'No account' }
    }
  }

  type VirtualItem =
    | { type: 'header'; key: string; label: string; count: number; aggregate: number; cleared: number }
    | { type: 'row'; tx: Record; balance: number; txId: string }

  const virtualItems = createMemo((): VirtualItem[] => {
    const txns = sorted()
    const config = getGroupConfig()
    if (!config) {
      const balances = runningBalances()
      return txns.map((tx, i) => ({ type: 'row', tx, balance: balances[i], txId: tx.id as string }))
    }

    const groups = groupItems(txns, config)
    const collapsedSet = collapsed()
    const items: VirtualItem[] = []
    let runningTotal = 0

    for (const group of groups) {
      const aggregate = group.items.reduce((sum, tx) => sum + (tx.amount as number), 0)
      const cleared = group.items.filter(tx => (tx.cleared as number) === 1).length
      items.push({ type: 'header', key: group.key, label: group.label, count: group.items.length, aggregate, cleared })

      if (!collapsedSet.has(group.key)) {
        for (const tx of group.items) {
          runningTotal += tx.amount as number
          items.push({ type: 'row', tx, balance: runningTotal, txId: tx.id as string })
        }
      } else {
        for (const tx of group.items) {
          runningTotal += tx.amount as number
        }
      }
    }
    return items
  })

  // Virtual scroll state
  const DEFAULT_ROW_HEIGHT = 36
  const BUFFER = 5
  let containerRef: HTMLDivElement | undefined
  const [scrollTop, setScrollTop] = createSignal(0)
  const [containerHeight, setContainerHeight] = createSignal(600)
  const [rowHeight, setRowHeight] = createSignal(DEFAULT_ROW_HEIGHT)

  const visibleRange = createMemo(() => {
    const total = virtualItems().length
    const h = rowHeight()
    const start = Math.max(0, Math.floor(scrollTop() / h) - BUFFER)
    const end = Math.min(total, Math.ceil((scrollTop() + containerHeight()) / h) + BUFFER)
    return { start, end }
  })

  const totalHeight = createMemo(() => virtualItems().length * rowHeight())

  const txLookup = createMemo(() => {
    const map = new Map<string, Record>()
    for (const item of virtualItems()) {
      if (item.type === 'row') map.set((item as any).txId, (item as any).tx)
    }
    return map
  })

  function handleScroll() {
    if (containerRef) {
      setScrollTop(containerRef.scrollTop)
    }
  }

  onMount(() => {
    if (containerRef) {
      setContainerHeight(containerRef.clientHeight)
      const computeRowHeight = () => {
        const val = parseInt(getComputedStyle(containerRef!).getPropertyValue('--row-h'), 10)
        setRowHeight(val > 0 ? val : DEFAULT_ROW_HEIGHT)
      }
      computeRowHeight()
      const observer = new ResizeObserver(() => {
        if (containerRef) {
          setContainerHeight(containerRef.clientHeight)
          computeRowHeight()
        }
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
    await serverFirst({
      async optimistic() {
        await raw.put('transactions', updated)
        reactive.notify('transactions')
      },
      request: () => apiPatch(`/api/transactions/${id}`, { cleared: !!newCleared }),
      async rollback() {
        await raw.put('transactions', { ...tx, cleared: oldCleared })
        reactive.notify('transactions')
      },
    })
    closeCtxMenu()
  }

  async function ctxDelete(tx: Record) {
    closeCtxMenu()
    const id = tx.id as string
    const payeeName = payeeNameMap().get(tx.payee_id as string) ?? (tx.payee as string) ?? 'transaction'
    const confirmed = await confirmAction({
      message: `Delete "${payeeName}"?`,
      actionLabel: 'Delete Transaction',
    })
    if (!confirmed) return

    const oldRecord = { ...tx }
    const linkedId = tx.linked_id as string | null
    let linkedRecord: Record | undefined
    if (linkedId) {
      linkedRecord = await raw.get('transactions', linkedId)
    }

    await serverFirst({
      async optimistic() {
        if (linkedRecord) await raw.delete('transactions', linkedId!)
        await raw.delete('transactions', id)
        reactive.notify('transactions')
      },
      request: () => apiDelete(`/api/transactions/${id}`),
      async rollback() {
        await raw.put('transactions', oldRecord)
        if (linkedRecord) await raw.put('transactions', linkedRecord)
        reactive.notify('transactions')
      },
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

  // --- Bulk selection ---
  function handleRowSelect(txId: string, e: MouseEvent) {
    if (editingRowId()) return

    // Mobile: tap row opens edit sheet
    if (isMobile()) {
      const tx = txLookup().get(txId)
      if (tx) setSheetTx(tx)
      return
    }

    if (!e.ctrlKey && !e.metaKey) return

    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(txId)) next.delete(txId); else next.add(txId)
      return next
    })
    setLastSelectedId(txId)
  }

  function handleCheckClick(txId: string, e: MouseEvent) {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(txId)) next.delete(txId); else next.add(txId)
      return next
    })
    setLastSelectedId(txId)
  }

  const [focusedIdx, setFocusedIdx] = createSignal<number>(-1)

  function handleRowHover(txId: string) {
    const items = virtualItems()
    const rowIds = items.filter(i => i.type === 'row').map(i => (i as any).txId as string)
    const idx = rowIds.indexOf(txId)
    if (idx >= 0) setFocusedIdx(idx)
  }

  function selectGroup(groupKey: string) {
    const items = virtualItems()
    const ids: string[] = []
    let inGroup = false
    for (const item of items) {
      if (item.type === 'header') {
        inGroup = item.key === groupKey
      } else if (inGroup) {
        ids.push((item as any).txId as string)
      }
    }
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allSelected = ids.every(id => next.has(id))
      if (allSelected) { for (const id of ids) next.delete(id) }
      else { for (const id of ids) next.add(id) }
      return next
    })
  }

  function selectAll() {
    const items = virtualItems()
    const ids = items.filter(i => i.type === 'row').map(i => (i as any).txId as string)
    setSelectedIds(new Set(ids))
  }

  function clearSelection() {
    setSelectedIds(new Set())
    setSelectionAnchor(-1)
  }

  // Bulk operations
  async function bulkDelete() {
    const ids = [...selectedIds()]
    if (ids.length === 0) return
    closeCtxMenu()
    const confirmed = await confirmAction({
      message: `Delete ${ids.length} transaction${ids.length > 1 ? 's' : ''}?`,
      actionLabel: `Delete ${ids.length}`,
    })
    if (!confirmed) return

    const oldRecords: Record[] = []
    for (const id of ids) {
      const r = await raw.get('transactions', id)
      if (r) oldRecords.push(r)
      await raw.delete('transactions', id)
      apiDelete(`/api/transactions/${id}`).catch(() => {})
    }
    reactive.notify('transactions')
    clearSelection()

    pushUndo({
      description: `Deleted ${ids.length} transactions`,
      async undo() { for (const r of oldRecords) await raw.put('transactions', r); reactive.notify('transactions') },
      async redo() { for (const id of ids) await raw.delete('transactions', id); reactive.notify('transactions') },
    })
  }

  async function bulkSetCleared(cleared: boolean) {
    const ids = [...selectedIds()]
    closeCtxMenu()
    for (const id of ids) {
      const tx = await raw.get('transactions', id)
      if (tx) {
        await raw.put('transactions', { ...tx, cleared: cleared ? 1 : 0 })
        apiPatch(`/api/transactions/${id}`, { cleared }).catch(() => {})
      }
    }
    reactive.notify('transactions')
    clearSelection()
  }

  // Keyboard handler for bulk
  onMount(() => {
    function handleBulkKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        selectAll()
      }
      if (e.key === 'Escape' && selectedIds().size > 0) {
        e.preventDefault()
        clearSelection()
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds().size > 0) {
        e.preventDefault()
        bulkDelete()
      }
      // Shift+Arrow: add/remove one row in direction
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        const items = virtualItems()
        const rowIds = items.filter(i => i.type === 'row').map(i => (i as any).txId as string)
        let idx = focusedIdx()
        if (idx < 0) idx = 0

        const prevIdx = idx
        if (e.key === 'ArrowDown' && idx < rowIds.length - 1) idx++
        else if (e.key === 'ArrowUp' && idx > 0) idx--

        setFocusedIdx(idx)

        // If new row is already selected, we're going back — deselect the row we left
        setSelectedIds(prev => {
          const next = new Set(prev)
          if (next.has(rowIds[idx]) && prevIdx !== idx) {
            next.delete(rowIds[prevIdx])
          } else {
            next.add(rowIds[idx])
          }
          return next
        })
        setLastSelectedId(rowIds[idx])
      }
      // Ctrl+Shift+Arrow: select to group boundary OR deselect back to start
      if (e.shiftKey && (e.ctrlKey || e.metaKey) && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        const items = virtualItems()
        const rowIds = items.filter(i => i.type === 'row').map(i => (i as any).txId as string)
        let idx = focusedIdx()
        if (idx < 0) idx = 0

        const config = getGroupConfig()
        if (config && rowIds.length > 0) {
          const dir = e.key === 'ArrowDown' ? 1 : -1
          const currentTx = sorted().find(tx => tx.id === rowIds[idx])
          if (currentTx) {
            const currentKey = config.key(currentTx as any)

            // Check if moving toward start (deselect) or away (select to break)
            const anchor = selectionAnchor()
            const movingTowardAnchor = anchor >= 0 && ((dir === -1 && idx > anchor) || (dir === 1 && idx < anchor))

            if (movingTowardAnchor) {
              // Deselect back to anchor
              const [from, to] = anchor < idx ? [anchor + 1, idx] : [idx, anchor - 1]
              setSelectedIds(prev => {
                const next = new Set(prev)
                for (let i = from; i <= to; i++) next.delete(rowIds[i])
                return next
              })
              setFocusedIdx(anchor)
              setLastSelectedId(rowIds[anchor])
            } else {
              // Select to group boundary
              const idsToAdd: string[] = []
              let end = idx
              while (end + dir >= 0 && end + dir < rowIds.length) {
                end += dir
                const nextTx = sorted().find(tx => tx.id === rowIds[end])
                if (!nextTx || config.key(nextTx as any) !== currentKey) { end -= dir; break }
                idsToAdd.push(rowIds[end])
              }
              setFocusedIdx(end)
              setSelectedIds(prev => {
                const next = new Set(prev)
                for (const id of idsToAdd) next.add(id)
                return next
              })
              setLastSelectedId(rowIds[end])
            }
          }
        }
      }
      // Plain Arrow: move focus from hover position, select single row
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        const items = virtualItems()
        const rowIds = items.filter(i => i.type === 'row').map(i => (i as any).txId as string)
        if (rowIds.length === 0) return
        let idx = focusedIdx()
        if (idx < 0) idx = 0
        else if (e.key === 'ArrowDown' && idx < rowIds.length - 1) idx++
        else if (e.key === 'ArrowUp' && idx > 0) idx--
        setFocusedIdx(idx)
        setSelectionAnchor(idx)
        setSelectedIds(new Set([rowIds[idx]]))
        setLastSelectedId(rowIds[idx])
      }
    }
    document.addEventListener('keydown', handleBulkKeydown)
    onCleanup(() => document.removeEventListener('keydown', handleBulkKeydown))
  })

  return (
    <div class="txn-table">
      <Show when={props.accountId && !props.compact}>
        <AddTransactionRow accountId={props.accountId!} />
      </Show>

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
        <div class="txn-table__header">
          <div class="txn-table__col txn-table__col--check">
            <span class={`txn-table__group-toggle ${groupBy() !== 'none' ? 'txn-table__group-toggle--active' : ''}`} onClick={(e) => { e.stopPropagation(); setShowGroupMenu(!showGroupMenu()) }} title="Group by...">
              <Layers size={12} />
            </span>
            <Show when={showGroupMenu()}>
              <div class="txn-table__group-menu" onClick={(e) => e.stopPropagation()}>
                <div class={`ctx-menu__item ${groupBy() === 'none' ? 'ctx-menu__item--active' : ''}`} onClick={() => { setGroupBy('none'); setCollapsed(new Set()); setShowGroupMenu(false) }}>None</div>
                <div class={`ctx-menu__item ${groupBy() === 'month' ? 'ctx-menu__item--active' : ''}`} onClick={() => { setGroupBy('month'); setCollapsed(new Set()); setShowGroupMenu(false) }}>Month</div>
                <div class={`ctx-menu__item ${groupBy() === 'date' ? 'ctx-menu__item--active' : ''}`} onClick={() => { setGroupBy('date'); setCollapsed(new Set()); setShowGroupMenu(false) }}>Date</div>
                <div class={`ctx-menu__item ${groupBy() === 'payee' ? 'ctx-menu__item--active' : ''}`} onClick={() => { setGroupBy('payee'); setCollapsed(new Set()); setShowGroupMenu(false) }}>Payee</div>
                <Show when={!props.compact}>
                  <div class={`ctx-menu__item ${groupBy() === 'category' ? 'ctx-menu__item--active' : ''}`} onClick={() => { setGroupBy('category'); setCollapsed(new Set()); setShowGroupMenu(false) }}>Category</div>
                </Show>
                <Show when={!props.accountId || props.compact}>
                  <div class={`ctx-menu__item ${groupBy() === 'account' ? 'ctx-menu__item--active' : ''}`} onClick={() => { setGroupBy('account'); setCollapsed(new Set()); setShowGroupMenu(false) }}>Account</div>
                </Show>
              </div>
            </Show>
          </div>
          <div class={`txn-table__col txn-table__col--date txn-header txn-header--sortable ${sortField() === 'date' ? 'txn-header--active' : ''}`} onClick={(e) => handleHeaderClick('date', e)}>
            DATE <span class="txn-header__indicator">{sortField() === 'date' ? (sortDir() === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : <ChevronsUpDown size={10} />}</span>
          </div>
          <Show when={!props.accountId || props.compact}>
            <div class="txn-table__col txn-table__col--account">ACCOUNT</div>
          </Show>
          <div class={`txn-table__col txn-table__col--payee txn-header txn-header--sortable ${sortField() === 'payee' ? 'txn-header--active' : ''}`} onClick={(e) => handleHeaderClick('payee', e)}>
            PAYEE <span class="txn-header__indicator">{sortField() === 'payee' ? (sortDir() === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : <ChevronsUpDown size={10} />}</span>
          </div>
          <Show when={!props.compact}>
            <div class={`txn-table__col txn-table__col--category txn-header txn-header--sortable ${sortField() === 'category' ? 'txn-header--active' : ''}`} onClick={(e) => handleHeaderClick('category', e)}>
              CATEGORY
              <span class="txn-header__indicator">{sortField() === 'category' ? (sortDir() === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : <ChevronsUpDown size={10} />}</span>
            </div>
          </Show>
          <div class="txn-table__col txn-table__col--memo" />
          <div class={`txn-table__col txn-table__col--amount txn-header txn-header--sortable ${sortField() === 'amount' ? 'txn-header--active' : ''}`} onClick={(e) => handleHeaderClick('amount', e)}>
            AMOUNT <span class="txn-header__indicator">{sortField() === 'amount' ? (sortDir() === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : <ChevronsUpDown size={10} />}</span>
          </div>
          <Show when={!props.compact}>
            <div class="txn-table__col txn-table__col--balance">BALANCE</div>
          </Show>
          <div class="txn-table__col txn-table__col--status txn-header" title="Cleared">
            <CircleCheck size={11} />
          </div>
        </div>
        <Show when={virtualItems().length > 0} fallback={
          <div class="txn-table__empty">
            <span class="txn-table__empty-text">No transactions yet</span>
            <span class="txn-table__empty-hint">Click "+ Add transaction..." above or press ⌘N to get started</span>
          </div>
        }>
          <div style={{ height: `${totalHeight()}px`, position: 'relative' }}>
            <div style={{ transform: `translateY(${visibleRange().start * rowHeight()}px)` }}>
              <For each={virtualItems().slice(visibleRange().start, visibleRange().end)}>
                {(item) => {
                  if (item.type === 'header') {
                    return (
                      <GroupHeader
                        label={item.label}
                        count={item.count}
                        collapsed={collapsed().has(item.key)}
                        onToggle={() => toggleCollapse(item.key)}
                        onSelect={() => selectGroup(item.key)}
                        aggregate={<><MoneyDisplay amount={item.aggregate} /><span class="group-header__cleared">{item.cleared}/{item.count}</span></>}
                      />
                    )
                  }
                  const row = item as VirtualItem & { type: 'row' }
                  return (
                    <TransactionRow
                      tx={row.tx}
                      balance={row.balance}
                      onContextMenu={handleContextMenu}
                      onSelect={handleRowSelect}
                      onCheckClick={handleCheckClick}
                      onHover={handleRowHover}
                      selected={selectedIds().has(row.txId)}
                      showAccount={!props.accountId || !!props.compact}
                      hideCategory={!!props.compact}
                      hideBalance={!!props.compact}
                      editingRowId={editingRowId()}
                      onEditStart={(id) => {
                        if (isMobile()) {
                          setSheetTx(row.tx)
                        } else {
                          setEditingRowId(id)
                        }
                      }}
                      onEditEnd={() => setEditingRowId(null)}
                      knownPayees={knownPayees()}
                    />
                  )
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>

      <Show when={ctxMenu()}>
        {(menu) => (
          <div class="ctx-menu" style={{ position: 'fixed', left: `${menu().x}px`, top: `${menu().y}px` }}>
            <Show when={selectedIds().size > 1} fallback={
              <>
                <div class="ctx-menu__item" onClick={() => ctxEdit(menu().tx)}>Edit</div>
                <div class="ctx-menu__item" onClick={() => ctxToggleCleared(menu().tx)}>Toggle Cleared</div>
                <div class="ctx-menu__item" onClick={() => ctxMakeRecurring(menu().tx)}>Make Recurring</div>
                <div class="ctx-menu__sep" />
                <div class="ctx-menu__item ctx-menu__item--danger" onClick={() => ctxDelete(menu().tx)}>Delete</div>
              </>
            }>
              <div class="ctx-menu__item" onClick={() => bulkSetCleared(true)}>Mark {selectedIds().size} cleared</div>
              <div class="ctx-menu__item" onClick={() => bulkSetCleared(false)}>Mark {selectedIds().size} uncleared</div>
              <div class="ctx-menu__sep" />
              <div class="ctx-menu__item ctx-menu__item--danger" onClick={bulkDelete}>Delete {selectedIds().size} transactions</div>
              <div class="ctx-menu__sep" />
              <div class="ctx-menu__item" onClick={() => { clearSelection(); closeCtxMenu() }}>Deselect all</div>
            </Show>
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

      <Show when={sheetTx()}>
        {(tx) => (
          <TransactionSheet
            tx={tx()}
            onClose={() => setSheetTx(null)}
            onDeleted={() => reactive.notify('transactions')}
          />
        )}
      </Show>
    </div>
  )
}

export default TransactionTable
