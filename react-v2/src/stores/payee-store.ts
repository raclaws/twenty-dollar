import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { Payee } from '@/types';
import { SyncStore, enqueue } from '@/sync';

export class PayeeStore {
  items = observable.map<string, Payee>();
  private syncStore: SyncStore<Payee>;

  constructor(syncStore: SyncStore<Payee>) {
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

  get payees(): Map<string, Payee> {
    return this.items;
  }

  get sortedPayees(): Payee[] {
    return Array.from(this.items.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  get transferPayees(): Payee[] {
    return Array.from(this.items.values()).filter((p) => p.type === 'account');
  }

  getById(id: string): Payee | undefined {
    return this.items.get(id);
  }

  searchPayees(query: string): Payee[] {
    const lower = query.toLowerCase();
    return Array.from(this.items.values()).filter((p) => p.name.toLowerCase().includes(lower));
  }

  createPayee(payee: Payee): void {
    this.items.set(payee.id, payee);
    this.syncStore.put(payee);
    enqueue({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/api/payees',
      body: { id: payee.id, name: payee.name, type: payee.type, account_id: payee.account_id },
      timestamp: Date.now(),
    });
  }

  updatePayee(id: string, patch: Partial<Payee>): void {
    const existing = this.items.get(id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    this.items.set(id, updated);
    this.syncStore.put(updated);
    enqueue({
      id: crypto.randomUUID(),
      method: 'PATCH',
      path: `/api/payees/${id}`,
      body: patch,
      timestamp: Date.now(),
    });
  }

  /** Load data from server: persist to IDB and update observable map */
  loadFromServer(payees: Payee[]): void {
    this.syncStore.replaceAll(payees);
    runInAction(() => {
      this.items.clear();
      for (const record of payees) {
        this.items.set(record.id, record);
      }
    });
  }

  /** Import data from file: persist to IDB and update observable map */
  importData(payees: Payee[]): void {
    this.syncStore.replaceAll(payees);
    runInAction(() => {
      this.items.clear();
      for (const record of payees) {
        this.items.set(record.id, record);
      }
    });
  }

  deletePayee(id: string): void {
    this.items.delete(id);
    this.syncStore.delete(id);
    enqueue({
      id: crypto.randomUUID(),
      method: 'DELETE',
      path: `/api/payees/${id}`,
      body: null,
      timestamp: Date.now(),
    });
  }
}
