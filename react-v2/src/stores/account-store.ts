import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { Account } from '@/types';
import { SyncStore, enqueue } from '@/sync';

export class AccountStore {
  items = observable.map<string, Account>();
  private syncStore: SyncStore<Account>;

  constructor(syncStore: SyncStore<Account>) {
    this.syncStore = syncStore;
    makeAutoObservable(this, {
      items: false,
    });
  }

  /** Populate observable map from IDB-hydrated syncStore */
  hydrate(): void {
    const all = this.syncStore.getAll();
    runInAction(() => {
      this.items.clear();
      for (const record of all) {
        this.items.set(record.id, record);
      }
    });
  }

  get accounts(): Map<string, Account> {
    return this.items;
  }

  get sortedAccounts(): Account[] {
    return Array.from(this.items.values())
      .filter((a) => !a.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  get checkingAccounts(): Account[] {
    return this.sortedAccounts.filter((a) => a.type === 'checking');
  }

  get savingsAccounts(): Account[] {
    return this.sortedAccounts.filter((a) => a.type === 'savings');
  }

  get creditAccounts(): Account[] {
    return this.sortedAccounts.filter((a) => a.type === 'credit');
  }

  get cashAccounts(): Account[] {
    return this.sortedAccounts.filter((a) => a.type === 'cash');
  }

  get netWorth(): number {
    // Placeholder — actual balance computation requires TransactionStore
    return 0;
  }

  getById(id: string): Account | undefined {
    return this.items.get(id);
  }

  createAccount(account: Account): void {
    this.items.set(account.id, account);
    this.syncStore.put(account);
    enqueue({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/api/accounts',
      body: { id: account.id, name: account.name, type: account.type, sort_order: account.sort_order },
      timestamp: Date.now(),
    });
  }

  updateAccount(id: string, patch: Partial<Account>): void {
    const existing = this.items.get(id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    this.items.set(id, updated);
    this.syncStore.put(updated);
    enqueue({
      id: crypto.randomUUID(),
      method: 'PATCH',
      path: `/api/accounts/${id}`,
      body: patch,
      timestamp: Date.now(),
    });
  }

  deleteAccount(id: string): void {
    const existing = this.items.get(id);
    if (!existing) return;
    const updated = { ...existing, deleted_at: new Date().toISOString() };
    this.items.set(id, updated);
    this.syncStore.put(updated);
    enqueue({
      id: crypto.randomUUID(),
      method: 'DELETE',
      path: `/api/accounts/${id}`,
      body: null,
      timestamp: Date.now(),
    });
  }

  /** Load data from server: persist to IDB and update observable map */
  loadFromServer(accounts: Account[]): void {
    this.syncStore.replaceAll(accounts);
    runInAction(() => {
      this.items.clear();
      for (const record of accounts) {
        this.items.set(record.id, record);
      }
    });
  }

  /** Import data from file: persist to IDB and update observable map */
  importData(accounts: Account[]): void {
    this.syncStore.replaceAll(accounts);
    runInAction(() => {
      this.items.clear();
      for (const record of accounts) {
        this.items.set(record.id, record);
      }
    });
  }

  reorderAccounts(orderedIds: string[]): void {
    orderedIds.forEach((id, index) => {
      const account = this.items.get(id);
      if (account) {
        const updated = { ...account, sort_order: index };
        this.items.set(id, updated);
        this.syncStore.put(updated);
        enqueue({
          id: crypto.randomUUID(),
          method: 'PATCH',
          path: `/api/accounts/${id}`,
          body: { sort_order: index },
          timestamp: Date.now(),
        });
      }
    });
  }
}
