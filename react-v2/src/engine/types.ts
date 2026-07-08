// Budget engine output types — pure computation results, no framework deps.

export interface TargetInfo {
  type: 'monthly' | 'by_date' | 'savings';
  amount: number;          // cents
  date: string | null;     // ISO date, only for by_date
  progress: number;        // 0–1 ratio
  needed: number;          // cents, how much more needed this month
}

export interface CategoryBudget {
  categoryId: string;
  assigned: number;        // this month's assignment (cents)
  activity: number;        // this month's transaction sum (cents)
  available: number;       // cumulative assigned + activity from budget start (cents)
  target: TargetInfo | null;
  status: 'overspent' | 'underfunded' | 'unfunded' | 'funded';
}

export interface BudgetGroup {
  groupId: string;
  name: string;
  categories: CategoryBudget[];
  totalAssigned: number;
  totalActivity: number;
  totalAvailable: number;
}

export interface BudgetMonth {
  month: string;           // YYYY-MM
  rta: number;             // Ready to Assign (cents)
  budgetStartMonth: string;
  groups: BudgetGroup[];
  categoryMap: Map<string, CategoryBudget>;
  counts: {
    overspent: number;
    underfunded: number;
    unfunded: number;
    funded: number;
  };
}
