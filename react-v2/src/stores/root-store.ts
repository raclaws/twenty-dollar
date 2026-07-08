import type {
  Account,
  Payee,
  CategoryGroup,
  Category,
  Transaction,
  SplitEntry,
  Assignment,
  Schedule,
  ImportRule,
  MonthLock,
} from '@/types';
import { SyncStore, hydrateQueue, registerLifecycleHandlers, flush } from '@/sync';
import { makeAutoObservable, runInAction } from 'mobx';
import { AccountStore } from './account-store';
import { PayeeStore } from './payee-store';
import { CategoryStore } from './category-store';
import { TransactionStore } from './transaction-store';
import { BudgetStore } from './budget-store';
import { ScheduleStore } from './schedule-store';
import { ImportRuleStore } from './import-rule-store';
import { UIStore } from './ui-store';
import { UndoStore } from './undo-store';
import { SyncStatusStore } from './sync-status-store';
import { AuthStore } from './auth-store';

// SyncStore instances (framework-agnostic)
const accountSyncStore = new SyncStore<Account>('accounts');
const payeeSyncStore = new SyncStore<Payee>('payees');
const groupSyncStore = new SyncStore<CategoryGroup>('category_groups');
const categorySyncStore = new SyncStore<Category>('categories');
const transactionSyncStore = new SyncStore<Transaction>('transactions');
const splitSyncStore = new SyncStore<SplitEntry>('split_entries');
const assignmentSyncStore = new SyncStore<Assignment>('assignments');
const scheduleSyncStore = new SyncStore<Schedule>('schedules');
const importRuleSyncStore = new SyncStore<ImportRule>('import_rules');
const monthLockSyncStore = new SyncStore<MonthLock>('month_locks', 'month');

// MobX domain stores
export const accountStore = new AccountStore(accountSyncStore);
export const payeeStore = new PayeeStore(payeeSyncStore);
export const categoryStore = new CategoryStore(groupSyncStore, categorySyncStore);
export const transactionStore = new TransactionStore(transactionSyncStore, splitSyncStore);
export const budgetStore = new BudgetStore(assignmentSyncStore, monthLockSyncStore);
export const scheduleStore = new ScheduleStore(scheduleSyncStore);
export const importRuleStore = new ImportRuleStore(importRuleSyncStore);
export const uiStore = new UIStore();
export const undoStore = new UndoStore();
export const syncStatusStore = new SyncStatusStore();
export const authStore = new AuthStore();

export interface RootStore {
  accountStore: AccountStore;
  payeeStore: PayeeStore;
  categoryStore: CategoryStore;
  transactionStore: TransactionStore;
  budgetStore: BudgetStore;
  scheduleStore: ScheduleStore;
  importRuleStore: ImportRuleStore;
  uiStore: UIStore;
  undoStore: UndoStore;
  syncStatusStore: SyncStatusStore;
  authStore: AuthStore;
  isHydrating: boolean;
  hydrateFromServer(): Promise<void>;
}

class RootStoreImpl implements RootStore {
  accountStore = accountStore;
  payeeStore = payeeStore;
  categoryStore = categoryStore;
  transactionStore = transactionStore;
  budgetStore = budgetStore;
  scheduleStore = scheduleStore;
  importRuleStore = importRuleStore;
  uiStore = uiStore;
  undoStore = undoStore;
  syncStatusStore = syncStatusStore;
  authStore = authStore;
  isHydrating = true;

  constructor() {
    makeAutoObservable(this, {
      accountStore: false,
      payeeStore: false,
      categoryStore: false,
      transactionStore: false,
      budgetStore: false,
      scheduleStore: false,
      importRuleStore: false,
      uiStore: false,
      undoStore: false,
      syncStatusStore: false,
      authStore: false,
    });
  }

