import { createSyncStore, createReactiveLayer, createSyncManager } from './sync-engine'
import type { SyncStore, ReactiveStore, SyncManager } from './sync-engine'
import { createRestAdapter } from './api'

export interface AppStore {
  raw: SyncStore
  reactive: ReactiveStore
  sync: SyncManager
}

const STORE_CONFIG = {
  name: 'twenty-dollar',
  tables: {
    accounts: {
      fields: { name: 'string', type: 'string', icon: 'string', sort_order: 'number', created_at: 'string', deleted_at: 'string' } as const,
      indexes: ['type'],
    },
    payees: {
      fields: { name: 'string', type: 'string', account_id: 'string', created_at: 'string' } as const,
      indexes: ['type', 'account_id'],
    },
    category_groups: {
      fields: { name: 'string', icon: 'string', sort_order: 'number' } as const,
      indexes: ['sort_order'],
    },
    categories: {
      fields: { group_id: 'string', name: 'string', icon: 'string', sort_order: 'number', target_type: 'string', target_amount: 'number', target_date: 'string' } as const,
      indexes: ['group_id'],
    },
    transactions: {
      fields: { account_id: 'string', payee_id: 'string', category_id: 'string', date: 'string', amount: 'number', memo: 'string', cleared: 'number', linked_id: 'string', created_at: 'string' } as const,
      indexes: ['account_id', 'payee_id', 'category_id', 'date', 'linked_id'],
    },
    split_entries: {
      fields: { transaction_id: 'string', category_id: 'string', amount: 'number', memo: 'string' } as const,
      indexes: ['transaction_id', 'category_id'],
    },
    assignments: {
      fields: { category_id: 'string', month: 'string', amount: 'number' } as const,
      indexes: ['category_id', 'month'],
    },
    schedules: {
      fields: { account_id: 'string', category_id: 'string', payee: 'string', amount: 'number', memo: 'string', frequency: 'string', next_due: 'string', end_date: 'string', auto_clear: 'number', paused: 'number', created_at: 'string' } as const,
      indexes: ['account_id', 'next_due'],
    },
  },
}

export async function initStore(): Promise<AppStore> {
  const raw = await createSyncStore(STORE_CONFIG)
  const reactive = createReactiveLayer(raw)

  const adapter = createRestAdapter('/api')

  const sync = createSyncManager({
    adapter,
    store: raw,
    tables: Object.keys(STORE_CONFIG.tables),
    reactive,
    onError: (err) => console.error('[sync]', err),
  })

  await sync.start()

  // Bootstrap: ensure every account has a corresponding payee record
  const accounts = await raw.getAll('accounts')
  const payees = await raw.getAll('payees')
  const accountPayeeIds = new Set(payees.filter(p => p.account_id).map(p => p.account_id as string))
  const now = new Date().toISOString()
  for (const acc of accounts) {
    if (!accountPayeeIds.has(acc.id as string)) {
      await raw.put('payees', {
        id: crypto.randomUUID(),
        name: acc.name as string,
        type: 'account',
        account_id: acc.id as string,
        created_at: now,
      })
    }
  }
  if (accounts.length > 0) reactive.notify('payees')

  // Seed demo data if truly fresh (no accounts AND no categories)
  const categories = await raw.getAll('categories')
  if (accounts.length === 0 && categories.length === 0) {
    await seedDemoData(raw, reactive)
  }

  return { raw, reactive, sync }
}

