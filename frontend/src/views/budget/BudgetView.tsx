import { createSignal, createEffect, createMemo, onMount, onCleanup, Show, type Component } from 'solid-js'
import { useSearchParams } from '@solidjs/router'
import { Wallet, X, Plus, AlertTriangle, TrendingDown, CircleDot, AlertCircle } from 'lucide-solid'
import { useStore, useMonth, useBudgetFilter, type BudgetFilter } from '~/App'
import { createQuery } from '~/lib/solid-binding'
import { createBudgetStore } from '~/lib/budget-signals'
import { formatMoneyUnsigned } from '~/lib/format'
import { useUndoKeyboard } from '~/lib/undo'
import { apiPost, apiPatch, apiDelete } from '~/lib/api'
import { pushUndo } from '~/lib/undo'
import { confirmAction } from '~/components/ConfirmDialog'
import DetailDialog from '~/components/DetailDialog'
import InlineForm from '~/components/InlineForm'
import FormDialog from '~/components/FormDialog'
import BudgetGrid from './BudgetGrid'
import BudgetSheet from '~/components/BudgetSheet'
import MonthNavigator from './MonthNavigator'
import CoverDialog, { type TransferTarget } from './CoverDialog'
import CategoryDetail from './CategoryDetail'
import TargetDialog from './TargetDialog'

