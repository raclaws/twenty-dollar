import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { Transaction, SplitEntry } from '@/types';
import { SyncStore, enqueue, serverFirst } from '@/sync';

export class TransactionStore {
  items = observable.map<string, Transaction>();
  splits = observable.map<string, SplitEntry>();
  private syncStore: SyncStore<Transaction>;
  private splitSyncStore: SyncStore<SplitEntry>;
  selectedIds: Set<string> = new Set();
  editingId: string | null = null;
  filters: {
    dateFrom?: string;
    dateTo?: string;
    categoryId?: string;
    cleared?: 0 | 1;
  } = {};

  constructor(syncStore: SyncStore<Transaction>, splitSyncStore: SyncStore<SplitEntry>) {
    this.syncStore = syncStore;
    this.splitSyncStore = splitSyncStore;
    makeAutoObservable(this, {
      items: false,
      splits: false,
    });
  }

  /** Populate observable maps from IDB-hydrated syncStores */
  hydrate(): void {
    const allTxns = this.syncStore.getAll();
    const allSplits = this.splitSyncStore.getAll();
    runInAction(() => {
      this.items.clear();
      for (const record of allTxns) {
        this.items.set(record.id, record);
      }
      this.splits.clear();
      for (const record of allSplits) {
        this.splits.set(record.id, record);
      }
    });
  }

  get transactions(): Map<string, Transaction> {
    return this.items;
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  getById(id: string): Transaction | undefined {
    return this.items.get(id);
  }

  splitsForTransaction(txnId: string): SplitEntry[] {
    return Array.from(this.splits.values()).filter((s) => s.transaction_id === txnId);
  }

  transactionsForAccount(accountId: string): Transaction[] {
    return Array.from(this.items.values())
      .filter((t) => t.account_id === accountId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  }

  filteredTransactions(accountId: string): Transaction[] {
    let txns = this.transactionsForAccount(accountId);
    const { dateFrom, dateTo, categoryId, cleared } = this.filters;
    if (dateFrom) txns = txns.filter((t) => t.date >= dateFrom);
    if (dateTo) txns = txns.filter((t) => t.date <= dateTo);
    if (categoryId) txns = txns.filter((t) => t.category_id === categoryId);
    if (cleared !== undefined) txns = txns.filter((t) => t.cleared === cleared);
    return txns;
  }

  activityForCategory(categoryId: string, month: string): number {
    const prefix = month; // YYYY-MM
    return Array.from(this.items.values())
      .filter((t) => t.category_id === categoryId && t.date.startsWith(prefix))
      .reduce((sum, t) => sum + t.amount, 0);
  }

  activityForCategoryFromSplits(categoryId: string, month: string): number {
    const prefix = month;
    let total = 0;
    for (const split of this.splits.values()) {
      if (split.category_id !== categoryId) continue;
      const txn = this.items.get(split.transaction_id);
      if (txn && txn.date.startsWith(prefix)) {
        total += split.amount;
      }
    }
    return total;
  }

  incomeForMonth(month: string): number {
    const prefix = month;
    return Array.from(this.items.values())
      .filter((t) => t.category_id === null && t.amount > 0 && t.date.startsWith(prefix) && !t.linked_id)
      .reduce((sum, t) => sum + t.amount, 0);
  }

  createTransaction(txn: Transaction, txnSplits?: SplitEntry[]): void {
    const body = {
      id: txn.id,
      account_id: txn.account_id,
      payee_id: txn.payee_id || null,
      category_id: txn.category_id || null,
      date: txn.date,
      amount: txn.amount,
      memo: txn.memo || null,
      cleared: txn.cleared === 1,
      linked_id: txn.linked_id || null,
      source: txn.source || null,
      splits: txnSplits?.map((s) => ({
        category_id: s.category_id || null,
        amount: s.amount,
        memo: s.memo || null,
      })) ?? [],
    };

    void serverFirst({
      optimistic: () => {
        this.items.set(txn.id, txn);
        this.syncStore.put(txn);
        if (txnSplits) {
          for (const split of txnSplits) {
            this.splits.set(split.id, split);
            this.splitSyncStore.put(split);
          }
        }
      },
      request: () =>
        fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        }),
      rollback: () => {
        this.items.delete(txn.id);
        this.syncStore.delete(txn.id);
        if (txnSplits) {
          for (const split of txnSplits) {
            this.splits.delete(split.id);
            this.splitSyncStore.delete(split.id);
          }
        }
      },
      onOffline: () => {
        enqueue({
          id: crypto.randomUUID(),
          method: 'POST',
          path: '/api/transactions',
          body,
          timestamp: Date.now(),
        });
      },
    });
  }

