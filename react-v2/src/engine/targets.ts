// Target progress/needed calculations — pure function, no framework deps.

import { startOfMonth, differenceInMonths } from 'date-fns';
import type { Category } from '../types';
import type { TargetInfo } from './types';

/**
 * Compute target info for a category given its current state.
 * Returns null if category has no target.
 */
export function computeTarget(
  category: Category,
  assigned: number,
  available: number,
  currentMonth: string,
): TargetInfo | null {
  if (!category.target_type || category.target_amount == null) {
    return null;
  }

  const targetAmount = category.target_amount;

  switch (category.target_type) {
    case 'monthly':
      return computeMonthlyTarget(targetAmount, assigned);

    case 'by_date':
      return computeByDateTarget(
        targetAmount,
        category.target_date,
        assigned,
        available,
        currentMonth,
      );

    case 'savings':
      return computeSavingsTarget(targetAmount, available);

    default:
      return null;
  }
}

function computeMonthlyTarget(targetAmount: number, assigned: number): TargetInfo {
  const progress = targetAmount > 0 ? Math.min(1, assigned / targetAmount) : 1;
  const needed = Math.max(0, targetAmount - assigned);

  return {
    type: 'monthly',
    amount: targetAmount,
    date: null,
    progress,
    needed,
  };
}

function computeByDateTarget(
  targetAmount: number,
  targetDate: string | null,
  assigned: number,
  available: number,
  currentMonth: string,
): TargetInfo {
  if (!targetDate) {
    // No date set — treat like savings target
    return computeSavingsTarget(targetAmount, available);
  }

  const current = startOfMonth(new Date(`${currentMonth}-01T00:00:00`));
  const target = startOfMonth(new Date(targetDate));

  // Months remaining (inclusive of target month)
  let monthsRemaining = differenceInMonths(target, current) + 1;
  if (monthsRemaining < 1) monthsRemaining = 1;

  const remaining = Math.max(0, targetAmount - available);
  const monthlyNeeded = Math.ceil(remaining / monthsRemaining);
  const needed = Math.max(0, monthlyNeeded - assigned);
  const progress = targetAmount > 0 ? Math.min(1, available / targetAmount) : 1;

  return {
    type: 'by_date',
    amount: targetAmount,
    date: targetDate,
    progress,
    needed,
  };
}

function computeSavingsTarget(targetAmount: number, available: number): TargetInfo {
  const progress = targetAmount > 0 ? Math.min(1, available / targetAmount) : 1;
  const needed = Math.max(0, targetAmount - available);

  return {
    type: 'savings',
    amount: targetAmount,
    date: null,
    progress,
    needed,
  };
}
