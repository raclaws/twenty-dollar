import type { Record } from './sync-engine/types'
import { lastDayOfMonth } from './format'

export interface TargetStatus {
  targetType: 'monthly' | 'by_date' | 'savings'
  targetAmount: number
  targetDate: string | null
  needed: number
  progress: number
  isUnderfunded: boolean
}

export interface CategoryBudget {
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  groupId: string
  assigned: number
  activity: number
  available: number
  target: TargetStatus | null
}

export interface BudgetGroup {
  groupId: string
  groupName: string
  groupIcon: string | null
  categories: CategoryBudget[]
}

export interface BudgetMonth {
  month: string
  rta: number
  groups: BudgetGroup[]
  categoryMap: Map<string, CategoryBudget>
}

export function computeBudget(
  categoryGroups: Record[],
  categories: Record[],
  transactions: Record[],
  splitEntries: Record[],
  assignments: Record[],
  month: string,
): BudgetMonth {
  const monthStart = `${month}-01`
  const monthEnd = lastDayOfMonth(month)

  // Budget starts from the earliest Starting Balance month
  const budgetStartMonth = getBudgetStartMonth(transactions)
  const isBeforeBudgetStart = budgetStartMonth ? month < budgetStartMonth : false
  const budgetStartDate = budgetStartMonth ? `${budgetStartMonth}-01` : null

  const totalAvailable = isBeforeBudgetStart ? 0 : computeUncategorizedTotal(transactions, splitEntries, monthEnd, budgetStartDate)
  const totalAssigned = isBeforeBudgetStart ? 0 : computeTotalAssigned(assignments, month, budgetStartMonth)
  const rta = totalAvailable - totalAssigned

  const activityThisMonth = activityByCategory(transactions, splitEntries, monthStart, monthEnd)
  const cumulativeActivity = cumulativeActivityByCategory(transactions, splitEntries, monthEnd, budgetStartDate)
  const assignedThisMonth = assignedForMonth(assignments, month)
  const cumAssigned = cumulativeAssignedByCategory(assignments, month, budgetStartMonth)

  const categoryMap = new Map<string, CategoryBudget>()

  const groups: BudgetGroup[] = categoryGroups
    .slice()
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
    .map(group => {
      const groupCats = categories
        .filter(c => c.group_id === group.id)
        .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))

      const catBudgets: CategoryBudget[] = groupCats.map(cat => {
        const id = cat.id as string
        const assigned = assignedThisMonth.get(id) ?? 0
        const activity = activityThisMonth.get(id) ?? 0
        const cumA = cumAssigned.get(id) ?? 0
        const cumAct = cumulativeActivity.get(id) ?? 0
        const available = cumA + cumAct

        const target = computeTargetStatus(
          cat.target_type as string | null,
          cat.target_amount as number | null,
          cat.target_date as string | null,
          available,
          assigned,
          month,
        )

        const budget: CategoryBudget = {
          categoryId: id,
          categoryName: cat.name as string,
          categoryIcon: (cat.icon as string) ?? null,
          groupId: group.id as string,
          assigned,
          activity,
          available,
          target,
        }
        categoryMap.set(id, budget)
        return budget
      })

      return {
        groupId: group.id as string,
        groupName: group.name as string,
        groupIcon: (group.icon as string) ?? null,
        categories: catBudgets,
      }
    })

  return { month, rta, groups, categoryMap }
}

export function computeTargetStatus(
  targetType: string | null,
  targetAmount: number | null,
  targetDate: string | null,
  available: number,
  assigned: number,
  currentMonth: string,
): TargetStatus | null {
  if (!targetType || !targetAmount || targetAmount <= 0) return null

  if (targetType === 'monthly') {
    const progress = assigned / targetAmount
    const needed = Math.max(0, targetAmount - assigned)
    return { targetType: 'monthly', targetAmount, targetDate: null, needed, progress, isUnderfunded: needed > 0 }
  }

  if (targetType === 'by_date' && targetDate) {
    const progress = available / targetAmount
    const [tYear, tMonth] = targetDate.split('-').map(Number)
    const [cYear, cMonth] = currentMonth.split('-').map(Number)
    const monthsRemaining = Math.max(1, (tYear - cYear) * 12 + (tMonth - cMonth))
    const remaining = Math.max(0, targetAmount - available)
    const monthlyNeeded = Math.ceil(remaining / monthsRemaining)
    const needed = Math.max(0, monthlyNeeded - assigned)
    return { targetType: 'by_date', targetAmount, targetDate, needed, progress, isUnderfunded: needed > 0 }
  }

  if (targetType === 'savings') {
    const progress = available / targetAmount
    const needed = Math.max(0, targetAmount - available)
    return { targetType: 'savings', targetAmount, targetDate: null, needed, progress, isUnderfunded: needed > 0 }
  }

  return null
}

