import { createSignal, onMount, onCleanup, type Component, For, Show } from 'solid-js'
import { ChevronRight, ChevronDown, Plus, AlertTriangle, TrendingDown } from 'lucide-solid'
import MoneyDisplay from '~/components/MoneyDisplay'
import HealthRing from '~/components/HealthRing'
import InlineForm from '~/components/InlineForm'
import IconPicker, { EntityIcon } from '~/components/IconPicker'
import { useStore } from '~/App'
import { apiPatch } from '~/lib/api'
import { clampMenuPosition } from '~/lib/ui'
import { pushUndo } from '~/lib/undo'
import CategoryRow from './CategoryRow'
import type { BudgetGroup } from '~/lib/budget-engine'
import type { Accessor } from 'solid-js'
import type { Record } from '~/lib/sync-engine/types'

interface GroupRowProps {
  group: BudgetGroup
  total: Accessor<{ assigned: number; activity: number; available: number }>
  month: Accessor<string>
  categoryGroups: Record[]
  isEditing: boolean
  editingCategoryId: string | null
  showAddCategory: boolean
  onAddCategory: () => void
  onRename: () => void
  onDelete: () => void
  onRenameCategory: (id: string) => void
  onMoveCategory: (catId: string, newGroupId: string) => void
  onDeleteCategory: (id: string, name: string) => void
  onCoverFrom: (catId: string) => void
  onMoveTo: (catId: string) => void
  onViewDetail: (catId: string) => void
  onSetTarget: (catId: string) => void
  onRenameSubmit: (values: Record<string, string>) => void
  onRenameCategorySubmit: (id: string, values: Record<string, string>) => void
  onCreateCategory: (values: Record<string, string>) => void
  onCancelAdd: () => void
  onCancelEdit: () => void
}

