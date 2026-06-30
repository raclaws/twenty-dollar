import { createSignal, createMemo, type Component, For, Show, type Accessor } from 'solid-js'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-solid'
import GroupRow from './GroupRow'
import InlineForm from '~/components/InlineForm'
import type { BudgetStore } from '~/lib/budget-signals'
import type { BudgetGroup } from '~/lib/budget-engine'
import type { Record } from '~/lib/sync-engine/types'

type SortField = 'assigned' | 'activity' | 'available'
type SortDir = 'asc' | 'desc'

interface BudgetGridProps {
  store: BudgetStore
  month: Accessor<string>
  categoryGroups: Record[]
  onAddGroup: () => void
  onAddCategory: (groupId: string) => void
  onRenameGroup: (id: string) => void
  onRenameCategory: (id: string) => void
  onMoveCategory: (catId: string, newGroupId: string) => void
  onDeleteGroup: (id: string, name: string) => void
  onDeleteCategory: (id: string, name: string) => void
  onCoverFrom: (catId: string) => void
  onMoveTo: (catId: string) => void
  onViewDetail: (catId: string) => void
  onSetTarget: (catId: string) => void
  showAddGroup: boolean
  showAddCategory: string | null
  editingGroup: string | null
  editingCategory: string | null
  onCreateGroup: (values: Record<string, string>) => void
  onCreateCategory: (values: Record<string, string>) => void
  onRenameGroupSubmit: (id: string, values: Record<string, string>) => void
  onRenameCategorySubmit: (id: string, values: Record<string, string>) => void
  onCancelAdd: () => void
  onCancelEdit: () => void
}

const BudgetGrid: Component<BudgetGridProps> = (props) => {
  const [sortField, setSortField] = createSignal<SortField | null>(null)
  const [sortDir, setSortDir] = createSignal<SortDir>('desc')

  function toggleSort(field: SortField) {
    if (sortField() === field) {
      if (sortDir() === 'desc') setSortDir('asc')
      else { setSortField(null); setSortDir('desc') }
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sortedGroups = createMemo(() => {
    const groups = props.store.budget().groups
    const field = sortField()
    if (!field) return groups

    const dir = sortDir()
    const sorted = groups.map(g => ({
      ...g,
      categories: [...g.categories].sort((a, b) => {
        const diff = a[field] - b[field]
        return dir === 'asc' ? diff : -diff
      })
    }))

    sorted.sort((a, b) => {
      const aTotal = a.categories.reduce((sum, c) => sum + c[field], 0)
      const bTotal = b.categories.reduce((sum, c) => sum + c[field], 0)
      return dir === 'asc' ? aTotal - bTotal : bTotal - aTotal
    })

    return sorted
  })

  function SortHeader(p: { label: string; field: SortField }) {
    const active = () => sortField() === p.field
    return (
      <div class={`budget-grid__col budget-grid__col--num budget-grid__col--sortable ${active() ? 'budget-grid__col--sorted' : ''}`} onClick={() => toggleSort(p.field)}>
        {p.label}
        <span class="budget-grid__sort-icon">
          {active() ? (sortDir() === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : <ChevronsUpDown size={10} />}
        </span>
      </div>
    )
  }

  return (
    <div class="budget-grid">
      <div class="budget-grid__header">
        <div class="budget-grid__col budget-grid__col--name">CATEGORY</div>
        <div class="budget-grid__col budget-grid__col--target" />
        <SortHeader label="ASSIGNED" field="assigned" />
        <SortHeader label="ACTIVITY" field="activity" />
        <SortHeader label="AVAILABLE" field="available" />
        <div class="budget-grid__col budget-grid__col--health" />
        <div class="budget-grid__col budget-grid__col--status" />
      </div>
      <For each={sortedGroups()}>
        {(group) => (
          <GroupRow
            group={group}
            total={props.store.groupTotal(group.groupId)}
            month={props.month}
            categoryGroups={props.categoryGroups}
            isEditing={props.editingGroup === group.groupId}
            editingCategoryId={props.editingCategory}
            showAddCategory={props.showAddCategory === group.groupId}
            onAddCategory={() => props.onAddCategory(group.groupId)}
            onRename={() => props.onRenameGroup(group.groupId)}
            onDelete={() => props.onDeleteGroup(group.groupId, group.groupName)}
            onRenameCategory={props.onRenameCategory}
            onMoveCategory={props.onMoveCategory}
            onDeleteCategory={props.onDeleteCategory}
            onCoverFrom={props.onCoverFrom}
            onMoveTo={props.onMoveTo}
            onViewDetail={props.onViewDetail}
            onSetTarget={props.onSetTarget}
            onRenameSubmit={(values) => props.onRenameGroupSubmit(group.groupId, values)}
            onRenameCategorySubmit={props.onRenameCategorySubmit}
            onCreateCategory={props.onCreateCategory}
            onCancelAdd={props.onCancelAdd}
            onCancelEdit={props.onCancelEdit}
          />
        )}
      </For>
      <Show when={props.store.budget().groups.length === 0}>
        <div class="budget-grid__empty">
          <span class="budget-grid__empty-text">No category groups yet</span>
          <button class="btn btn--sm btn--primary" onClick={props.onAddGroup}>+ Create your first group</button>
        </div>
      </Show>
      <div class="budget-grid__actions">
        <Show when={props.showAddGroup} fallback={
          <div class="budget-grid__add-group" onClick={props.onAddGroup}>
            <span class="budget-grid__add-group-text">Add group...</span>
          </div>
        }>
          <InlineForm
            fields={[{ key: 'name', label: 'Group name', type: 'text', required: true, placeholder: 'Group name' }]}
            onSubmit={props.onCreateGroup}
            onCancel={props.onCancelAdd}
            submitLabel="Create"
          />
        </Show>
      </div>
    </div>
  )
}

export default BudgetGrid
