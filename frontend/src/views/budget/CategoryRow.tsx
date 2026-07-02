import { Show, For, createSignal, onMount, onCleanup, type Component, type Accessor } from 'solid-js'
import { ChevronLeft, AlertTriangle, TrendingDown, CircleDot, CheckCircle, Target, Repeat, Calendar, PiggyBank } from 'lucide-solid'
import MoneyDisplay from '~/components/MoneyDisplay'
import HealthRing from '~/components/HealthRing'
import IconPicker, { EntityIcon } from '~/components/IconPicker'
import { AmountInput } from '~/components/CellInputs'
import { formatMoneyUnsigned } from '~/lib/format'
import type { CategoryBudget } from '~/lib/budget-engine'
import { useStore, useBudgetFilter, type BudgetFilter } from '~/App'
import { apiPost, apiPatch } from '~/lib/api'
import { clampMenuPosition } from '~/lib/ui'
import { pushUndo } from '~/lib/undo'
import type { Record } from '~/lib/sync-engine/types'

interface CategoryRowProps {
  budget: CategoryBudget
  month: Accessor<string>
  otherGroups: Record[]
  onRename: () => void
  onMove: (newGroupId: string) => void
  onDelete: () => void
  onCoverFrom?: (catId: string) => void
  onMoveTo?: (catId: string) => void
  onViewDetail?: (catId: string) => void
  onSetTarget?: (catId: string) => void
}