async function seedDemoData(raw: SyncStore, reactive: ReactiveStore) {
  const now = '2026-06-29T10:00:00.000Z'
  const uuid = () => crypto.randomUUID()

  // --- Accounts ---
  const checkingId = uuid()
  const savingsId = uuid()
  await raw.put('accounts', { id: checkingId, name: 'Main Checking', type: 'checking', sort_order: 0, created_at: now, deleted_at: null })
  await raw.put('accounts', { id: savingsId, name: 'Emergency Savings', type: 'savings', sort_order: 1, created_at: now, deleted_at: null })

  // Payees for accounts (transfer targets)
  const checkingPayeeId = uuid()
  const savingsPayeeId = uuid()
  await raw.put('payees', { id: checkingPayeeId, name: 'Main Checking', type: 'account', account_id: checkingId, created_at: now })
  await raw.put('payees', { id: savingsPayeeId, name: 'Emergency Savings', type: 'account', account_id: savingsId, created_at: now })

  // --- Payees (external) ---
  const payeeData = [
    'Employer Inc.', 'Landlord', 'Electric Co.', 'Water Utility', 'Internet Provider',
    'Grocery Mart', 'Coffee Shop', 'Gas Station', 'Restaurant XYZ', 'Netflix',
    'Spotify', 'Gym Membership', 'Insurance Co.', 'Phone Plan', 'Amazon',
    'Uber', 'Doctor Office', 'Pharmacy', 'Pet Store', 'Clothing Store',
  ]
  const payeeIds: Record<string, string> = {}
  for (const name of payeeData) {
    const id = uuid()
    payeeIds[name] = id
    await raw.put('payees', { id, name, type: 'external', account_id: null, created_at: now })
  }

  // --- Category Groups & Categories ---
  const groups: { name: string; icon: string; categories: { name: string; icon: string; target: number }[] }[] = [
    { name: 'Housing', icon: 'home', categories: [
      { name: 'Rent/Mortgage', icon: 'key', target: 1500000 },
      { name: 'Electricity', icon: 'zap', target: 150000 },
      { name: 'Water', icon: 'droplets', target: 50000 },
      { name: 'Internet', icon: 'wifi', target: 80000 },
    ]},
    { name: 'Transportation', icon: 'car', categories: [
      { name: 'Gas', icon: 'fuel', target: 200000 },
      { name: 'Car Insurance', icon: 'shield', target: 120000 },
      { name: 'Ride Share', icon: 'car', target: 100000 },
    ]},
    { name: 'Food', icon: 'utensils-crossed', categories: [
      { name: 'Groceries', icon: 'shopping-cart', target: 600000 },
      { name: 'Dining Out', icon: 'utensils-crossed', target: 300000 },
      { name: 'Coffee', icon: 'coffee', target: 80000 },
    ]},
    { name: 'Subscriptions', icon: 'tv', categories: [
      { name: 'Streaming', icon: 'tv', target: 30000 },
      { name: 'Music', icon: 'music', target: 15000 },
      { name: 'Gym', icon: 'dumbbell', target: 50000 },
    ]},
    { name: 'Health', icon: 'heart', categories: [
      { name: 'Insurance', icon: 'shield', target: 250000 },
      { name: 'Doctor/Pharmacy', icon: 'pill', target: 100000 },
    ]},
    { name: 'Personal', icon: 'shopping-bag', categories: [
      { name: 'Clothing', icon: 'shirt', target: 150000 },
      { name: 'Phone', icon: 'phone', target: 60000 },
      { name: 'Shopping', icon: 'shopping-bag', target: 200000 },
      { name: 'Pet Care', icon: 'heart', target: 80000 },
    ]},
    { name: 'Savings Goals', icon: 'piggy-bank', categories: [
      { name: 'Emergency Fund', icon: 'piggy-bank', target: 500000 },
      { name: 'Vacation', icon: 'plane', target: 300000 },
    ]},
  ]

  const categoryMap: Record<string, string> = {} // name → id
  let groupIdx = 0
  for (const g of groups) {
    const groupId = uuid()
    await raw.put('category_groups', { id: groupId, name: g.name, icon: g.icon, sort_order: groupIdx++ })
    let catIdx = 0
    for (const c of g.categories) {
      const catId = uuid()
      categoryMap[c.name] = catId
      await raw.put('categories', { id: catId, group_id: groupId, name: c.name, icon: c.icon, sort_order: catIdx++, target_type: 'monthly', target_amount: c.target, target_date: null })
    }
  }

  // --- Assignments (May 2026 — fully assigned, June 2026 — partially) ---
  // May: fully funded
  for (const g of groups) {
    for (const c of g.categories) {
      await raw.put('assignments', { id: uuid(), category_id: categoryMap[c.name], month: '2026-05', amount: c.target })
    }
  }
  // June: partially funded — leave some underfunded/unfunded
  const juneAssignments: Record<string, number> = {
    'Rent/Mortgage': 1500000, 'Electricity': 150000, 'Water': 50000, 'Internet': 80000,
    'Gas': 200000, 'Car Insurance': 120000, 'Ride Share': 50000,
    'Groceries': 600000, 'Dining Out': 200000, 'Coffee': 40000,
    'Streaming': 30000, 'Music': 15000, 'Gym': 50000,
    'Insurance': 250000, 'Doctor/Pharmacy': 0,
    'Clothing': 0, 'Phone': 60000, 'Shopping': 100000, 'Pet Care': 0,
    'Emergency Fund': 500000, 'Vacation': 0,
  }
  for (const [name, amount] of Object.entries(juneAssignments)) {
    if (amount > 0) {
      await raw.put('assignments', { id: uuid(), category_id: categoryMap[name], month: '2026-06', amount })
    }
  }

  // --- Transactions ---
  // Income: salary on 1st of each month into checking
  const salary = 5000000 // $50,000 / 10 = $5,000/mo in cents
  await raw.put('transactions', { id: uuid(), account_id: checkingId, payee_id: payeeIds['Employer Inc.'], category_id: null, date: '2026-05-01', amount: salary, memo: 'May Salary', cleared: 1, linked_id: null, created_at: now })
  await raw.put('transactions', { id: uuid(), account_id: checkingId, payee_id: payeeIds['Employer Inc.'], category_id: null, date: '2026-06-01', amount: salary, memo: 'June Salary', cleared: 1, linked_id: null, created_at: now })

  // May transactions (month closed — varied spending)
  const mayTxns: [string, string, string, number][] = [
    ['2026-05-01', 'Landlord', 'Rent/Mortgage', -1500000],
    ['2026-05-03', 'Electric Co.', 'Electricity', -145000],
    ['2026-05-03', 'Water Utility', 'Water', -48000],
    ['2026-05-05', 'Internet Provider', 'Internet', -79000],
    ['2026-05-06', 'Grocery Mart', 'Groceries', -125000],
    ['2026-05-08', 'Coffee Shop', 'Coffee', -8500],
    ['2026-05-09', 'Gas Station', 'Gas', -55000],
    ['2026-05-10', 'Netflix', 'Streaming', -15000],
    ['2026-05-10', 'Spotify', 'Music', -11000],
    ['2026-05-12', 'Restaurant XYZ', 'Dining Out', -45000],
    ['2026-05-13', 'Grocery Mart', 'Groceries', -98000],
    ['2026-05-15', 'Gym Membership', 'Gym', -50000],
    ['2026-05-15', 'Insurance Co.', 'Insurance', -250000],
    ['2026-05-16', 'Phone Plan', 'Phone', -55000],
    ['2026-05-18', 'Uber', 'Ride Share', -32000],
    ['2026-05-20', 'Grocery Mart', 'Groceries', -110000],
    ['2026-05-21', 'Coffee Shop', 'Coffee', -12000],
    ['2026-05-22', 'Gas Station', 'Gas', -48000],
    ['2026-05-24', 'Restaurant XYZ', 'Dining Out', -68000],
    ['2026-05-25', 'Amazon', 'Shopping', -85000],
    ['2026-05-27', 'Grocery Mart', 'Groceries', -135000],
    ['2026-05-28', 'Doctor Office', 'Doctor/Pharmacy', -75000],
    ['2026-05-29', 'Clothing Store', 'Clothing', -120000],
    ['2026-05-30', 'Pet Store', 'Pet Care', -45000],
  ]

  for (const [date, payee, cat, amount] of mayTxns) {
    await raw.put('transactions', { id: uuid(), account_id: checkingId, payee_id: payeeIds[payee], category_id: categoryMap[cat], date, amount, memo: null, cleared: 1, linked_id: null, created_at: now })
  }

  // June transactions (current month — 3rd week, some overspending)
  const juneTxns: [string, string, string, number][] = [
    ['2026-06-01', 'Landlord', 'Rent/Mortgage', -1500000],
    ['2026-06-02', 'Electric Co.', 'Electricity', -162000], // overspent
    ['2026-06-02', 'Water Utility', 'Water', -52000], // overspent
    ['2026-06-03', 'Internet Provider', 'Internet', -79000],
    ['2026-06-04', 'Grocery Mart', 'Groceries', -145000],
    ['2026-06-06', 'Coffee Shop', 'Coffee', -9500],
    ['2026-06-07', 'Gas Station', 'Gas', -62000],
    ['2026-06-08', 'Netflix', 'Streaming', -15000],
    ['2026-06-08', 'Spotify', 'Music', -11000],
    ['2026-06-09', 'Restaurant XYZ', 'Dining Out', -55000],
    ['2026-06-10', 'Grocery Mart', 'Groceries', -132000],
    ['2026-06-11', 'Uber', 'Ride Share', -28000],
    ['2026-06-12', 'Gym Membership', 'Gym', -50000],
    ['2026-06-13', 'Gas Station', 'Gas', -58000],
    ['2026-06-14', 'Restaurant XYZ', 'Dining Out', -72000],
    ['2026-06-15', 'Insurance Co.', 'Insurance', -250000],
    ['2026-06-16', 'Phone Plan', 'Phone', -55000],
    ['2026-06-17', 'Grocery Mart', 'Groceries', -118000],
    ['2026-06-18', 'Coffee Shop', 'Coffee', -15000],
    ['2026-06-19', 'Amazon', 'Shopping', -195000], // overspent
    ['2026-06-20', 'Restaurant XYZ', 'Dining Out', -88000], // overspent (total > 200000)
    ['2026-06-21', 'Uber', 'Ride Share', -35000], // overspent (total > 50000)
  ]

  for (const [date, payee, cat, amount] of juneTxns) {
    await raw.put('transactions', { id: uuid(), account_id: checkingId, payee_id: payeeIds[payee], category_id: categoryMap[cat], date, amount, memo: null, cleared: date < '2026-06-15' ? 1 : 0, linked_id: null, created_at: now })
  }

  // Transfer: checking → savings (June)
  const txferId1 = uuid()
  const txferId2 = uuid()
  await raw.put('transactions', { id: txferId1, account_id: checkingId, payee_id: savingsPayeeId, category_id: null, date: '2026-06-01', amount: -500000, memo: 'Emergency fund', cleared: 1, linked_id: txferId2, created_at: now })
  await raw.put('transactions', { id: txferId2, account_id: savingsId, payee_id: checkingPayeeId, category_id: null, date: '2026-06-01', amount: 500000, memo: 'Emergency fund', cleared: 1, linked_id: txferId1, created_at: now })

  // Also a May transfer
  const txferId3 = uuid()
  const txferId4 = uuid()
  await raw.put('transactions', { id: txferId3, account_id: checkingId, payee_id: savingsPayeeId, category_id: null, date: '2026-05-01', amount: -500000, memo: 'Monthly savings', cleared: 1, linked_id: txferId4, created_at: now })
  await raw.put('transactions', { id: txferId4, account_id: savingsId, payee_id: checkingPayeeId, category_id: null, date: '2026-05-01', amount: 500000, memo: 'Monthly savings', cleared: 1, linked_id: txferId3, created_at: now })

  // Notify all tables
  reactive.notify('accounts')
  reactive.notify('payees')
  reactive.notify('category_groups')
  reactive.notify('categories')
  reactive.notify('assignments')
  reactive.notify('transactions')
}
