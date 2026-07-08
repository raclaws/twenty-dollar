import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { ImportRule } from '@/types';
import { SyncStore, enqueue } from '@/sync';

export class ImportRuleStore {
  items = observable.map<string, ImportRule>();
  private syncStore: SyncStore<ImportRule>;

  constructor(syncStore: SyncStore<ImportRule>) {
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

  get rules(): Map<string, ImportRule> {
    return this.items;
  }

  get sortedRules(): ImportRule[] {
    return Array.from(this.items.values()).sort((a, b) => a.tokens.localeCompare(b.tokens));
  }

  matchRule(description: string): ImportRule | undefined {
    const lower = description.toLowerCase();
    // First matching rule wins (ordered by creation)
    const sorted = Array.from(this.items.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
    return sorted.find((r) => lower.includes(r.tokens.toLowerCase()));
  }

  createRule(rule: ImportRule): void {
    this.items.set(rule.id, rule);
    this.syncStore.put(rule);
    enqueue({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/api/import-rules',
      body: { id: rule.id, tokens: rule.tokens, payee_id: rule.payee_id, category_id: rule.category_id },
      timestamp: Date.now(),
    });
  }

  updateRule(id: string, patch: Partial<ImportRule>): void {
    const existing = this.items.get(id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    this.items.set(id, updated);
    this.syncStore.put(updated);
    enqueue({
      id: crypto.randomUUID(),
      method: 'PATCH',
      path: `/api/import-rules/${id}`,
      body: patch,
      timestamp: Date.now(),
    });
  }

  /** Load data from server: persist to IDB and update observable map */
  loadFromServer(rules: ImportRule[]): void {
    this.syncStore.replaceAll(rules);
    runInAction(() => {
      this.items.clear();
      for (const record of rules) {
        this.items.set(record.id, record);
      }
    });
  }

  /** Import data from file: persist to IDB and update observable map */
  importData(rules: ImportRule[]): void {
    this.syncStore.replaceAll(rules);
    runInAction(() => {
      this.items.clear();
      for (const record of rules) {
        this.items.set(record.id, record);
      }
    });
  }

  deleteRule(id: string): void {
    this.items.delete(id);
    this.syncStore.delete(id);
    enqueue({
      id: crypto.randomUUID(),
      method: 'DELETE',
      path: `/api/import-rules/${id}`,
      body: null,
      timestamp: Date.now(),
    });
  }
}
