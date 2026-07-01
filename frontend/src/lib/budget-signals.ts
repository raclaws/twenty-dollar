import { createMemo, type Accessor } from 'solid-js'
import { createQuery } from './solid-binding'
import { computeBudget, type BudgetMonth, type CategoryBudget } from './budget-engine'
import type { ReactiveStore } from './sync-engine/reactive'

export interface BudgetStore {
  budget: Accessor<BudgetMonth>
  rta: Accessor<number>
  categoryBudget: (id: string) => Accessor<CategoryBudget>
  groupTotal: (groupId: string) => Accessor<{ assigned: number; activity: number; available: number }>
}

const EMPTY_CATEGORY: CategoryBudget = {
  categoryId: '',
  categoryName: '',
  categoryIcon: null,
  groupId: '',
  assigned: 0,
  activity: 0,
  available: 0,
}

export function createBudgetStore(
  reactive: ReactiveStore,
  month: Accessor<string>,
): BudgetStore {
  const categoryGroups = createQuery(reactive, 'category_groups')
  const categories = createQuery(reactive, 'categories')
  const transactions = createQuery(reactive, 'transactions')
  const splitEntries = createQuery(reactive, 'split_entries')
  const assignments = createQuery(reactive, 'assignments')

  const budget = createMemo(() =>
    computeBudget(
      categoryGroups(),
      categories(),
      transactions(),
      splitEntries(),
      assignments(),
      month(),
    )
  )

  const rta = createMemo(() => budget().rta)

  const categoryMemos = new Map<string, Accessor<CategoryBudget>>()

  function categoryBudget(id: string): Accessor<CategoryBudget> {
    if (!categoryMemos.has(id)) {
      const memo = createMemo(() => {
        const b = budget()
        return b.categoryMap.get(id) ?? { ...EMPTY_CATEGORY, categoryId: id }
      })
      categoryMemos.set(id, memo)
    }
    return categoryMemos.get(id)!
  }

  function groupTotal(groupId: string): Accessor<{ assigned: number; activity: number; available: number }> {
    return createMemo(() => {
      const b = budget()
      const group = b.groups.find(g => g.groupId === groupId)
      if (!group) return { assigned: 0, activity: 0, available: 0 }
      let assigned = 0, activity = 0, available = 0
      for (const cat of group.categories) {
        assigned += cat.assigned
        activity += cat.activity
        available += cat.available
      }
      return { assigned, activity, available }
    })
  }

  return { budget, rta, categoryBudget, groupTotal }
}
