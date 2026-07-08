// Main budget computation — pure function, no framework deps.

import { startOfMonth, isBefore, isEqual, isWithinInterval, endOfMonth } from 'date-fns';
import type {
  CategoryGroup,
  Category,
  Transaction,
  SplitEntry,
  Assignment,
} from '../types';
import type { BudgetMonth, BudgetGroup, CategoryBudget } from './types';
import { findBudgetStartMonth, computeRTA } from './rta';
import { computeTarget } from './targets';

/**
 * Compute the full budget state for a given month.
 * Pure, deterministic: same inputs always produce the same output.
 */
export function computeBudget(
  categoryGroups: CategoryGroup[],
  categories: Category[],
  transactions: Transaction[],
  splitEntries: SplitEntry[],
  assignments: Assignment[],
  month: string, // YYYY-MM
): BudgetMonth {
  const budgetStartMonth = findBudgetStartMonth(transactions, month);

  // Precompute: assignments by category×month, activity by category×month
  const assignmentMap = buildAssignmentMap(assignments);
  const activityMap = buildActivityMap(transactions, splitEntries);

  // Build category budgets
  const categoryMap = new Map<string, CategoryBudget>();

  for (const cat of categories) {
    const assigned = getAssigned(assignmentMap, cat.id, month);
    const activity = getActivity(activityMap, cat.id, month);
    const available = computeAvailable(
      assignmentMap,
      activityMap,
      cat.id,
      budgetStartMonth,
      month,
    );

    const target = computeTarget(cat, assigned, available, month);

    const status = computeStatus(available, assigned, target);

    const budget: CategoryBudget = {
      categoryId: cat.id,
      assigned,
      activity,
      available,
      target,
      status,
    };

    categoryMap.set(cat.id, budget);
  }

  // Build groups
  const groupCategoryMap = new Map<string, Category[]>();
  for (const cat of categories) {
    const list = groupCategoryMap.get(cat.group_id) ?? [];
    list.push(cat);
    groupCategoryMap.set(cat.group_id, list);
  }

  const groups: BudgetGroup[] = categoryGroups
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((group) => {
      const cats = (groupCategoryMap.get(group.id) ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);

      const catBudgets = cats
        .map((c) => categoryMap.get(c.id))
        .filter((b): b is CategoryBudget => b != null);

      return {
        groupId: group.id,
        name: group.name,
        categories: catBudgets,
        totalAssigned: catBudgets.reduce((sum, c) => sum + c.assigned, 0),
        totalActivity: catBudgets.reduce((sum, c) => sum + c.activity, 0),
        totalAvailable: catBudgets.reduce((sum, c) => sum + c.available, 0),
      };
    });

  // Handle categories with no group (orphans) — add to a synthetic group
  const groupIds = new Set(categoryGroups.map((g) => g.id));
  const orphanCats = categories.filter((c) => !groupIds.has(c.group_id));
  if (orphanCats.length > 0) {
    const orphanBudgets = orphanCats
      .map((c) => categoryMap.get(c.id))
      .filter((b): b is CategoryBudget => b != null);

    if (orphanBudgets.length > 0) {
      groups.push({
        groupId: '__ungrouped__',
        name: 'Ungrouped',
        categories: orphanBudgets,
        totalAssigned: orphanBudgets.reduce((sum, c) => sum + c.assigned, 0),
        totalActivity: orphanBudgets.reduce((sum, c) => sum + c.activity, 0),
        totalAvailable: orphanBudgets.reduce((sum, c) => sum + c.available, 0),
      });
    }
  }

  // Counts
  const counts = { overspent: 0, underfunded: 0, unfunded: 0, funded: 0 };
  for (const budget of categoryMap.values()) {
    counts[budget.status]++;
  }

  // RTA
  const rta = computeRTA(
    transactions,
    splitEntries,
    assignments,
    budgetStartMonth,
    month,
  );

  return {
    month,
    rta,
    budgetStartMonth,
    groups,
    categoryMap,
    counts,
  };
}

// --- Internal helpers ---

type MonthKey = string; // "categoryId:YYYY-MM"

function makeKey(categoryId: string, month: string): MonthKey {
  return `${categoryId}:${month}`;
}

/**
 * Build a lookup: categoryId:month → total assigned cents
 */
function buildAssignmentMap(assignments: Assignment[]): Map<MonthKey, number> {
  const map = new Map<MonthKey, number>();
  for (const a of assignments) {
    const key = makeKey(a.category_id, a.month);
    map.set(key, (map.get(key) ?? 0) + a.amount);
  }
  return map;
}

/**
 * Build a lookup: categoryId:month → total activity cents
 * Activity includes both direct categorized transactions and split entries.
 */
function buildActivityMap(
  transactions: Transaction[],
  splitEntries: SplitEntry[],
): Map<MonthKey, number> {
  const map = new Map<MonthKey, number>();

  // Set of transaction IDs that have splits (these are handled via splitEntries)
  const splitTxIds = new Set(splitEntries.map((s) => s.transaction_id));

  // Direct categorized transactions (not split)
  for (const tx of transactions) {
    if (!tx.category_id) continue;
    if (splitTxIds.has(tx.id)) continue;

    const txMonth = tx.date.slice(0, 7); // YYYY-MM
    const key = makeKey(tx.category_id, txMonth);
    map.set(key, (map.get(key) ?? 0) + tx.amount);
  }

  // Split entries — each split has its own category
  for (const split of splitEntries) {
    // Find parent transaction to get the date
    const parentTx = transactions.find((t) => t.id === split.transaction_id);
    if (!parentTx) continue;

    const txMonth = parentTx.date.slice(0, 7);
    const key = makeKey(split.category_id, txMonth);
    map.set(key, (map.get(key) ?? 0) + split.amount);
  }

  return map;
}

function getAssigned(
  assignmentMap: Map<MonthKey, number>,
  categoryId: string,
  month: string,
): number {
  return assignmentMap.get(makeKey(categoryId, month)) ?? 0;
}

function getActivity(
  activityMap: Map<MonthKey, number>,
  categoryId: string,
  month: string,
): number {
  return activityMap.get(makeKey(categoryId, month)) ?? 0;
}

/**
 * Compute cumulative available: sum of (assigned + activity) for every month
 * from budgetStartMonth through currentMonth.
 */
function computeAvailable(
  assignmentMap: Map<MonthKey, number>,
  activityMap: Map<MonthKey, number>,
  categoryId: string,
  budgetStartMonth: string,
  currentMonth: string,
): number {
  let available = 0;
  const start = parseMonth(budgetStartMonth);
  const end = parseMonth(currentMonth);

  let cursor = start;
  while (isBefore(cursor, end) || isEqual(cursor, end)) {
    const m = formatMonth(cursor);
    available += assignmentMap.get(makeKey(categoryId, m)) ?? 0;
    available += activityMap.get(makeKey(categoryId, m)) ?? 0;

    // Advance one month
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return available;
}

/**
 * Derive status from available, assigned, and target info.
 */
function computeStatus(
  available: number,
  assigned: number,
  target: { needed: number } | null,
): 'overspent' | 'underfunded' | 'unfunded' | 'funded' {
  if (available < 0) return 'overspent';
  if (target && target.needed > 0) {
    if (assigned === 0) return 'unfunded';
    return 'underfunded';
  }
  return 'funded';
}

// --- Date helpers ---

function parseMonth(month: string): Date {
  return new Date(`${month}-01T00:00:00`);
}

function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
