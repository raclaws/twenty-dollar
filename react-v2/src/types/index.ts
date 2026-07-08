// All money values are in cents (integer). IDs are UUID strings. Dates are ISO strings.

export type AccountType = 'checking' | 'savings' | 'cash' | 'credit';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  sort_order: number;
  created_at: string;
  deleted_at: string | null;
}

export type PayeeType = 'external' | 'account';

export interface Payee {
  id: string;
  name: string;
  type: PayeeType;
  account_id: string | null;
  created_at: string;
}

export interface CategoryGroup {
  id: string;
  name: string;
  sort_order: number;
}

export type TargetType = 'monthly' | 'by_date' | 'savings';

export interface Category {
  id: string;
  group_id: string;
  name: string;
  sort_order: number;
  target_type: TargetType | null;
  target_amount: number | null;
  target_date: string | null;
}

export interface Transaction {
  id: string;
  account_id: string;
  payee_id: string;
  category_id: string | null;
  date: string;
  amount: number; // cents, negative = outflow
  memo: string | null;
  cleared: 0 | 1;
  reconciled_at: string | null;
  linked_id: string | null;
  schedule_id?: string | null;
  source?: string;
  created_at: string;
}

export interface SplitEntry {
  id: string;
  transaction_id: string;
  category_id: string;
  amount: number; // cents
  memo: string | null;
}

export interface Assignment {
  id: string;
  category_id: string;
  month: string; // YYYY-MM
  amount: number; // cents
}

export type ScheduleFrequency = 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface Schedule {
  id: string;
  account_id: string;
  payee_id: string;
  category_id: string | null;
  amount: number; // cents
  memo: string | null;
  frequency: ScheduleFrequency;
  start_date: string;
  end_date: string | null;
  next_due: string;
  paused: 0 | 1;
  created_at: string;
}

// --- Auxiliary types ---

export interface ImportRule {
  id: string;
  tokens: string;
  payee_id: string | null;
  category_id: string | null;
  created_at: string;
}

export interface MonthLock {
  month: string; // YYYY-MM (PK)
  locked_at: string;
}

// Union of all entity types for generic store usage
export type EntityType =
  | 'account'
  | 'payee'
  | 'category_group'
  | 'category'
  | 'transaction'
  | 'split_entry'
  | 'assignment'
  | 'schedule'
  | 'import_rule'
  | 'month_lock';

export type Entity =
  | Account
  | Payee
  | CategoryGroup
  | Category
  | Transaction
  | SplitEntry
  | Assignment
  | Schedule
  | ImportRule
  | MonthLock;

// Mutation queue entry
export interface MutationEntry {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body: unknown;
  timestamp: number;
  retries: number;
}

// Undo entry
export interface UndoEntry {
  id: string;
  description: string;
  redo: () => void;
  undo: () => void;
  timestamp: number;
}
