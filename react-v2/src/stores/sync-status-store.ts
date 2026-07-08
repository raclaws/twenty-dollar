import { makeAutoObservable } from 'mobx';
import { pendingCount } from '@/sync';

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'error';

export interface SyncError {
  id: string;
  message: string;
  timestamp: number;
}

export class SyncStatusStore {
  status: SyncStatus = 'online';
  lastSyncAt: Date | null = null;
  errors: SyncError[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  get isOnline(): boolean {
    return this.status !== 'offline';
  }

  get hasPendingWrites(): boolean {
    return pendingCount() > 0;
  }

  get pendingWriteCount(): number {
    return pendingCount();
  }

  setStatus(status: SyncStatus): void {
    this.status = status;
  }

  setLastSyncAt(date: Date): void {
    this.lastSyncAt = date;
  }

  addError(message: string): void {
    this.errors.push({
      id: crypto.randomUUID(),
      message,
      timestamp: Date.now(),
    });
    // Keep last 20 errors
    if (this.errors.length > 20) {
      this.errors.shift();
    }
  }

  clearErrors(): void {
    this.errors = [];
  }

  goOnline(): void {
    this.status = 'online';
  }

  goOffline(): void {
    this.status = 'offline';
  }
}
