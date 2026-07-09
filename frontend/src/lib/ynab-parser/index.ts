export interface YnabAccount {
  name: string
  account_type: 'checking' | 'savings' | 'cash' | 'credit'
}

export interface YnabCategoryGroup {
  name: string
  categories: string[]
}

export interface YnabPayee {
  name: string
}

export interface YnabTransaction {
  account: string
  date: string
  payee: string | null
  category_group: string | null
  category: string | null
  amount: number
  memo: string | null
  cleared: boolean
  splits?: { category_group: string | null; category: string | null; amount: number; memo: string | null }[]
}

export interface YnabTransfer {
  from_account: string
  to_account: string
  date: string
  amount: number
  memo: string | null
  cleared: boolean
}

export interface YnabAssignment {
  category_group: string
  category: string
  month: string
  amount: number
}

export interface YnabImportResult {
  accounts: YnabAccount[]
  category_groups: YnabCategoryGroup[]
  payees: YnabPayee[]
  transactions: YnabTransaction[]
  transfers: YnabTransfer[]
  assignments: YnabAssignment[]
}

const ACCOUNT_TYPE_MAP: Record<string, 'checking' | 'savings' | 'cash' | 'credit'> = {
  cash: 'cash',
}

const CREDIT_CARD_ACCOUNTS = new Set<string>()

const SKIP_PAYEES = new Set(['Starting Balance', 'Reconciliation Balance Adjustment'])
const SKIP_CATEGORIES = new Set(['Ready to Assign'])