function getBudgetStartMonth(transactions: Record[]): string | null {
  let earliest: string | null = null
  for (const tx of transactions) {
    const payee = tx.payee as string | null
    if (payee === 'Starting Balance' || payee === 'Balance Adjustment') {
      const date = (tx.date as string).slice(0, 7)
      if (!earliest || date < earliest) earliest = date
    }
  }
  return earliest
}

function computeUncategorizedTotal(
  transactions: Record[],
  splits: Record[],
  endDate: string,
  startDate: string | null,
): number {
  let total = 0
  const txsWithSplits = new Set(splits.map(s => s.transaction_id as string))
  for (const tx of transactions) {
    const date = tx.date as string
    if (date <= endDate && !tx.linked_id) {
      if (startDate && date < startDate) continue
      if (tx.category_id == null && !txsWithSplits.has(tx.id as string)) {
        total += tx.amount as number
      }
    }
  }
  return total
}

function computeTotalAssigned(assignments: Record[], upToMonth: string, startMonth: string | null): number {
  let total = 0
  for (const a of assignments) {
    const m = a.month as string
    if (m <= upToMonth) {
      if (startMonth && m < startMonth) continue
      total += a.amount as number
    }
  }
  return total
}

function activityByCategory(
  transactions: Record[],
  splits: Record[],
  monthStart: string,
  monthEnd: string,
): Map<string, number> {
  const map = new Map<string, number>()
  const txsWithSplits = new Set(splits.map(s => s.transaction_id as string))

  for (const tx of transactions) {
    const date = tx.date as string
    if (date >= monthStart && date <= monthEnd && tx.category_id != null && !txsWithSplits.has(tx.id as string)) {
      const id = tx.category_id as string
      map.set(id, (map.get(id) ?? 0) + (tx.amount as number))
    }
  }

  for (const split of splits) {
    if (split.category_id == null) continue
    const tx = transactions.find(t => t.id === split.transaction_id)
    if (!tx) continue
    const date = tx.date as string
    if (date >= monthStart && date <= monthEnd) {
      const id = split.category_id as string
      map.set(id, (map.get(id) ?? 0) + (split.amount as number))
    }
  }

  return map
}

function cumulativeActivityByCategory(
  transactions: Record[],
  splits: Record[],
  endDate: string,
  startDate: string | null,
): Map<string, number> {
  const map = new Map<string, number>()
  const txsWithSplits = new Set(splits.map(s => s.transaction_id as string))

  for (const tx of transactions) {
    const date = tx.date as string
    if (date <= endDate && tx.category_id != null && !txsWithSplits.has(tx.id as string)) {
      if (startDate && date < startDate) continue
      const id = tx.category_id as string
      map.set(id, (map.get(id) ?? 0) + (tx.amount as number))
    }
  }

  for (const split of splits) {
    if (split.category_id == null) continue
    const tx = transactions.find(t => t.id === split.transaction_id)
    if (!tx) continue
    const date = tx.date as string
    if (date <= endDate) {
      if (startDate && date < startDate) continue
      const id = split.category_id as string
      map.set(id, (map.get(id) ?? 0) + (split.amount as number))
    }
  }

  return map
}

function assignedForMonth(assignments: Record[], month: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const a of assignments) {
    if ((a.month as string) === month) {
      const id = a.category_id as string
      map.set(id, (map.get(id) ?? 0) + (a.amount as number))
    }
  }
  return map
}

function cumulativeAssignedByCategory(assignments: Record[], upToMonth: string, startMonth: string | null): Map<string, number> {
  const map = new Map<string, number>()
  for (const a of assignments) {
    const m = a.month as string
    if (m <= upToMonth) {
      if (startMonth && m < startMonth) continue
      const id = a.category_id as string
      map.set(id, (map.get(id) ?? 0) + (a.amount as number))
    }
  }
  return map
}