const CategoryRow: Component<CategoryRowProps> = (props) => {
  const { raw, reactive } = useStore()
  const { filter } = useBudgetFilter()
  const [editing, setEditing] = createSignal(false)
  const [ctxMenu, setCtxMenu] = createSignal<{ x: number; y: number } | null>(null)
  const [ctxSub, setCtxSub] = createSignal<'groups' | null>(null)
  const [iconPickerOpen, setIconPickerOpen] = createSignal(false)
  let rowRef: HTMLDivElement | undefined
  let ctxMenuRef: HTMLDivElement | undefined

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (ctxSub()) {
        e.stopPropagation()
        e.stopImmediatePropagation()
        setCtxSub(null)
        return
      }
      if (ctxMenu()) {
        e.stopPropagation()
        e.stopImmediatePropagation()
        setCtxMenu(null)
        return
      }
    }
  }

  function handleGlobalMousedown(e: MouseEvent) {
    const target = e.target as Node
    if (rowRef && rowRef.contains(target)) return
    if (ctxMenuRef && ctxMenuRef.contains(target)) return
    if (ctxMenu()) setCtxMenu(null)
  }

  onMount(() => {
    document.addEventListener('keydown', handleGlobalKeydown, true)
    document.addEventListener('mousedown', handleGlobalMousedown)
  })
  onCleanup(() => {
    document.removeEventListener('keydown', handleGlobalKeydown, true)
    document.removeEventListener('mousedown', handleGlobalMousedown)
  })

  const isHighlighted = () => {
    const f = filter()
    if (!f) return false
    switch (f) {
      case 'overspent': return props.budget.activity < 0 && props.budget.available < 0
      case 'underfunded': return hasTargets() && props.budget.target?.isUnderfunded === true
      case 'unfunded': return props.budget.assigned === 0 && props.budget.available <= 0
      case 'overassigned': return false
    }
  }

  const availableVariant = () => {
    if (props.budget.available < 0) return 'overspent'
    if (props.budget.target?.isUnderfunded) return 'underfunded'
    if (props.budget.available > 0) return 'funded'
    return 'neutral'
  }

  const hasTargets = () => !!props.budget.target

  const statusLabel = () => {
    if (props.budget.available < 0) return { text: 'Overspent', icon: AlertTriangle, color: 'var(--c-negative)' }
    if (hasTargets() && props.budget.target?.isUnderfunded) return { text: 'Underfunded', icon: TrendingDown, color: 'var(--c-warning)' }
    if (props.budget.assigned === 0 && props.budget.available <= 0) return { text: 'Unfunded', icon: CircleDot, color: 'var(--c-overlay0)' }
    return { text: 'Healthy', icon: CheckCircle, color: 'var(--c-positive)' }
  }

  async function handleAssign(newAmount: number) {
    const oldAmount = props.budget.assigned
    if (newAmount === oldAmount) return
    const categoryId = props.budget.categoryId
    const month = props.month()

    const existingAssignments = await raw.query('assignments', {
      where: { category_id: categoryId, month },
    })

    const id = existingAssignments.length > 0
      ? existingAssignments[0].id as string
      : crypto.randomUUID()

    const record = { id, category_id: categoryId, month, amount: newAmount }

    await raw.put('assignments', record)
    reactive.notify('assignments')
    // Wait for microtask (notify) + async refresh (store.query) to propagate
    await new Promise(r => setTimeout(r, 0))

    apiPost('/api/budget/assign', { category_id: categoryId, month, amount: newAmount }).catch(() => {})

    pushUndo({
      description: `Assigned ${(newAmount / 100).toFixed(2)} to ${props.budget.categoryName}`,
      async undo() {
        if (oldAmount === 0 && existingAssignments.length === 0) {
          await raw.delete('assignments', id)
        } else {
          await raw.put('assignments', { id, category_id: categoryId, month, amount: oldAmount })
        }
        reactive.notify('assignments')
        apiPost('/api/budget/assign', { category_id: categoryId, month, amount: oldAmount }).catch(() => {})
      },
      async redo() {
        await raw.put('assignments', record)
        reactive.notify('assignments')
        apiPost('/api/budget/assign', { category_id: categoryId, month, amount: newAmount }).catch(() => {})
      },
    })
  }

  function handleStatusClick(e: MouseEvent) {
    e.stopPropagation()
    const status = statusLabel().text
    if (status === 'Overspent' || status === 'Underfunded' || status === 'Unfunded') {
      props.onMoveTo?.(props.budget.categoryId)
    } else if (status === 'Healthy') {
      props.onCoverFrom?.(props.budget.categoryId)
    }
  }

  async function commitIcon(newIcon: string | null) {
    const catId = props.budget.categoryId
    const cat = await raw.get('categories', catId)
    if (!cat) return
    const oldIcon = (cat.icon as string) ?? null
    if (newIcon === oldIcon) return
    const updated = { ...cat, icon: newIcon }
    await raw.put('categories', updated)
    reactive.notify('categories')
    apiPatch(`/api/categories/${catId}`, { icon: newIcon }).catch(() => {})
    pushUndo({
      description: `Changed icon for ${props.budget.categoryName}`,
      async undo() { await raw.put('categories', cat); reactive.notify('categories') },
      async redo() { await raw.put('categories', updated); reactive.notify('categories') },
    })
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const pos = clampMenuPosition(e.clientX, e.clientY)
    setCtxMenu({ x: pos.x, y: pos.y })
  }

  function closeCtxMenu() { setCtxMenu(null); setCtxSub(null) }

  return (
    <>
    <div ref={rowRef} class={`budget-row ${isHighlighted() ? 'budget-row--highlighted' : ''}`} onContextMenu={handleContextMenu}>
      <div class="budget-row__name" style={{ cursor: 'pointer', position: 'relative' }}>
        <span class="budget-row__icon" onClick={(e) => { e.stopPropagation(); setIconPickerOpen(!iconPickerOpen()) }} title="Change icon">
          <EntityIcon icon={props.budget.categoryIcon} name={props.budget.categoryName} size={16} />
        </span>
        <span onClick={() => props.onViewDetail?.(props.budget.categoryId)}>{props.budget.categoryName}</span>
        <Show when={iconPickerOpen()}>
          <IconPicker
            value={props.budget.categoryIcon}
            entityName={props.budget.categoryName}
            onPick={(iconId) => { commitIcon(iconId); setIconPickerOpen(false) }}
            onCancel={() => setIconPickerOpen(false)}
          />
        </Show>
      </div>
      <div class="budget-row__target">
        <Show when={props.budget.target} fallback={
          <div class="budget-target budget-target--empty" onClick={(e) => { e.stopPropagation(); props.onSetTarget?.(props.budget.categoryId) }}>
            <Target size={11} />
            <span class="budget-target__empty-text">Set target</span>
          </div>
        }>
          {(target) => {
            const isSavings = () => target().targetType === 'savings' || target().targetType === 'by_date'
            const progressValue = () => isSavings() ? props.budget.available : props.budget.assigned
            const assignedProgress = () => Math.min(Math.max(progressValue() / target().targetAmount, 0), 1)
            const fillClass = () => {
              if (progressValue() >= target().targetAmount) return 'budget-target__fill--funded'
              if (progressValue() > 0) return 'budget-target__fill--partial'
              return 'budget-target__fill--overspent'
            }
            const label = () => isSavings()
              ? `${formatMoneyUnsigned(Math.max(0, props.budget.available))} / ${formatMoneyUnsigned(target().targetAmount)}`
              : `${formatMoneyUnsigned(props.budget.assigned)} / ${formatMoneyUnsigned(target().targetAmount)}`
            const TypeIcon = () => {
              switch (target().targetType) {
                case 'monthly': return <Repeat size={14} />
                case 'by_date': return <Calendar size={14} />
                case 'savings': return <PiggyBank size={14} />
              }
            }
            const desc = () => {
              switch (target().targetType) {
                case 'monthly': return 'monthly target'
                case 'by_date': return `save by ${target().targetDate || 'date'}`
                case 'savings': return 'saving goal'
              }
            }
            return (
              <div class="budget-target" onClick={(e) => { e.stopPropagation(); props.onSetTarget?.(props.budget.categoryId) }}>
                <span class="budget-target__icon"><TypeIcon /></span>
                <div class="budget-target__content">
                  <span class="budget-target__label">{label()} <span class="budget-target__desc">— {desc()}</span></span>
                  <div class="budget-target__track">
                    <div class={`budget-target__fill ${fillClass()}`} style={{ width: `${assignedProgress() * 100}%` }} />
                  </div>
                </div>
              </div>
            )
          }}
        </Show>
      </div>
      <div class="budget-row__assigned cell--number">
        <Show when={editing()} fallback={
          <div class="assigned-cell" onClick={() => setEditing(true)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}>
            <span class="money">{formatMoneyUnsigned(props.budget.assigned)}</span>
          </div>
        }>
          <AmountInput
            amount={props.budget.assigned}
            showSign={false}
            onCommit={async (v) => { await handleAssign(v); setEditing(false) }}
            onCancel={() => setEditing(false)}
          />
        </Show>
      </div>
      <div class="budget-row__activity cell--computed">
        <MoneyDisplay amount={props.budget.activity} />
      </div>
      <div class="budget-row__available cell--computed">
        <span class={`badge badge--${availableVariant()}`}>
          <MoneyDisplay amount={props.budget.available} unsigned />
        </span>
      </div>
      <div class="budget-row__health">
        <HealthRing available={props.budget.available} activity={props.budget.activity} />
      </div>
      <div class="budget-row__status">
        <span class="budget-row__status-label" style={{ color: statusLabel().color }} onClick={handleStatusClick}>
          {(() => { const Icon = statusLabel().icon; return <Icon size={12} /> })()}
          <span class="budget-row__status-text">{statusLabel().text}</span>
        </span>
      </div>
    </div>
    {/* Right-click context menu */}
    <Show when={ctxMenu()}>
      {(menu) => (
        <div ref={ctxMenuRef} class="ctx-menu" style={{ position: 'fixed', left: `${menu().x}px`, top: `${menu().y}px`, 'z-index': 200 }} onClick={(e) => e.stopPropagation()}>
          <Show when={ctxSub() === 'groups'} fallback={
            <>
              <div class="ctx-menu__item" onClick={() => { closeCtxMenu(); props.onViewDetail?.(props.budget.categoryId) }}>View transactions...</div>
              <div class="ctx-menu__item" onClick={() => { closeCtxMenu(); props.onCoverFrom?.(props.budget.categoryId) }}>Move budget...</div>
              <div class="ctx-menu__item" onClick={() => { closeCtxMenu(); props.onSetTarget?.(props.budget.categoryId) }}>Set target...</div>
              <div class="ctx-menu__item" onClick={() => { closeCtxMenu(); setIconPickerOpen(true) }}>Change icon...</div>
              <Show when={props.otherGroups.length > 0}>
                <div class="ctx-menu__item" onClick={() => setCtxSub('groups')}>Change group...</div>
              </Show>
              <div class="ctx-menu__sep" />
              <div class="ctx-menu__item" onClick={() => { closeCtxMenu(); props.onRename() }}>Rename</div>
              <div class="ctx-menu__item ctx-menu__item--danger" onClick={() => { closeCtxMenu(); props.onDelete() }}>Delete</div>
            </>
          }>
            <div class="ctx-menu__item ctx-menu__item--back" onClick={() => setCtxSub(null)}>
              <ChevronLeft size={12} /> Back
            </div>
            <div class="ctx-menu__sep" />
            <For each={props.otherGroups}>
              {(g) => (
                <div class="ctx-menu__item" onClick={() => { closeCtxMenu(); props.onMove(g.id as string) }}>{g.name as string}</div>
              )}
            </For>
          </Show>
        </div>
      )}
    </Show>
    </>
  )
}

export default CategoryRow
