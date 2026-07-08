import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { Schedule } from '@/types';
import { SyncStore, enqueue } from '@/sync';

export class ScheduleStore {
  items = observable.map<string, Schedule>();
  private syncStore: SyncStore<Schedule>;

  constructor(syncStore: SyncStore<Schedule>) {
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

  get schedules(): Map<string, Schedule> {
    return this.items;
  }

  get sortedSchedules(): Schedule[] {
    return Array.from(this.items.values()).sort((a, b) => a.next_due.localeCompare(b.next_due));
  }

  get dueSchedules(): Schedule[] {
    const today = new Date().toISOString().slice(0, 10);
    return Array.from(this.items.values()).filter((s) => !s.paused && s.next_due <= today);
  }

  get overdueSchedules(): Schedule[] {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return Array.from(this.items.values()).filter((s) => !s.paused && s.next_due < yesterday);
  }

  schedulesForAccount(accountId: string): Schedule[] {
    return Array.from(this.items.values()).filter((s) => s.account_id === accountId);
  }

  getById(id: string): Schedule | undefined {
    return this.items.get(id);
  }

  createSchedule(schedule: Schedule): void {
    this.items.set(schedule.id, schedule);
    this.syncStore.put(schedule);
    enqueue({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/api/schedules',
      body: {
        id: schedule.id,
        account_id: schedule.account_id,
        payee_id: schedule.payee_id,
        category_id: schedule.category_id,
        amount: schedule.amount,
        memo: schedule.memo,
        frequency: schedule.frequency,
        start_date: schedule.start_date,
        end_date: schedule.end_date,
      },
      timestamp: Date.now(),
    });
  }

  updateSchedule(id: string, patch: Partial<Schedule>): void {
    const existing = this.items.get(id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    this.items.set(id, updated);
    this.syncStore.put(updated);
    enqueue({
      id: crypto.randomUUID(),
      method: 'PATCH',
      path: `/api/schedules/${id}`,
      body: patch,
      timestamp: Date.now(),
    });
  }

  /** Load data from server: persist to IDB and update observable map */
  loadFromServer(schedules: Schedule[]): void {
    this.syncStore.replaceAll(schedules);
    runInAction(() => {
      this.items.clear();
      for (const record of schedules) {
        this.items.set(record.id, record);
      }
    });
  }

  /** Import data from file: persist to IDB and update observable map */
  importData(schedules: Schedule[]): void {
    this.syncStore.replaceAll(schedules);
    runInAction(() => {
      this.items.clear();
      for (const record of schedules) {
        this.items.set(record.id, record);
      }
    });
  }

  deleteSchedule(id: string): void {
    this.items.delete(id);
    this.syncStore.delete(id);
    enqueue({
      id: crypto.randomUUID(),
      method: 'DELETE',
      path: `/api/schedules/${id}`,
      body: null,
      timestamp: Date.now(),
    });
  }

  togglePause(id: string): void {
    const s = this.items.get(id);
    if (!s) return;
    this.updateSchedule(id, { paused: s.paused ? 0 : 1 });
  }
}
