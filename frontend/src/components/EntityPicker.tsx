import { createSignal, createMemo, For, Show, onMount, onCleanup, type Component } from 'solid-js'
import { EntityIcon } from './IconPicker'
import { getInitial, getInitialColor } from '~/lib/icons'

export interface EntityPickerItem {
  id: string
  label: string
  meta?: string
  icon?: string | null
}

export interface EntityPickerSection {
  key: string
  label: string
  items: EntityPickerItem[]
  allowCreate?: boolean
  createLabel?: string
}

export interface EntityPickerProps {
  sections: EntityPickerSection[]
  value: string
  placeholder?: string
  onPick: (id: string, sectionKey: string) => void
  onCreate: (name: string, sectionKey: string) => void
  onCancel: () => void
  onTab?: () => void
  allowNewGroup?: boolean
  onCreateGroup?: (name: string) => void
}

interface FlatItem {
  type: 'item' | 'create' | 'new-group'
  id: string
  label: string
  sectionKey: string
  meta?: string
  icon?: string | null
}

const EntityPicker: Component<EntityPickerProps> = (props) => {
  const [query, setQuery] = createSignal('')
  const [activeIndex, setActiveIndex] = createSignal(0)
  const [creatingIn, setCreatingIn] = createSignal<string | null>(null)
  const [newName, setNewName] = createSignal('')
  let searchRef: HTMLInputElement | undefined
  let listRef: HTMLDivElement | undefined

  const flatItems = createMemo((): FlatItem[] => {
    const q = query().toLowerCase()
    const result: FlatItem[] = []

    for (const section of props.sections) {
      const filtered = q
        ? section.items.filter(i => i.label.toLowerCase().includes(q))
        : section.items

      for (const item of filtered) {
        result.push({ type: 'item', id: item.id, label: item.label, sectionKey: section.key, meta: item.meta, icon: item.icon })
      }

      if (section.allowCreate && q && !filtered.some(i => i.label.toLowerCase() === q)) {
        result.push({ type: 'create', id: `__create_${section.key}`, label: `+ "${query()}"`, sectionKey: section.key })
      } else if (section.allowCreate && !q) {
        result.push({ type: 'create', id: `__create_${section.key}`, label: section.createLabel ?? '+ Add new', sectionKey: section.key })
      }
    }

    if (props.allowNewGroup) {
      result.push({ type: 'new-group', id: '__new_group', label: '+ New Group', sectionKey: '' })
    }

    return result
  })

  const groupedItems = createMemo(() => {
    const items = flatItems()
    const groups: { key: string; label: string; items: FlatItem[] }[] = []
    let currentGroup: { key: string; label: string; items: FlatItem[] } | null = null

    for (const item of items) {
      if (item.type === 'new-group') {
        groups.push({ key: '__new_group', label: '', items: [item] })
        continue
      }
      if (!currentGroup || currentGroup.key !== item.sectionKey) {
        const section = props.sections.find(s => s.key === item.sectionKey)
        currentGroup = { key: item.sectionKey, label: section?.label ?? '', items: [] }
        groups.push(currentGroup)
      }
      currentGroup.items.push(item)
    }

    return groups
  })

  function globalIndex(item: FlatItem): number {
    return flatItems().indexOf(item)
  }

  function handlePick(item: FlatItem) {
    if (item.type === 'item') {
      props.onPick(item.id, item.sectionKey)
    } else if (item.type === 'create') {
      if (query()) {
        props.onCreate(query(), item.sectionKey)
      } else {
        setCreatingIn(item.sectionKey)
      }
    } else if (item.type === 'new-group') {
      setCreatingIn('__new_group')
    }
  }

  function submitCreate() {
    const name = newName().trim()
    if (!name) return
    const section = creatingIn()
    if (section === '__new_group' && props.onCreateGroup) {
      props.onCreateGroup(name)
    } else if (section) {
      props.onCreate(name, section)
    }
    setNewName('')
    setCreatingIn(null)
  }

  function cancelCreate() {
    setNewName('')
    setCreatingIn(null)
    searchRef?.focus()
  }

  function handleKeyDown(e: KeyboardEvent) {
    const items = flatItems()
    if (creatingIn()) {
      if (e.key === 'Escape') cancelCreate()
      else if (e.key === 'Enter') { e.preventDefault(); submitCreate() }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, items.length - 1))
      scrollToActive()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
      scrollToActive()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[activeIndex()]
      if (item) handlePick(item)
    } else if (e.key === 'Escape') {
      props.onCancel()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const item = items[activeIndex()]
      if (item?.type === 'item') props.onPick(item.id, item.sectionKey)
      else props.onCancel()
      if (props.onTab) props.onTab()
    }
  }

  function scrollToActive() {
    const el = listRef?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }

  onMount(() => {
    setTimeout(() => {
      searchRef?.focus()
      if (props.value) {
        const idx = flatItems().findIndex(item => item.id === props.value)
        if (idx >= 0) setActiveIndex(idx)
      }
    }, 0)

    function globalEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.stopImmediatePropagation()
        props.onCancel()
      }
    }

    function globalClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('.entity-picker')) {
        props.onCancel()
      }
    }

    document.addEventListener('keydown', globalEscape)
    setTimeout(() => {
      document.addEventListener('mousedown', globalClick, true)
    }, 10)
    onCleanup(() => {
      document.removeEventListener('keydown', globalEscape)
      document.removeEventListener('mousedown', globalClick, true)
    })
  })

  return (
    <div class="entity-picker" onKeyDown={handleKeyDown} onMouseDown={(e) => e.stopPropagation()}>
      <input
        class="entity-picker__search"
        type="text"
        placeholder={props.placeholder ?? 'Search...'}
        ref={searchRef}
        value={query()}
        onInput={(e) => { setQuery(e.currentTarget.value); setActiveIndex(0) }}
      />
      <div class="entity-picker__list" ref={listRef}>
        <Show when={flatItems().length === 0}>
          <div class="entity-picker__empty">No results</div>
        </Show>
        <For each={groupedItems()}>
          {(group) => (
            <>
              <Show when={group.label}>
                <div class="entity-picker__section">{group.label}</div>
              </Show>
              <For each={group.items}>
                {(item) => {
                  const idx = () => globalIndex(item)
                  const isActive = () => activeIndex() === idx()
                  return (
                    <div
                      class={`entity-picker__item ${item.type === 'create' || item.type === 'new-group' ? 'entity-picker__create' : ''} ${isActive() ? 'entity-picker__item--active' : ''}`}
                      data-active={isActive()}
                      onMouseEnter={() => setActiveIndex(idx())}
                      onClick={(e) => { e.stopPropagation(); handlePick(item) }}
                    >
                      <Show when={item.type === 'item' && item.icon !== undefined}>
                        <EntityIcon icon={item.icon ?? null} name={item.label} size={16} />
                      </Show>
                      <span class="entity-picker__label">{item.label}</span>
                      <Show when={item.meta}>
                        <span class="entity-picker__meta">{item.meta}</span>
                      </Show>
                    </div>
                  )
                }}
              </For>
            </>
          )}
        </For>
      </div>
      <Show when={creatingIn()}>
        <div class="entity-picker__inline-create">
          <input
            class="entity-picker__create-input"
            type="text"
            placeholder={creatingIn() === '__new_group' ? 'Group name...' : 'Name...'}
            value={newName()}
            onInput={(e) => setNewName(e.currentTarget.value)}
            autofocus
          />
          <button class="btn btn--sm btn--primary" onClick={submitCreate}>Create</button>
          <button class="btn btn--sm btn--secondary" onClick={cancelCreate}>×</button>
        </div>
      </Show>
    </div>
  )
}

export default EntityPicker