const BudgetView: Component = () => {
  const { raw, reactive } = useStore()
  const { month } = useMonth()
  const { filter, setFilter } = useBudgetFilter()
  const [searchParams, setSearchParams] = useSearchParams()
  const budgetStore = createBudgetStore(reactive, month)
  const categoryGroups = createQuery(reactive, 'category_groups')
  const categories = createQuery(reactive, 'categories')

  useUndoKeyboard()

  const hasCategories = () => budgetStore.budget().groups.some(g => g.categories.length > 0)
  const hasGroups = () => categoryGroups().length > 0

  // Health counters (shared between sidebar and mobile chip bar)
  const overspentCount = createMemo(() => {
    const groups = budgetStore.budget().groups
    let count = 0
    for (const g of groups) for (const c of g.categories) if (c.activity < 0 && c.available < 0) count++
    return count
  })
  const underfundedCount = createMemo(() => {
    const groups = budgetStore.budget().groups
    let count = 0
    for (const g of groups) for (const c of g.categories) if (c.target?.isUnderfunded === true) count++
    return count
  })
  const unfundedCount = createMemo(() => {
    const groups = budgetStore.budget().groups
    let count = 0
    for (const g of groups) for (const c of g.categories) if (c.assigned === 0 && c.available <= 0) count++
    return count
  })
  const overAssigned = createMemo(() => {
    const rta = budgetStore.rta()
    return rta < 0 ? Math.abs(rta) : 0
  })

  // Mobile sheet state
  const [isMobile, setIsMobile] = createSignal(window.matchMedia('(max-width: 768px)').matches)
  const [sheetBudget, setSheetBudget] = createSignal<import('~/lib/budget-engine').CategoryBudget | null>(null)

  onMount(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    onCleanup(() => mq.removeEventListener('change', handler))
  })

  const [showAddGroup, setShowAddGroup] = createSignal(false)
  const [showAddCategory, setShowAddCategory] = createSignal<string | null>(null)
  const [editingGroup, setEditingGroup] = createSignal<string | null>(null)
  const [editingCategory, setEditingCategory] = createSignal<string | null>(null)
  const [coverTarget, setCoverTarget] = createSignal<TransferTarget | null>(null)
  const [detailCatId, setDetailCatId] = createSignal<string | null>(null)
  const [targetCatId, setTargetCatId] = createSignal<string | null>(null)

  const detailBudget = () => {
    const id = detailCatId()
    if (!id) return null
    return budgetStore.budget().categoryMap.get(id) ?? null
  }

  // Open RTA assign dialog when navigated with ?action=assign-rta
  createEffect(() => {
    if (searchParams.action === 'assign-rta') {
      setCoverTarget({ catId: '', catName: 'Ready to Assign', side: 'from' })
      setSearchParams({ action: undefined })
    }
  })

  // Scroll to first highlighted row when filter activates
  createEffect(() => {
    if (filter()) {
      requestAnimationFrame(() => {
        const highlighted = document.querySelector('.budget-row--highlighted')
        if (highlighted) highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }
  })

  // Escape dismisses filter
  function handleFilterEscape(e: KeyboardEvent) {
    if (e.key === 'Escape' && filter()) {
      const active = document.activeElement as HTMLElement
      if (!active || active === document.body || active.closest('.budget-grid')) {
        e.stopPropagation()
        setFilter(null)
      }
    }
  }

  onMount(() => document.addEventListener('keydown', handleFilterEscape))
  onCleanup(() => document.removeEventListener('keydown', handleFilterEscape))

  function openCover(catId: string) {
    const cat = budgetStore.budget().categoryMap.get(catId)
    const needsFunding = cat && (cat.available < 0 || cat.target?.isUnderfunded || (cat.target && cat.available < cat.target.targetAmount))
    setCoverTarget({ catId, catName: cat?.categoryName ?? '', side: needsFunding ? 'to' : 'from' })
  }

  async function autoCoverOverspent() {
    const b = budgetStore.budget()
    const m = month()
    const overspent = b.groups.flatMap(g => g.categories).filter(c => c.activity < 0 && c.available < 0)
    const funded = b.groups.flatMap(g => g.categories).filter(c => c.available > 0).sort((a, b) => b.available - a.available)

    if (overspent.length === 0) return

    const moves: { from: string; to: string; amount: number; fromName: string; toName: string }[] = []
    const availablePool = new Map(funded.map(c => [c.categoryId, c.available]))

    for (const cat of overspent) {
      let deficit = Math.abs(cat.available)
      for (const src of funded) {
        if (deficit <= 0) break
        const srcAvail = availablePool.get(src.categoryId) ?? 0
        if (srcAvail <= 0) continue
        const moveAmt = Math.min(deficit, srcAvail)
        moves.push({ from: src.categoryId, to: cat.categoryId, amount: moveAmt, fromName: src.categoryName, toName: cat.categoryName })
        availablePool.set(src.categoryId, srcAvail - moveAmt)
        deficit -= moveAmt
      }
    }

    if (moves.length === 0) return

    const desc = moves.map(m => `${m.fromName} → ${m.toName}: ${(m.amount / 100).toFixed(2)}`).join(', ')
    const confirmed = await confirmAction({
      message: `Auto-cover ${overspent.length} overspent categor${overspent.length > 1 ? 'ies' : 'y'}?\n\n${desc}`,
      actionLabel: 'Cover All',
    })
    if (!confirmed) return

    for (const move of moves) {
      const fromAssignments = await raw.query('assignments', { where: { category_id: move.from, month: m } })
      const toAssignments = await raw.query('assignments', { where: { category_id: move.to, month: m } })

      if (fromAssignments[0]) {
        await raw.put('assignments', { ...fromAssignments[0], amount: (fromAssignments[0].amount as number) - move.amount })
      } else {
        await raw.put('assignments', { id: crypto.randomUUID(), category_id: move.from, month: m, amount: -move.amount })
      }

      if (toAssignments[0]) {
        await raw.put('assignments', { ...toAssignments[0], amount: (toAssignments[0].amount as number) + move.amount })
      } else {
        await raw.put('assignments', { id: crypto.randomUUID(), category_id: move.to, month: m, amount: move.amount })
      }
    }

    reactive.notify('assignments')
    for (const move of moves) {
      apiPost('/api/budget/move', { from_category_id: move.from, to_category_id: move.to, amount: move.amount, month: m }).catch(() => {})
    }

    pushUndo({
      description: `Auto-covered ${overspent.length} overspent categories`,
      async undo() {
        for (const move of moves) {
          const fa = await raw.query('assignments', { where: { category_id: move.from, month: m } })
          const ta = await raw.query('assignments', { where: { category_id: move.to, month: m } })
          if (fa[0]) await raw.put('assignments', { ...fa[0], amount: (fa[0].amount as number) + move.amount })
          if (ta[0]) await raw.put('assignments', { ...ta[0], amount: (ta[0].amount as number) - move.amount })
        }
        reactive.notify('assignments')
      },
      async redo() {
        for (const move of moves) {
          const fa = await raw.query('assignments', { where: { category_id: move.from, month: m } })
          const ta = await raw.query('assignments', { where: { category_id: move.to, month: m } })
          if (fa[0]) await raw.put('assignments', { ...fa[0], amount: (fa[0].amount as number) - move.amount })
          if (ta[0]) await raw.put('assignments', { ...ta[0], amount: (ta[0].amount as number) + move.amount })
        }
        reactive.notify('assignments')
      },
    })
  }

  async function createGroup(values: Record<string, string>) {
    const name = values.name.trim()
    if (!name) return
    const id = crypto.randomUUID()
    await raw.put('category_groups', { id, name, sort_order: categoryGroups().length })
    reactive.notify('category_groups')
    apiPost('/api/category-groups', { id, name }).catch(() => {})
    pushUndo({
      description: `Created group "${name}"`,
      async undo() { await raw.delete('category_groups', id); reactive.notify('category_groups') },
      async redo() { await raw.put('category_groups', { id, name, sort_order: 0 }); reactive.notify('category_groups') },
    })
    setShowAddGroup(false)
  }

  async function createCategory(values: Record<string, string>) {
    const name = values.name.trim()
    const groupId = showAddCategory()
    if (!name || !groupId) return
    const id = crypto.randomUUID()
    const sortOrder = categories().filter(c => c.group_id === groupId).length
    await raw.put('categories', { id, group_id: groupId, name, sort_order: sortOrder })
    reactive.notify('categories')
    apiPost('/api/categories', { id, group_id: groupId, name }).catch(() => {})
    pushUndo({
      description: `Created category "${name}"`,
      async undo() { await raw.delete('categories', id); reactive.notify('categories') },
      async redo() { await raw.put('categories', { id, group_id: groupId, name, sort_order: sortOrder }); reactive.notify('categories') },
    })
    setShowAddCategory(null)
  }

  async function renameGroup(groupId: string, values: Record<string, string>) {
    const name = values.name.trim()
    if (!name) return
    const old = await raw.get('category_groups', groupId)
    if (!old) return
    await raw.put('category_groups', { ...old, name })
    reactive.notify('category_groups')
    apiPatch(`/api/category-groups/${groupId}`, { name }).catch(() => {})
    setEditingGroup(null)
  }

  async function renameCategory(catId: string, values: Record<string, string>) {
    const name = values.name.trim()
    if (!name) return
    const old = await raw.get('categories', catId)
    if (!old) return
    await raw.put('categories', { ...old, name })
    reactive.notify('categories')
    apiPatch(`/api/categories/${catId}`, { name }).catch(() => {})
    setEditingCategory(null)
  }

  async function moveCategory(catId: string, newGroupId: string) {
    const old = await raw.get('categories', catId)
    if (!old) return
    const prevGroupId = old.group_id as string
    await raw.put('categories', { ...old, group_id: newGroupId })
    reactive.notify('categories')
    apiPatch(`/api/categories/${catId}`, { group_id: newGroupId }).catch(() => {})
    pushUndo({
      description: `Moved category to different group`,
      async undo() { await raw.put('categories', { ...old, group_id: prevGroupId }); reactive.notify('categories') },
      async redo() { await raw.put('categories', { ...old, group_id: newGroupId }); reactive.notify('categories') },
    })
  }

  async function deleteGroup(groupId: string, groupName: string) {
    const childCats = categories().filter(c => c.group_id === groupId)
    if (childCats.length > 0) {
      await confirmAction({
        message: `Cannot delete "${groupName}" — it has ${childCats.length} categor${childCats.length > 1 ? 'ies' : 'y'}. Move or delete them first.`,
        actionLabel: 'OK',
        danger: false,
      })
      return
    }
    const confirmed = await confirmAction({
      message: `Delete "${groupName}"?`,
      actionLabel: 'Delete Group',
    })
    if (!confirmed) return
    const record = await raw.get('category_groups', groupId)
    await raw.delete('category_groups', groupId)
    reactive.notify('category_groups')
    apiDelete(`/api/category-groups/${groupId}`).catch(() => {})
    pushUndo({
      description: `Deleted group "${groupName}"`,
      async undo() {
        if (record) await raw.put('category_groups', record)
        reactive.notify('category_groups')
      },
      async redo() {
        await raw.delete('category_groups', groupId)
        reactive.notify('category_groups')
      },
    })
  }

  async function deleteCategory(catId: string, catName: string) {
    const txns = await raw.query('transactions', { where: { category_id: catId } })
    if (txns.length > 0) {
      await confirmAction({
        message: `Cannot delete "${catName}" — it has ${txns.length} transaction${txns.length > 1 ? 's' : ''}. Reassign them to another category first.`,
        actionLabel: 'OK',
        danger: false,
      })
      return
    }
    const confirmed = await confirmAction({
      message: `Delete "${catName}"?`,
      actionLabel: 'Delete Category',
    })
    if (!confirmed) return
    const record = await raw.get('categories', catId)
    await raw.delete('categories', catId)
    reactive.notify('categories')
    apiDelete(`/api/categories/${catId}`).catch(() => {})
    pushUndo({
      description: `Deleted category "${catName}"`,
      async undo() { if (record) { await raw.put('categories', record); reactive.notify('categories') } },
      async redo() { await raw.delete('categories', catId); reactive.notify('categories') },
    })
  }

  return (
    <div class="budget-view">
      <div class="budget-view__topbar">
        <MonthNavigator />
        <div class="budget-view__actions">
          <button class="btn btn--sm btn--ghost" onClick={() => setShowAddGroup(true)} title="Add group"><Plus size={14} /> Group</button>
          <button class="btn btn--sm btn--secondary" onClick={autoCoverOverspent}>Cover Overspent</button>
        </div>
        <Show when={filter()}>
          <div class="budget-filter-badge">
            <span class="budget-filter-badge__label">Showing: {filter()}</span>
            <button class="budget-filter-badge__clear" onClick={() => setFilter(null)}><X size={12} /></button>
          </div>
        </Show>
      </div>
      {/* Mobile-only health chip bar (desktop shows these in sidebar) */}
      <div class="budget-view__mobile-chips">
        <Show when={overAssigned() > 0}>
          <button class="mobile-chip mobile-chip--negative" onClick={() => setFilter('overassigned')}>
            <AlertCircle size={12} /> Over-assigned {formatMoneyUnsigned(overAssigned())}
          </button>
        </Show>
        <Show when={overspentCount() > 0}>
          <button class="mobile-chip mobile-chip--negative" onClick={() => setFilter('overspent')}>
            <AlertTriangle size={12} /> Overspent {overspentCount()}
          </button>
        </Show>
        <Show when={underfundedCount() > 0}>
          <button class="mobile-chip mobile-chip--warning" onClick={() => setFilter('underfunded')}>
            <TrendingDown size={12} /> Underfunded {underfundedCount()}
          </button>
        </Show>
        <Show when={unfundedCount() > 0}>
          <button class="mobile-chip mobile-chip--muted" onClick={() => setFilter('unfunded')}>
            <CircleDot size={12} /> Unfunded {unfundedCount()}
          </button>
        </Show>
      </div>
      <Show when={detailBudget()}>
        {(budget) => (
          <DetailDialog
            open={true}
            title={budget().categoryName}
            subtitle={`${formatMoneyUnsigned(budget().available)} available`}
            onClose={() => setDetailCatId(null)}
            onRename={async (newName) => {
              const cat = await raw.get('categories', budget().categoryId)
              if (!cat) return
              await raw.put('categories', { ...cat, name: newName })
              reactive.notify('categories')
              apiPatch(`/api/categories/${budget().categoryId}`, { name: newName }).catch(() => {})
            }}
          >
            <CategoryDetail
              budget={budget()}
              onMoveBudget={(catId) => openCover(catId)}
              onSetTarget={(catId) => setTargetCatId(catId)}
              onAssign={async (catId, amount) => {
                const m = month()
                const existing = await raw.query('assignments', { where: { category_id: catId, month: m } })
                const id = existing.length > 0 ? existing[0].id as string : crypto.randomUUID()
                await raw.put('assignments', { id, category_id: catId, month: m, amount })
                reactive.notify('assignments')
                apiPost('/api/budget/assign', { category_id: catId, month: m, amount }).catch(() => {})
              }}
            />
          </DetailDialog>
        )}
      </Show>
      <CoverDialog
        open={!!coverTarget()}
        target={coverTarget()}
        onClose={() => {
          setCoverTarget(null)
          requestAnimationFrame(() => {
            const detail = document.querySelector('.detail-dialog') as HTMLElement | null
            if (detail) detail.focus()
          })
        }}
      />
      <TargetDialog
        open={!!targetCatId()}
        categoryId={targetCatId()}
        categoryName={(() => {
          const id = targetCatId()
          if (!id) return ''
          const cat = categories().find(c => c.id === id)
          return (cat?.name as string) ?? ''
        })()}
        currentTarget={(() => {
          const id = targetCatId()
          if (!id) return { type: null, amount: null, date: null }
          const cat = categories().find(c => c.id === id)
          if (!cat) return { type: null, amount: null, date: null }
          return {
            type: cat.target_type as string | null,
            amount: cat.target_amount as number | null,
            date: cat.target_date as string | null,
          }
        })()}
        onClose={() => setTargetCatId(null)}
      />
      <Show when={hasCategories() || hasGroups()} fallback={
        <div class="empty-state">
          <div class="empty-state__icon"><Wallet size={32} /></div>
          <p class="empty-state__title">No categories yet</p>
          <p class="empty-state__desc">Create a category group to start budgeting.</p>
          <div class="empty-state__actions">
            <Show when={!showAddGroup()} fallback={
              <FormDialog
                title="Create Group"
                fields={[{ key: 'name', label: 'Group name', type: 'text', required: true, placeholder: 'e.g. Housing, Food, Transport' }]}
                onSubmit={createGroup}
                onCancel={() => setShowAddGroup(false)}
                submitLabel="Create"
              />
            }>
              <button class="btn btn--primary" onClick={() => setShowAddGroup(true)}>Create First Group</button>
            </Show>
          </div>
        </div>
      }>
        <BudgetGrid
          store={budgetStore}
          month={month}
          categoryGroups={categoryGroups()}
          onAddGroup={() => setShowAddGroup(true)}
          onAddCategory={(groupId) => setShowAddCategory(groupId)}
          onRenameGroup={(id) => setEditingGroup(id)}
          onRenameCategory={(id) => setEditingCategory(id)}
          onMoveCategory={moveCategory}
          onDeleteGroup={deleteGroup}
          onDeleteCategory={deleteCategory}
          onCoverFrom={(catId) => {
            const cat = budgetStore.budget().categoryMap.get(catId)
            setCoverTarget({ catId, catName: cat?.categoryName ?? '', side: 'from' })
          }}
          onMoveTo={(catId) => {
            const cat = budgetStore.budget().categoryMap.get(catId)
            setCoverTarget({ catId, catName: cat?.categoryName ?? '', side: 'to' })
          }}
          onViewDetail={(catId) => setDetailCatId(catId)}
          onSetTarget={(catId) => setTargetCatId(catId)}
          onMobileEdit={isMobile() ? (budget) => setSheetBudget(budget) : undefined}
          showAddGroup={showAddGroup()}
          showAddCategory={showAddCategory()}
          editingGroup={editingGroup()}
          editingCategory={editingCategory()}
          onCreateGroup={createGroup}
          onCreateCategory={createCategory}
          onRenameGroupSubmit={renameGroup}
          onRenameCategorySubmit={renameCategory}
          onCancelAdd={() => { setShowAddGroup(false); setShowAddCategory(null) }}
          onCancelEdit={() => { setEditingGroup(null); setEditingCategory(null) }}
        />
      </Show>

      <Show when={sheetBudget()}>
        {(budget) => (
          <BudgetSheet
            budget={budget()}
            month={month}
            onClose={() => setSheetBudget(null)}
            onViewDetail={(catId) => { setSheetBudget(null); setDetailCatId(catId) }}
            onSetTarget={(catId) => { setSheetBudget(null); setTargetCatId(catId) }}
            onCoverFrom={(catId) => {
              setSheetBudget(null)
              const cat = budgetStore.budget().categoryMap.get(catId)
              setCoverTarget({ catId, catName: cat?.categoryName ?? '', side: 'from' })
            }}
            onMoveTo={(catId) => {
              setSheetBudget(null)
              const cat = budgetStore.budget().categoryMap.get(catId)
              setCoverTarget({ catId, catName: cat?.categoryName ?? '', side: 'to' })
            }}
          />
        )}
      </Show>
    </div>
  )
}

export default BudgetView
