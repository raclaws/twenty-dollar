// Ready to Assign calculation — pure function, no framework deps.

import { parse, startOfMonth, isBefore, isEqual, endOfMonth, isWithinInterval } from 'date-fns';
import type { Transaction, SplitEntry, Assignment } from '../types';

/**
 * Determine budget start month: the month of the earliest
 * "Starting Balance" or "Balance Adjustment" transaction.
 * Falls back to the requested month if none found.
 */
export function findBudgetStartMonth(
  transactions: Transaction[],
  fallbackMonth: string,
): string {
  let earliest: Date | null = null;

  for (const tx of transactions) {
    if (tx.source === 'starting_balance' || tx.source === 'balance_adjustment') {
      const d = parseDate(tx.date);
      if (!earliest || isBefore(d, earliest)) {
        earliest = d;
      }
    }
  }

  if (!earliest) {
    // Also check memo-based detection as fallback
    for (const tx of transactions) {
      if (
        tx.memo === 'Starting Balance' ||
        tx.memo === 'Balance Adjustment'
      ) {
        const d = parseDate(tx.date);
        if (!earliest || isBefore(d, earliest)) {
          earliest = d;
        }
      }
    }
  }

  if (!earliest) return fallbackMonth;

  const start = startOfMonth(earliest);
  return formatMonth(start);
}

/**
 * Compute Ready to Assign:
 *   = uncategorized income through month end
 *   − total assignments through current month
 *
 * Uncategorized income: transactions with no category_id, not split, not linked/transfer,
 * positive amount (income), from budget start through end of current month.
 */
export function computeRTA(
  transactions: Transaction[],
  splitEntries: SplitEntry[],
  assignments: Assignment[],
  budgetStartMonth: string,
  currentMonth: string,
): number {
  const rangeStart = startOfMonth(parseMonth(budgetStartMonth));
  const rangeEnd = endOfMonth(parseMonth(currentMonth));

  // Build set of transaction IDs that have splits
  const splitTxIds = new Set(splitEntries.map((s) => s.transaction_id));

  // Sum uncategorized income
  let uncategorizedIncome = 0;
  for (const tx of transactions) {
    // Must have no category, not be split, not be a transfer (linked)
    if (tx.category_id !== null) continue;
    if (splitTxIds.has(tx.id)) continue;
    if (tx.linked_id !== null) continue;

    const txDate = parseDate(tx.date);
    if (!isWithinInterval(txDate, { start: rangeStart, end: rangeEnd })) continue;

    // Income = positive amounts (inflows without a category)
    if (tx.amount > 0) {
      uncategorizedIncome += tx.amount;
    }
  }

  // Sum all assignments from budget start through current month
  let totalAssigned = 0;
  for (const a of assignments) {
    const aMonth = parseMonth(a.month);
    if (
      (isEqual(aMonth, rangeStart) || isAfterOrEqual(aMonth, rangeStart)) &&
      (isEqual(aMonth, startOfMonth(parseMonth(currentMonth))) || isBefore(aMonth, startOfMonth(parseMonth(currentMonth))))
    ) {
      totalAssigned += a.amount;
    }
  }

  return uncategorizedIncome - totalAssigned;
}

// --- Helpers ---

function parseDate(dateStr: string): Date {
  // Handle ISO date strings (YYYY-MM-DD or full ISO)
  return new Date(dateStr);
}

function parseMonth(month: string): Date {
  // YYYY-MM → first day of that month
  return new Date(`${month}-01T00:00:00`);
}

function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function isAfterOrEqual(date: Date, ref: Date): boolean {
  return isEqual(startOfMonth(date), startOfMonth(ref)) || isBefore(startOfMonth(ref), startOfMonth(date));
}