  updateTransaction(id: string, patch: Partial<Transaction>): void {
    const existing = this.items.get(id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    const oldRecord = existing;

    void serverFirst({
      optimistic: () => {
        this.items.set(id, updated);
        this.syncStore.put(updated);
      },
      request: () =>
        fetch(`/api/transactions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(patch),
        }),
      rollback: () => {
        this.items.set(id, oldRecord);
        this.syncStore.put(oldRecord);
      },
      onOffline: () => {
        enqueue({
          id: crypto.randomUUID(),
          method: 'PATCH',
          path: `/api/transactions/${id}`,
          body: patch,
          timestamp: Date.now(),
        });
      },
    });
  }

  deleteTransaction(id: string): void {
    const existing = this.items.get(id);
    if (!existing) return;
    const txnSplits = this.splitsForTransaction(id);

    void serverFirst({
      optimistic: () => {
        for (const split of txnSplits) {
          this.splits.delete(split.id);
          this.splitSyncStore.delete(split.id);
        }
        this.items.delete(id);
        this.syncStore.delete(id);
      },
      request: () =>
        fetch(`/api/transactions/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        }),
      rollback: () => {
        this.items.set(id, existing);
        this.syncStore.put(existing);
        for (const split of txnSplits) {
          this.splits.set(split.id, split);
          this.splitSyncStore.put(split);
        }
      },
      onOffline: () => {
        enqueue({
          id: crypto.randomUUID(),
          method: 'DELETE',
          path: `/api/transactions/${id}`,
          body: null,
          timestamp: Date.now(),
        });
      },
    });
  }

  bulkAction(action: string, ids: string[], categoryId?: string): void {
    for (const id of ids) {
      const txn = this.items.get(id);
      if (!txn) continue;
      switch (action) {
        case 'clear': {
          const cleared = { ...txn, cleared: 1 as const };
          this.items.set(id, cleared);
          this.syncStore.put(cleared);
          break;
        }
        case 'unclear': {
          const uncleared = { ...txn, cleared: 0 as const };
          this.items.set(id, uncleared);
          this.syncStore.put(uncleared);
          break;
        }
        case 'categorize':
          if (categoryId) {
            const categorized = { ...txn, category_id: categoryId };
            this.items.set(id, categorized);
            this.syncStore.put(categorized);
          }
          break;
        case 'delete':
          this.items.delete(id);
          this.syncStore.delete(id);
          break;
      }
    }
    enqueue({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/api/transactions/bulk',
      body: { ids, action, category_id: categoryId },
      timestamp: Date.now(),
    });
  }

  toggleSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  clearSelection(): void {
    this.selectedIds.clear();
  }

  setFilters(filters: typeof this.filters): void {
    this.filters = filters;
  }

  clearFilters(): void {
    this.filters = {};
  }

  setEditing(id: string | null): void {
    this.editingId = id;
  }

  /** Load transactions from server: persist to IDB and update observable map */
  loadFromServer(transactions: Transaction[]): void {
    this.syncStore.replaceAll(transactions);
    runInAction(() => {
      this.items.clear();
      for (const record of transactions) {
        this.items.set(record.id, record);
      }
    });
  }

  /** Import data from file: persist to IDB and update observable map */
  importData(transactions: Transaction[]): void {
    this.syncStore.replaceAll(transactions);
    runInAction(() => {
      this.items.clear();
      for (const record of transactions) {
        this.items.set(record.id, record);
      }
    });
  }

  /** Import splits from file: persist to IDB and update observable map */
  importSplits(splitEntries: SplitEntry[]): void {
    this.splitSyncStore.replaceAll(splitEntries);
    runInAction(() => {
      this.splits.clear();
      for (const record of splitEntries) {
        this.splits.set(record.id, record);
      }
    });
  }
}
