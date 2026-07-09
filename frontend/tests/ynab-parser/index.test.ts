import { describe, it, expect } from 'vitest'
import { parseYnabExport, parseRegister, parsePlan } from '../../src/lib/ynab-parser/index'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const REGISTER = readFileSync(
  resolve('C:/Users/User/Downloads/YNAB Export - raka f s Plan as of 2026-07-08 22-49/raka f s Plan as of 2026-07-08 22-49 - Register.tsv'),
  'utf-8'
)
const PLAN = readFileSync(
  resolve('C:/Users/User/Downloads/YNAB Export - raka f s Plan as of 2026-07-08 22-49/raka f s Plan as of 2026-07-08 22-49 - Plan.tsv'),
  'utf-8'
)

describe('ynab-parser', () => {
  const result = parseYnabExport(REGISTER, PLAN)

  it('extracts all accounts', () => {
    const names = result.accounts.map(a => a.name).sort()
    expect(names).toEqual(['BCA', 'Contabo Top-Up', 'GP', 'blu', 'cash'])
  })

  it('infers account types', () => {
    const map = Object.fromEntries(result.accounts.map(a => [a.name, a.account_type]))
    expect(map['BCA']).toBe('checking')
    expect(map['blu']).toBe('checking')
    expect(map['cash']).toBe('cash')
    expect(map['GP']).toBe('credit')
    expect(map['Contabo Top-Up']).toBe('checking')
  })

  it('extracts category groups', () => {
    const names = result.category_groups.map(g => g.name).sort()
    expect(names).toContain('Bills')
    expect(names).toContain('Needs')
    expect(names).toContain('Wants')
    expect(names).toContain('P2P Debts and Credits')
    expect(names).not.toContain('Inflow')
    expect(names).not.toContain('Credit Card Payments')
  })

  it('extracts categories within groups', () => {
    const needs = result.category_groups.find(g => g.name === 'Needs')!
    expect(needs.categories).toContain('Food')
    expect(needs.categories).toContain('☕️ coffee')
    expect(needs.categories).toContain('🚬 cigarettes ')
  })

  it('extracts payees (no transfer payees, no system payees)', () => {
    const names = result.payees.map(p => p.name)
    expect(names).toContain('Vincent')
    expect(names).toContain('mei')
    expect(names).toContain('insignia')
    expect(names).not.toContain('Transfer : blu')
    expect(names).not.toContain('Starting Balance')
    expect(names).not.toContain('Reconciliation Balance Adjustment')
  })

  it('parses amounts as cents (×100)', () => {
    // Vincent rent = Rp1700000 outflow → -170000000 cents
    const rent = result.transactions.find(t => t.payee === 'Vincent' && t.date === '2026-08-01')
    expect(rent).toBeDefined()
    expect(rent!.amount).toBe(-170000000)
  })

  it('parses income correctly (positive, no category)', () => {
    const salary = result.transactions.find(t => t.payee === 'insignia' && t.date === '2026-07-28')
    expect(salary).toBeDefined()
    expect(salary!.amount).toBe(970000000)
    expect(salary!.category).toBeNull()
  })

  it('detects transfers', () => {
    expect(result.transfers.length).toBeGreaterThan(0)
    const tf = result.transfers.find(t => t.from_account === 'BCA' && t.to_account === 'blu' && t.date === '2026-06-16')
    expect(tf).toBeDefined()
    expect(tf!.amount).toBe(10000000) // Rp100000 × 100
  })

  it('skips zero-amount transfers', () => {
    const zeroTransfers = result.transfers.filter(t => t.amount === 0)
    expect(zeroTransfers).toHaveLength(0)
  })

  it('handles splits', () => {
    // Row 78-79: Split (1/2) cigarettes Rp37000 + Split (2/2) Food Rp14000
    const split = result.transactions.find(t =>
      t.date === '2026-06-06' && t.splits && t.splits.length === 2
    )
    expect(split).toBeDefined()
    expect(split!.amount).toBe(-5100000) // -(37000+14000) × 100
    expect(split!.splits![0].amount).toBe(-3700000)
    expect(split!.splits![1].amount).toBe(-1400000)
  })

  it('parses cleared status', () => {
    const uncleared = result.transactions.find(t => t.payee === 'Vincent' && t.date === '2026-08-01')
    expect(uncleared!.cleared).toBe(false)

    const reconciled = result.transactions.find(t => t.date === '2026-06-17' && t.amount === -3550000)
    expect(reconciled).toBeDefined()
    expect(reconciled!.cleared).toBe(true)
  })

  it('parses plan assignments', () => {
    expect(result.assignments.length).toBeGreaterThan(0)
    const rent = result.assignments.find(a => a.category === '🏠 Rent' && a.month === '2026-06')
    expect(rent).toBeDefined()
    expect(rent!.amount).toBe(176000000) // Rp1760000 × 100
  })

  it('skips zero-assigned plan rows', () => {
    const zeros = result.assignments.filter(a => a.amount === 0)
    expect(zeros).toHaveLength(0)
  })

  it('handles negative assignments', () => {
    // Wedding -Rp2500000 in May
    const wedding = result.assignments.find(a => a.category === '💍 Wedding' && a.month === '2026-05')
    expect(wedding).toBeDefined()
    expect(wedding!.amount).toBe(-250000000)
  })

  it('parses plan month format', () => {
    const months = [...new Set(result.assignments.map(a => a.month))].sort()
    expect(months).toContain('2026-04')
    expect(months).toContain('2026-05')
    expect(months).toContain('2026-06')
  })
})