function parseAmount(s: string): number {
  const cleaned = s.replace(/[",\s]/g, '')
  if (cleaned === '' || cleaned === 'Rp0' || cleaned === '-Rp0') return 0
  let val: number
  if (cleaned.startsWith('-Rp')) {
    val = -parseInt(cleaned.slice(3), 10)
  } else if (cleaned.startsWith('Rp')) {
    val = parseInt(cleaned.slice(2), 10)
  } else {
    val = parseInt(cleaned, 10) || 0
  }
  return val * 100
}

function parseDate(s: string): string {
  const [d, m, y] = s.split('/')
  return `${y}-${m}-${d}`
}

function parseMonth(s: string): string {
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  }
  const [mon, year] = s.split(' ')
  return `${year}-${months[mon]}`
}

function parseTsv(text: string): string[][] {
  const lines = text.replace(/\r/g, '').trim().split('\n')
  return lines.map(line =>
    line.split('\t').map(cell => cell.replace(/^"|"$/g, ''))
  )
}

function detectCreditAccounts(planRows: string[][]): void {
  for (const row of planRows) {
    const group = row[2]
    const category = row[3]
    if (group === 'Credit Card Payments' && category) {
      CREDIT_CARD_ACCOUNTS.add(category)
    }
  }
}

function inferAccountType(name: string): 'checking' | 'savings' | 'cash' | 'credit' {
  const lower = name.toLowerCase()
  if (ACCOUNT_TYPE_MAP[lower]) return ACCOUNT_TYPE_MAP[lower]
  if (CREDIT_CARD_ACCOUNTS.has(name)) return 'credit'
  return 'checking'
}

export function parseRegister(text: string): {
  accounts: YnabAccount[]
  category_groups: YnabCategoryGroup[]
  payees: YnabPayee[]
  transactions: YnabTransaction[]
  transfers: YnabTransfer[]
} {
  const rows = parseTsv(text)
  const header = rows[0]
  const data = rows.slice(1)

  const col = (name: string) => header.indexOf(name)
  const iAccount = col('Account')
  const iDate = col('Date')
  const iPayee = col('Payee')
  const iCategoryGroup = col('Category Group')
  const iCategory = col('Category')
  const iMemo = col('Memo')
  const iOutflow = col('Outflow')
  const iInflow = col('Inflow')
  const iCleared = col('Cleared')

  const accountSet = new Set<string>()
  const groupMap = new Map<string, Set<string>>()
  const payeeSet = new Set<string>()
  const transactions: YnabTransaction[] = []
  const transferPairs: Map<string, { from_account: string; to_account: string; date: string; amount: number; memo: string | null; cleared: boolean }> = new Map()

  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    const account = row[iAccount]
    const date = parseDate(row[iDate])
    const payee = row[iPayee] || null
    const categoryGroup = row[iCategoryGroup] || null
    const category = row[iCategory] || null
    const memo = row[iMemo] || null
    const outflow = parseAmount(row[iOutflow])
    const inflow = parseAmount(row[iInflow])
    const cleared = row[iCleared] === 'Reconciled' || row[iCleared] === 'Cleared'

    accountSet.add(account)

    if (SKIP_PAYEES.has(payee || '')) continue

    const amount = inflow > 0 ? inflow : -outflow

    // Transfer detection
    if (payee && payee.startsWith('Transfer : ')) {
      const otherAccount = payee.slice('Transfer : '.length)
      // Skip zero-amount transfers
      if (amount === 0) continue

      if (outflow > 0) {
        const key = `${date}|${account}|${otherAccount}|${outflow}`
        transferPairs.set(key, { from_account: account, to_account: otherAccount, date, amount: outflow, memo, cleared })
      }
      // Inflow side is the matching pair — skip to avoid duplication
      continue
    }

    // Collect category groups
    if (categoryGroup && category && !SKIP_CATEGORIES.has(category)) {
      if (!groupMap.has(categoryGroup)) groupMap.set(categoryGroup, new Set())
      groupMap.get(categoryGroup)!.add(category)
    }

    // Collect payees
    if (payee) payeeSet.add(payee)

    // Split detection
    const splitMatch = memo?.match(/^Split \((\d+)\/(\d+)\)\s*$/)
    if (splitMatch && splitMatch[1] === '1') {
      const total = parseInt(splitMatch[2], 10)
      const splits: YnabTransaction['splits'] = []
      splits.push({ category_group: categoryGroup, category, amount, memo: null })

      for (let j = 1; j < total && (i + j) < data.length; j++) {
        const sRow = data[i + j]
        const sMemo = sRow[iMemo] || null
        const sMatch = sMemo?.match(/^Split \((\d+)\/(\d+)\)\s*$/)
        if (!sMatch || parseInt(sMatch[2], 10) !== total) break
        const sOutflow = parseAmount(sRow[iOutflow])
        const sInflow = parseAmount(sRow[iInflow])
        const sAmount = sInflow > 0 ? sInflow : -sOutflow
        const sCatGroup = sRow[iCategoryGroup] || null
        const sCat = sRow[iCategory] || null
        if (sCatGroup && sCat && !SKIP_CATEGORIES.has(sCat)) {
          if (!groupMap.has(sCatGroup)) groupMap.set(sCatGroup, new Set())
          groupMap.get(sCatGroup)!.add(sCat)
        }
        splits.push({ category_group: sCatGroup, category: sCat, amount: sAmount, memo: null })
      }

      const totalAmount = splits.reduce((sum, s) => sum + s.amount, 0)
      transactions.push({
        account, date, payee, category_group: null, category: null,
        amount: totalAmount, memo: null, cleared, splits,
      })
      i += total - 1
      continue
    }

    // Skip if this is a non-first split part (shouldn't reach here, but guard)
    if (splitMatch && splitMatch[1] !== '1') continue

    // Income (Ready to Assign) → transaction with no category
    const isIncome = category === 'Ready to Assign'
    transactions.push({
      account, date, payee,
      category_group: isIncome ? null : categoryGroup,
      category: isIncome ? null : category,
      amount, memo, cleared,
    })
  }

  const accounts: YnabAccount[] = Array.from(accountSet).map(name => ({
    name,
    account_type: inferAccountType(name),
  }))

  const category_groups: YnabCategoryGroup[] = Array.from(groupMap.entries())
    .filter(([name]) => name !== 'Inflow' && name !== 'Credit Card Payments')
    .map(([name, cats]) => ({ name, categories: Array.from(cats) }))

  const payees: YnabPayee[] = Array.from(payeeSet).map(name => ({ name }))

  const transfers: YnabTransfer[] = Array.from(transferPairs.values())

  return { accounts, category_groups, payees, transactions, transfers }
}

export function parsePlan(text: string): YnabAssignment[] {
  const rows = parseTsv(text)
  const header = rows[0]
  const data = rows.slice(1)

  const col = (name: string) => header.indexOf(name)
  const iMonth = col('Month')
  const iCategoryGroup = col('Category Group')
  const iCategory = col('Category')
  const iAssigned = col('Assigned')

  // Detect credit card accounts from Plan
  detectCreditAccounts(data)

  const assignments: YnabAssignment[] = []

  for (const row of data) {
    const group = row[iCategoryGroup]
    const category = row[iCategory]
    const assigned = parseAmount(row[iAssigned])

    if (!group || !category || assigned === 0) continue
    if (group === 'Inflow' || group === 'Credit Card Payments') continue

    assignments.push({
      category_group: group,
      category,
      month: parseMonth(row[iMonth]),
      amount: assigned,
    })
  }

  return assignments
}

export function parseYnabExport(registerTsv: string, planTsv: string): YnabImportResult {
  // Parse Plan first to detect credit card accounts
  const assignments = parsePlan(planTsv)
  const { accounts, category_groups, payees, transactions, transfers } = parseRegister(registerTsv)

  return { accounts, category_groups, payees, transactions, transfers, assignments }
}