const GroupRow: Component<GroupRowProps> = (props) => {
  const { raw, reactive } = useStore()
  const otherGroups = () => props.categoryGroups.filter(g => g.id !== props.group.groupId)
  const [collapsed, setCollapsed] = createSignal(false)
  const [ctxMenu, setCtxMenu] = createSignal<{ x: number; y: number } | null>(null)
  const [iconPickerOpen, setIconPickerOpen] = createSignal(false)
  let headerRef: HTMLDivElement | undefined
  let ctxMenuRef: HTMLDivElement | undefined

  const overspentCount = () => props.group.categories.filter(c => c.available < 0).length
  const underfundedCount = () => props.group.categories.filter(c => c.target?.isUnderfunded === true).length

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
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
    if (headerRef && headerRef.contains(target)) return
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

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const pos = clampMenuPosition(e.clientX, e.clientY)
    setCtxMenu({ x: pos.x, y: pos.y })
  }

  async function commitGroupIcon(newIcon: string | null) {
    const groupId = props.group.groupId
    const group = await raw.get('category_groups', groupId)
    if (!group) return
    const oldIcon = (group.icon as string) ?? null
    if (newIcon === oldIcon) return
    const updated = { ...group, icon: newIcon }
    await raw.put('category_groups', updated)
    reactive.notify('category_groups')
    apiPatch(`/api/category_groups/${groupId}`, { icon: newIcon }).catch(() => {})
    pushUndo({
      description: `Changed icon for group ${props.group.groupName}`,
      async undo() { await raw.put('category_groups', group); reactive.notify('category_groups') },
      async redo() { await raw.put('category_groups', updated); reactive.notify('category_groups') },
    })
  }

  return (
    <div class="budget-group">
      <Show when={!props.isEditing} fallback={
        <div class="budget-group__header">
          <InlineForm
            fields={[{ key: 'name', label: 'Group name', type: 'text', required: true, placeholder: props.group.groupName }]}
            onSubmit={props.onRenameSubmit}
            onCancel={props.onCancelEdit}
            submitLabel="Rename"
          />
        </div>
      }>
        <div ref={headerRef} class="budget-group__header" onContextMenu={handleContextMenu}>
          <div class="budget-group__name" style={{ position: 'relative' }}>
            <span class="budget-group__chevron" onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed()) }}>
              {collapsed() ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </span>
            <span class="budget-row__icon" onClick={(e) => { e.stopPropagation(); setIconPickerOpen(!iconPickerOpen()) }} title="Change icon">
              <EntityIcon icon={props.group.groupIcon} name={props.group.groupName} size={14} />
            </span>
            {props.group.groupName}
            <Show when={iconPickerOpen()}>
              <IconPicker
                value={props.group.groupIcon}
                entityName={props.group.groupName}
                onPick={(iconId) => { commitGroupIcon(iconId); setIconPickerOpen(false) }}
                onCancel={() => setIconPickerOpen(false)}
              />
            </Show>
            <div class="budget-group__more" onClick={(e) => { e.stopPropagation(); props.onAddCategory() }}>
              <span class="budget-group__more-icon"><Plus size={14} /></span>
            </div>
          </div>
          <div class="budget-group__target" />
          <div class="budget-group__assigned">
            <MoneyDisplay amount={props.total().assigned} unsigned />
          </div>
          <div class="budget-group__activity cell--computed">
            <MoneyDisplay amount={props.total().activity} />
          </div>
          <div class="budget-group__available cell--computed">
            <MoneyDisplay amount={props.total().available} />
          </div>
          <div class="budget-group__health">
            <HealthRing available={props.total().available} activity={props.total().activity} />
          </div>
          <div class="budget-group__status">
            <Show when={overspentCount() > 0}>
              <span class="budget-group__badge budget-group__badge--overspent"><AlertTriangle size={11} /> {overspentCount()}</span>
            </Show>
            <Show when={underfundedCount() > 0}>
              <span class="budget-group__badge budget-group__badge--underfunded"><TrendingDown size={11} /> {underfundedCount()}</span>
            </Show>
          </div>
        </div>
      </Show>
      <Show when={!collapsed()}>
      <For each={props.group.categories}>
        {(cat) => (
          <Show when={props.editingCategoryId !== cat.categoryId} fallback={
            <div class="budget-row">
              <InlineForm
                fields={[{ key: 'name', label: 'Category name', type: 'text', required: true, placeholder: cat.categoryName }]}
                onSubmit={(values) => props.onRenameCategorySubmit(cat.categoryId, values)}
                onCancel={props.onCancelEdit}
                submitLabel="Rename"
              />
            </div>
          }>
            <CategoryRow
              budget={cat}
              month={props.month}
              otherGroups={otherGroups()}
              onRename={() => props.onRenameCategory(cat.categoryId)}
              onMove={(newGroupId) => props.onMoveCategory(cat.categoryId, newGroupId)}
              onDelete={() => props.onDeleteCategory(cat.categoryId, cat.categoryName)}
              onCoverFrom={(catId) => props.onCoverFrom(catId)}
              onMoveTo={(catId) => props.onMoveTo(catId)}
              onViewDetail={(catId) => props.onViewDetail(catId)}
              onSetTarget={(catId) => props.onSetTarget(catId)}
            />
          </Show>
        )}
      </For>
      <Show when={props.group.categories.length === 0 && !props.showAddCategory}>
        <div class="budget-row budget-row--empty" onClick={() => props.onAddCategory()}>
          <div class="budget-row__name">
            <span class="budget-row__empty-text">No categories yet — click to add one</span>
          </div>
        </div>
      </Show>
      <Show when={props.showAddCategory}>
        <div class="budget-row">
          <InlineForm
            fields={[{ key: 'name', label: 'Category name', type: 'text', required: true, placeholder: 'New category name' }]}
            onSubmit={props.onCreateCategory}
            onCancel={props.onCancelAdd}
            submitLabel="Create"
          />
        </div>
      </Show>
      </Show>
      {/* Right-click context menu */}
      <Show when={ctxMenu()}>
        {(menu) => (
          <div ref={ctxMenuRef} class="ctx-menu" style={{ position: 'fixed', left: `${menu().x}px`, top: `${menu().y}px`, 'z-index': 200 }} onClick={(e) => e.stopPropagation()}>
            <div class="ctx-menu__item" onClick={() => { setCtxMenu(null); props.onAddCategory() }}>Add category</div>
            <div class="ctx-menu__item" onClick={() => { setCtxMenu(null); setIconPickerOpen(true) }}>Change icon...</div>
            <div class="ctx-menu__sep" />
            <div class="ctx-menu__item" onClick={() => { setCtxMenu(null); props.onRename() }}>Rename</div>
            <div class="ctx-menu__item ctx-menu__item--danger" onClick={() => { setCtxMenu(null); props.onDelete() }}>Delete</div>
          </div>
        )}
      </Show>
    </div>
  )
}

export default GroupRow
