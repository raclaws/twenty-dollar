import { type Component } from 'solid-js'
import EntityPicker, { type EntityPickerSection } from './EntityPicker'
import { useStore } from '~/App'
import { createQuery } from '~/lib/solid-binding'
import type { Record } from '~/lib/sync-engine/types'

// ─── Payee Picker ───

export interface PayeePickerProps {
  value: string
  knownPayees: { id: string; name: string }[]
  accounts: Record[]
  onPick: (payeeId: string) => void
  onCancel: () => void
  onTab?: () => void
}

export function PayeePicker(props: PayeePickerProps) {
  const { raw, reactive } = useStore()
  const payees = createQuery(reactive, 'payees')

  const sections = (): EntityPickerSection[] => {
    const payeeItems = props.knownPayees.map(p => ({ id: p.id, label: p.name, icon: null as string | null }))
    const accountItems = props.accounts.map(a => {
      const accountPayee = payees().find(p => (p.account_id as string) === (a.id as string))
      return { id: accountPayee?.id as string ?? '', label: a.name as string, meta: a.type as string, icon: null as string | null }
    }).filter(item => item.id)

    return [
      { key: 'none', label: '', items: [{ id: '__none__', label: 'No payee' }] },
      { key: 'payees', label: 'Payees', items: payeeItems, allowCreate: true, createLabel: '+ New payee' },
      { key: 'transfer', label: 'Transfer to', items: accountItems },
    ]
  }

  async function handleCreate(name: string) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await raw.put('payees', { id, name, type: 'external', account_id: null, created_at: now })
    reactive.notify('payees')
    props.onPick(id)
  }

  return (
    <EntityPicker
      sections={sections()}
      value={props.value}
      placeholder="Search payee or account..."
      onPick={(id) => props.onPick(id)}
      onCreate={handleCreate}
      onCancel={props.onCancel}
      onTab={props.onTab}
    />
  )
}

// ─── Category Picker ───

export interface CategoryPickerProps {
  value: string
  groups: Record[]
  categories: Record[]
  onPick: (categoryId: string) => void
  onCancel: () => void
  onTab?: () => void
}

export function CategoryPicker(props: CategoryPickerProps) {
  const { raw, reactive } = useStore()

  const sections = (): EntityPickerSection[] => {
    const result: EntityPickerSection[] = [
      { key: 'none', label: '', items: [{ id: '__none__', label: 'No category' }] },
    ]
    for (const group of props.groups) {
      const groupCats = props.categories
        .filter(c => c.group_id === group.id && !(c.deleted_at as string))
        .map(c => ({ id: c.id as string, label: c.name as string, icon: (c.icon as string) ?? null }))
      result.push({
        key: group.id as string,
        label: group.name as string,
        items: groupCats,
        allowCreate: true,
        createLabel: `+ Add to ${group.name as string}`,
      })
    }
    return result
  }

  async function handleCreate(name: string, groupId: string) {
    const id = crypto.randomUUID()
    const sortOrder = props.categories.filter(c => c.group_id === groupId).length
    await raw.put('categories', { id, group_id: groupId, name, sort_order: sortOrder })
    reactive.notify('categories')
    props.onPick(id)
  }

  async function handleCreateGroup(name: string) {
    const groupId = crypto.randomUUID()
    const sortOrder = props.groups.length
    await raw.put('category_groups', { id: groupId, name, sort_order: sortOrder })
    reactive.notify('category_groups')
  }

  return (
    <EntityPicker
      sections={sections()}
      value={props.value}
      placeholder="Search category..."
      onPick={(id) => props.onPick(id)}
      onCreate={handleCreate}
      onCancel={props.onCancel}
      onTab={props.onTab}
      allowNewGroup
      onCreateGroup={handleCreateGroup}
    />
  )
}
