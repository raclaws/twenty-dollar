import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { Assignment, MonthLock } from '@/types';
import { SyncStore, enqueue } from '@/sync';
import { format, addMonths, subMonths } from 'date-fns';

export class BudgetStore {
  assignmentItems = observable.map<string, Assignment>();
  lockItems = observable.map<string, MonthLock>();
  private assignmentSyncStore: SyncStore<Assignment>;
  private lockSyncStore: SyncStore<MonthLock>;
  currentMonth: string;

  constructor(
    assignmentSyncStore: SyncStore<Assignment>,
    lockSyncStore: SyncStore<MonthLock>
  ) {
    this.assignmentSyncStore = assignmentSyncStore;
    this.lockSyncStore = lockSyncStore;
    this.currentMonth = format(new Date(), 'yyyy-MM');
    makeAutoObservable(this, {
      assignmentItems: false,
      lockItems: false,
    });
  }

  /** Populate observable maps from IDB-hydrated syncStores */
  hydrate(): void {
    const allAssignments = this.assignmentSyncStore.getAll();
    const allLocks = this.lockSyncStore.getAll();
    runInAction(() => {
      this.assignmentItems.clear();
      for (const record of allAssignments) {
        this.assignmentItems.set(record.id, record);
      }
      this.lockItems.clear();
      for (const record of allLocks) {
        this.lockItems.set(record.month, record);
      }
    });
  }

  get assignments(): Map<string, Assignment> {
    return this.assignmentItems;
  }

  get lockedMonths(): Set<string> {
    const set = new Set<string>();
    for (const lock of this.lockItems.values()) {
      set.add(lock.month);
    }
    return set;
  }

  getAssignment(categoryId: string, month: string): Assignment | undefined {
    // Assignments keyed by id, so we need to search
    for (const a of this.assignmentItems.values()) {
      if (a.category_id === categoryId && a.month === month) return a;
    }
    return undefined;
  }

  assignedForCategory(categoryId: string, month: string): number {
    const a = this.getAssignment(categoryId, month);
    return a ? a.amount : 0;
  }

  isMonthLocked(month: string): boolean {
    return this.lockItems.has(month);
  }

  assign(categoryId: string, month: string, amount: number): void {
    const existing = this.getAssignment(categoryId, month);
    const assignment: Assignment = existing
      ? { ...existing, amount }
      : {
          id: crypto.randomUUID(),
          category_id: categoryId,
          month,
          amount,
        };
    this.assignmentItems.set(assignment.id, assignment);
    this.assignmentSyncStore.put(assignment);
    enqueue({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/api/budget/assign',
      body: { category_id: categoryId, month, amount },
      timestamp: Date.now(),
    });
  }

  moveMoney(fromCategoryId: string, toCategoryId: string, month: string, amount: number): void {
    const fromCurrent = this.assignedForCategory(fromCategoryId, month);
    const toCurrent = this.assignedForCategory(toCategoryId, month);
    this.assign(fromCategoryId, month, fromCurrent - amount);
    this.assign(toCategoryId, month, toCurrent + amount);
    enqueue({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/api/budget/move',
      body: { from_category_id: fromCategoryId, to_category_id: toCategoryId, month, amount },
      timestamp: Date.now(),
    });
  }

  lockMonth(month: string): void {
    const lock: MonthLock = { month, locked_at: new Date().toISOString() };
    this.lockItems.set(month, lock);
    this.lockSyncStore.put(lock);
    enqueue({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/api/months/lock',
      body: { month, locked: true },
      timestamp: Date.now(),
    });
  }

  unlockMonth(month: string): void {
    this.lockItems.delete(month);
    this.lockSyncStore.delete(month);
    enqueue({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/api/months/lock',
      body: { month, locked: false },
      timestamp: Date.now(),
    });
  }

  /** Load assignments from server: persist to IDB and update observable map */
  loadFromServer(assignments: Assignment[]): void {
    this.assignmentSyncStore.replaceAll(assignments);
    runInAction(() => {
      this.assignmentItems.clear();
      for (const record of assignments) {
        this.assignmentItems.set(record.id, record);
      }
    });
  }

  /** Import assignments from file: persist to IDB and update observable map */
  importAssignments(assignments: Assignment[]): void {
    this.assignmentSyncStore.replaceAll(assignments);
    runInAction(() => {
      this.assignmentItems.clear();
      for (const record of assignments) {
        this.assignmentItems.set(record.id, record);
      }
    });
  }

  /** Import locks from file: persist to IDB and update observable map */
  importLocks(locks: MonthLock[]): void {
    this.lockSyncStore.replaceAll(locks);
    runInAction(() => {
      this.lockItems.clear();
      for (const record of locks) {
        this.lockItems.set(record.month, record);
      }
    });
  }

  navigateMonth(direction: -1 | 1): void {
    const current = new Date(this.currentMonth + '-01');
    const next = direction === 1 ? addMonths(current, 1) : subMonths(current, 1);
    this.currentMonth = format(next, 'yyyy-MM');
  }
}