  async hydrateFromServer(): Promise<void> {
    try {
      const [accountsRes, transactionsRes, categoriesRes, payeesRes, schedulesRes, importRulesRes, assignmentsRes] =
        await Promise.all([
          fetch('/api/accounts', { credentials: 'include' }),
          fetch('/api/transactions', { credentials: 'include' }),
          fetch('/api/categories', { credentials: 'include' }),
          fetch('/api/payees', { credentials: 'include' }),
          fetch('/api/schedules', { credentials: 'include' }),
          fetch('/api/import-rules', { credentials: 'include' }),
          fetch('/api/budget/assignments', { credentials: 'include' }),
        ]);

      if (accountsRes.ok) {
        const data = await accountsRes.json();
        this.accountStore.loadFromServer(Array.isArray(data) ? data : data.data || []);
      }
      if (transactionsRes.ok) {
        const data = await transactionsRes.json();
        this.transactionStore.loadFromServer(Array.isArray(data) ? data : data.data || []);
      }
      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        this.categoryStore.loadFromServer(Array.isArray(data) ? data : data.data || []);
      }
      if (payeesRes.ok) {
        const data = await payeesRes.json();
        this.payeeStore.loadFromServer(Array.isArray(data) ? data : data.data || []);
      }
      if (schedulesRes.ok) {
        const data = await schedulesRes.json();
        this.scheduleStore.loadFromServer(Array.isArray(data) ? data : data.data || []);
      }
      if (importRulesRes.ok) {
        const data = await importRulesRes.json();
        this.importRuleStore.loadFromServer(Array.isArray(data) ? data : data.data || []);
      }
      if (assignmentsRes.ok) {
        const data = await assignmentsRes.json();
        this.budgetStore.loadFromServer(Array.isArray(data) ? data : data.data || []);
      }

      // Auto-generate scheduled transactions
      await fetch('/api/schedules/generate', { method: 'POST', credentials: 'include' });
      // Re-fetch transactions after schedule generation
      const txnRefresh = await fetch('/api/transactions', { credentials: 'include' });
      if (txnRefresh.ok) {
        const data = await txnRefresh.json();
        this.transactionStore.loadFromServer(Array.isArray(data) ? data : data.data || []);
      }
    } catch (err) {
      console.error('[RootStore] hydrateFromServer failed:', err);
    } finally {
      runInAction(() => {
        this.isHydrating = false;
      });
    }
  }
}

export const rootStore: RootStore = new RootStoreImpl();

/** Hydrate observable maps from IDB data */
function hydrateObservableMaps(): void {
  accountStore.hydrate();
  payeeStore.hydrate();
  categoryStore.hydrate();
  transactionStore.hydrate();
  budgetStore.hydrate();
  scheduleStore.hydrate();
  importRuleStore.hydrate();
}

/** Initialize: hydrate all stores from IDB, set up lifecycle handlers */
export async function initializeStores(): Promise<void> {
  // Hydrate sync stores from IDB
  await Promise.all([
    accountSyncStore.hydrate(),
    payeeSyncStore.hydrate(),
    groupSyncStore.hydrate(),
    categorySyncStore.hydrate(),
    transactionSyncStore.hydrate(),
    splitSyncStore.hydrate(),
    assignmentSyncStore.hydrate(),
    scheduleSyncStore.hydrate(),
    importRuleSyncStore.hydrate(),
    monthLockSyncStore.hydrate(),
    hydrateQueue(),
  ]);

  // Populate observable maps from IDB-hydrated sync stores
  hydrateObservableMaps();

  // Register lifecycle handlers
  registerLifecycleHandlers({
    onNetworkChange: (status) => {
      syncStatusStore.setStatus(status);
      uiStore.setNetworkStatus(status);
      if (status === 'online') {
        flush();
      }
    },
    onRehydrate: async () => {
      await Promise.all([
        accountSyncStore.hydrate(),
        payeeSyncStore.hydrate(),
        groupSyncStore.hydrate(),
        categorySyncStore.hydrate(),
        transactionSyncStore.hydrate(),
        splitSyncStore.hydrate(),
        assignmentSyncStore.hydrate(),
        scheduleSyncStore.hydrate(),
        importRuleSyncStore.hydrate(),
        monthLockSyncStore.hydrate(),
      ]);
      // Re-populate observable maps after rehydration
      hydrateObservableMaps();
    },
  });

  // If authenticated, hydrate from server (fresh login or new device)
  if (authStore.isAuthenticated) {
    await rootStore.hydrateFromServer();
  } else {
    runInAction(() => {
      (rootStore as RootStoreImpl).isHydrating = false;
    });
  }

  // Flush any pending mutations
  flush();
}
