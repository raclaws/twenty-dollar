import { describe, it, expect } from 'vitest'
import { computeBudget } from '../src/lib/budget-engine'

const groups = [
  { id: 'g1', name: 'Housing', sort_order: 0 },
  { id: 'g2', name: 'Food', sort_order: 1 },
]

const categories = [
  { id: 'cat1', group_id: 'g1', name: 'Rent', sort_order: 0 },
  { id: 'cat2', group_id: 'g1', name: 'Utilities', sort_order: 1 },
  { id: 'cat3', group_id: 'g2', name: 'Groceries', sort_order: 0 },
]

describe('computeBudget', () => {
  it('computes RTA as total income minus total assigned', () => {
    const transactions = [
      { id: 'tx1', account_id: 'acc1', category_id: null, date: '2026-06-01', amount: 300000, payee: 'Employer' },
    ]
    const assignments = [
      { id: 'a1', category_id: 'cat1', month: '2026-06', amount: 180000 },
      { id: 'a2', category_id: 'cat2', month: '2026-06', amount: 20000 },
    ]

    const result = computeBudget(groups, categories, transactions, [], assignments, '2026-06')

    expect(result.rta).toBe(100000) // 3000 - 1800 - 200 = 1000 ($10.00 in cents)
  })

  it('computes activity from transactions in the month', () => {
    const transactions = [
      { id: 'tx1', account_id: 'acc1', category_id: null, date: '2026-06-01', amount: 500000, payee: 'Employer' },
      { id: 'tx2', account_id: 'acc1', category_id: 'cat1', date: '2026-06-05', amount: -180000, payee: 'Landlord' },
      { id: 'tx3', account_id: 'acc1', category_id: 'cat3', date: '2026-06-10', amount: -8750, payee: 'Store' },
    ]
    const assignments = [
      { id: 'a1', category_id: 'cat1', month: '2026-06', amount: 180000 },
      { id: 'a2', category_id: 'cat3', month: '2026-06', amount: 40000 },
    ]

    const result = computeBudget(groups, categories, transactions, [], assignments, '2026-06')

    const rent = result.categoryMap.get('cat1')!
    expect(rent.assigned).toBe(180000)
    expect(rent.activity).toBe(-180000)
    expect(rent.available).toBe(0) // 1800 assigned + (-1800 activity) = 0

    const groceries = result.categoryMap.get('cat3')!
    expect(groceries.assigned).toBe(40000)
    expect(groceries.activity).toBe(-8750)
    expect(groceries.available).toBe(31250) // 400 - 87.50 = 312.50
  })

  it('includes split entries in activity', () => {
    const transactions = [
      { id: 'tx1', account_id: 'acc1', category_id: null, date: '2026-06-01', amount: 500000, payee: 'Employer' },
      { id: 'tx2', account_id: 'acc1', category_id: null, date: '2026-06-15', amount: -15000, payee: 'Target' },
    ]
    const splits = [
      { id: 's1', transaction_id: 'tx2', category_id: 'cat3', amount: -10000, memo: 'food' },
      { id: 's2', transaction_id: 'tx2', category_id: 'cat2', amount: -5000, memo: 'cleaning' },
    ]
    const assignments = [
      { id: 'a1', category_id: 'cat3', month: '2026-06', amount: 40000 },
      { id: 'a2', category_id: 'cat2', month: '2026-06', amount: 20000 },
    ]

    const result = computeBudget(groups, categories, transactions, splits, assignments, '2026-06')

    const groceries = result.categoryMap.get('cat3')!
    expect(groceries.activity).toBe(-10000)
    expect(groceries.available).toBe(30000) // 400 - 100 = 300

    const utilities = result.categoryMap.get('cat2')!
    expect(utilities.activity).toBe(-5000)
    expect(utilities.available).toBe(15000) // 200 - 50 = 150
  })

  it('computes available as cumulative (across months)', () => {
    const transactions = [
      { id: 'tx1', account_id: 'acc1', category_id: null, date: '2026-05-01', amount: 500000, payee: 'Employer' },
      { id: 'tx2', account_id: 'acc1', category_id: 'cat3', date: '2026-05-10', amount: -20000, payee: 'Store' },
      { id: 'tx3', account_id: 'acc1', category_id: null, date: '2026-06-01', amount: 500000, payee: 'Employer' },
      { id: 'tx4', account_id: 'acc1', category_id: 'cat3', date: '2026-06-10', amount: -15000, payee: 'Store' },
    ]
    const assignments = [
      { id: 'a1', category_id: 'cat3', month: '2026-05', amount: 40000 },
      { id: 'a2', category_id: 'cat3', month: '2026-06', amount: 40000 },
    ]

    const result = computeBudget(groups, categories, transactions, [], assignments, '2026-06')

    const groceries = result.categoryMap.get('cat3')!
    // cumulative assigned: 400 + 400 = 800
    // cumulative activity: -200 + (-150) = -350
    // available: 800 - 350 = 450
    expect(groceries.available).toBe(45000)
    // this month only
    expect(groceries.assigned).toBe(40000)
    expect(groceries.activity).toBe(-15000)
  })

  it('returns zero for categories with no data', () => {
    const transactions = [
      { id: 'tx1', account_id: 'acc1', category_id: null, date: '2026-06-01', amount: 300000, payee: 'Employer' },
    ]

    const result = computeBudget(groups, categories, transactions, [], [], '2026-06')

    expect(result.rta).toBe(300000)
    const rent = result.categoryMap.get('cat1')!
    expect(rent.assigned).toBe(0)
    expect(rent.activity).toBe(0)
    expect(rent.available).toBe(0)
  })

  it('groups are ordered by sort_order', () => {
    const result = computeBudget(groups, categories, [], [], [], '2026-06')

    expect(result.groups[0].groupName).toBe('Housing')
    expect(result.groups[1].groupName).toBe('Food')
    expect(result.groups[0].categories[0].categoryName).toBe('Rent')
    expect(result.groups[0].categories[1].categoryName).toBe('Utilities')
  })

  it('does not double-count split transactions in activity', () => {
    const transactions = [
      { id: 'tx1', account_id: 'acc1', category_id: null, date: '2026-06-01', amount: 500000, payee: 'Employer' },
      { id: 'tx2', account_id: 'acc1', category_id: 'cat3', date: '2026-06-15', amount: -15600, payee: 'Target' },
    ]
    const splits = [
      { id: 's1', transaction_id: 'tx2', category_id: 'cat3', amount: -8900, memo: 'food' },
      { id: 's2', transaction_id: 'tx2', category_id: 'cat2', amount: -6700, memo: 'cleaning' },
    ]
    const assignments = [
      { id: 'a1', category_id: 'cat3', month: '2026-06', amount: 40000 },
      { id: 'a2', category_id: 'cat2', month: '2026-06', amount: 20000 },
    ]

    const result = computeBudget(groups, categories, transactions, splits, assignments, '2026-06')

    const groceries = result.categoryMap.get('cat3')!
    expect(groceries.activity).toBe(-8900)
    expect(groceries.available).toBe(31100)

    const utilities = result.categoryMap.get('cat2')!
    expect(utilities.activity).toBe(-6700)
    expect(utilities.available).toBe(13300)
  })

  it('negative RTA when over-assigned', () => {
    const transactions = [
      { id: 'tx1', account_id: 'acc1', category_id: null, date: '2026-06-01', amount: 100000, payee: 'Employer' },
    ]
    const assignments = [
      { id: 'a1', category_id: 'cat1', month: '2026-06', amount: 150000 },
    ]

    const result = computeBudget(groups, categories, transactions, [], assignments, '2026-06')

    expect(result.rta).toBe(-50000)
  })
})
