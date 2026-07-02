import { createSignal, createContext, useContext, createMemo, createEffect, onMount, Show, For, type ParentComponent, type Accessor } from 'solid-js'
import { A, useLocation, useNavigate } from '@solidjs/router'
import { LayoutGrid, ArrowLeftRight, CreditCard, Settings, Wallet, AlertTriangle, TrendingDown, AlertCircle, CircleDot, Upload } from 'lucide-solid'
import { ACCOUNT_TYPE_ICONS } from './lib/icons'
import type { AppStore } from './lib/store'
import { initStore } from './lib/store'
import { createQuery } from './lib/solid-binding'
import { currentMonth, formatMoneyUnsigned, initCurrency } from './lib/format'
import { createBudgetStore } from './lib/budget-signals'
import { useSyncStatus } from './components/SyncIndicator'
import Toast from './components/Toast'
import { confirmAction } from './components/ConfirmDialog'
import ConfirmDialog from './components/ConfirmDialog'
import SyncIndicator, { useOnlineDetector } from './components/SyncIndicator'
import './styles/layout.css'

export type BudgetFilter = 'overspent' | 'underfunded' | 'unfunded' | 'overassigned' | null

const StoreContext = createContext<AppStore>()
const MonthContext = createContext<{ month: Accessor<string>; setMonth: (m: string) => void }>()
const BudgetFilterContext = createContext<{ filter: Accessor<BudgetFilter>; setFilter: (f: BudgetFilter) => void }>()

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore called outside provider')
  return ctx
}

export function useMonth() {
  const ctx = useContext(MonthContext)
  if (!ctx) throw new Error('useMonth called outside provider')
  return ctx
}

export function useBudgetFilter() {
  const ctx = useContext(BudgetFilterContext)
  if (!ctx) throw new Error('useBudgetFilter called outside provider')
  return ctx
}

const AUTH_PATHS = ['/login', '/setup']

const App: ParentComponent = (props) => {
  const [store, setStore] = createSignal<AppStore | null>(null)
  const [month, setMonth] = createSignal(currentMonth())
  const [budgetFilter, setBudgetFilter] = createSignal<BudgetFilter>(null)
  const [loading, setLoading] = createSignal(true)
  const [authed, setAuthed] = createSignal(false)
  const location = useLocation()
  const navigate = useNavigate()

  const isAuthPage = () => AUTH_PATHS.includes(location.pathname)

  let initialized = false

  async function initApp() {
    if (initialized) return
    initialized = true

    const cachedAuth = !!localStorage.getItem('user_email')
    if (cachedAuth) {
      setAuthed(true)
      const s = await initStore()
      setStore(s)
      setLoading(false)
      initCurrency().catch(() => {})
      fetch('/api/schedules/generate', { method: 'POST' }).catch(() => {})
      fetch('/api/auth/me').then(r => {
        if (r.status === 401) {
          localStorage.removeItem('user_name')
          localStorage.removeItem('user_email')
          setAuthed(false)
          window.location.href = '/login'
        }
      }).catch(() => {})
      return
    }

    try {
      const res = await fetch('/api/auth/me')
      if (res.status === 401) {
        navigate('/login', { replace: true })
        setLoading(false)
        return
      }
      if (res.ok) {
        setAuthed(true)
        const s = await initStore()
        setStore(s)
        fetch('/api/schedules/generate', { method: 'POST' }).catch(() => {})
      }
    } catch {
      setAuthed(true)
      const s = await initStore()
      setStore(s)
    }
    setLoading(false)
  }

  createEffect(() => {
    if (!isAuthPage() && !authed()) {
      initApp()
    }
  })

  onMount(() => {
    if (isAuthPage()) {
      setLoading(false)
    }
  })

  return (
    <>
    <SyncIndicator />
    <Show when={isAuthPage()}>
      {props.children}
    </Show>
    <Show when={!isAuthPage()}>
      <Show when={!loading()} fallback={
        <div class="app-loading">
          <Wallet size={48} />
          <span class="app-loading__text">20 Dollar</span>
        </div>
      }>
        <Show when={authed() && store()}>
          <StoreContext.Provider value={store()!}>
            <MonthContext.Provider value={{ month, setMonth }}>
              <BudgetFilterContext.Provider value={{ filter: budgetFilter, setFilter: setBudgetFilter }}>
                <div class="app-shell">
                  <Sidebar />
                  <main class="main">
                    {props.children}
                  </main>
                  <Toast />
                  <ConfirmDialog />
                </div>
              </BudgetFilterContext.Provider>
            </MonthContext.Provider>
          </StoreContext.Provider>
        </Show>
      </Show>
    </Show>
    </>
  )
}

function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { raw, reactive } = useStore()
  const { month } = useMonth()
  const { setFilter } = useBudgetFilter()
  const accounts = createQuery(reactive, 'accounts')
  const transactions = createQuery(reactive, 'transactions')
  const budgetStore = createBudgetStore(reactive, month)

  useOnlineDetector()

  const accountBalances = createMemo(() => {
    const balances = new Map<string, number>()
    for (const tx of transactions()) {
      const accId = tx.account_id as string
      balances.set(accId, (balances.get(accId) ?? 0) + (tx.amount as number))
    }
    return balances
  })

  const underfundedCount = createMemo(() => {
    const groups = budgetStore.budget().groups
    let count = 0
    for (const g of groups) {
      for (const c of g.categories) {
        if (c.target?.isUnderfunded === true) count++
      }
    }
    return count
  })

  const overspentCount = createMemo(() => {
    const groups = budgetStore.budget().groups
    let count = 0
    for (const g of groups) {
      for (const c of g.categories) {
        if (c.activity < 0 && c.available < 0) count++
      }
    }
    return count
  })

  const unfundedCount = createMemo(() => {
    const groups = budgetStore.budget().groups
    let count = 0
    for (const g of groups) {
      for (const c of g.categories) {
        if (c.assigned === 0 && c.available <= 0) count++
      }
    }
    return count
  })

  const overAssigned = createMemo(() => {
    const rta = budgetStore.rta()
    return rta < 0 ? Math.abs(rta) : 0
  })

  const rtaDisplay = createMemo(() => {
    const rta = budgetStore.rta()
    return rta > 0 ? rta : 0
  })

  const isActive = (path: string) => location.pathname === path

  return (
    <aside class="sidebar">
      {/* Budget status section */}
      <div class="sidebar__status">
        <div class={`sidebar__rta ${rtaDisplay() === 0 && overAssigned() === 0 ? 'sidebar__rta--zero' : rtaDisplay() > 0 ? 'sidebar__rta--positive' : 'sidebar__rta--negative'}`}
          onClick={() => { navigate('/?action=assign-rta') }}
          style={{ cursor: 'pointer' }}
        >
          <span class="sidebar__rta-amount">{formatMoneyUnsigned(rtaDisplay())}</span>
          <span class="sidebar__rta-label">Ready to Assign</span>
        </div>
        <div class="sidebar__counters">
          <Show when={overAssigned() > 0}>
            <div class="sidebar__counter sidebar__counter--overassigned" onClick={(e) => { e.stopPropagation(); setFilter('overassigned'); navigate('/') }}>
              <AlertCircle size={12} />
              <span class="sidebar__counter-label">Over-assigned</span>
              <span class="sidebar__counter-value">{formatMoneyUnsigned(overAssigned())}</span>
            </div>
          </Show>
          <Show when={overspentCount() > 0}>
            <div class="sidebar__counter sidebar__counter--overspent" onClick={(e) => { e.stopPropagation(); setFilter('overspent'); navigate('/') }}>
              <AlertTriangle size={12} />
              <span class="sidebar__counter-label">Overspent</span>
              <span class="sidebar__counter-value">{overspentCount()}</span>
            </div>
          </Show>
          <Show when={underfundedCount() > 0}>
            <div class="sidebar__counter sidebar__counter--underfunded" onClick={(e) => { e.stopPropagation(); setFilter('underfunded'); navigate('/') }}>
              <TrendingDown size={12} />
              <span class="sidebar__counter-label">Underfunded</span>
              <span class="sidebar__counter-value">{underfundedCount()}</span>
            </div>
          </Show>
          <Show when={unfundedCount() > 0}>
            <div class="sidebar__counter sidebar__counter--unfunded" onClick={(e) => { e.stopPropagation(); setFilter('unfunded'); navigate('/') }}>
              <CircleDot size={12} />
              <span class="sidebar__counter-label">Unfunded</span>
              <span class="sidebar__counter-value">{unfundedCount()}</span>
            </div>
          </Show>
        </div>
      </div>
      <div class="sidebar__sep" />
      <nav class="sidebar__nav">
        <A href="/" class={`sidebar__link ${isActive('/') ? 'sidebar__link--active' : ''}`}>
          <LayoutGrid size={16} />
          Budget
        </A>
        <A href="/transactions" class={`sidebar__link ${isActive('/transactions') ? 'sidebar__link--active' : ''}`}>
          <ArrowLeftRight size={16} />
          Transactions
        </A>
        <A href="/accounts" class={`sidebar__link ${isActive('/accounts') ? 'sidebar__link--active' : ''}`}>
          <CreditCard size={16} />
          Accounts
        </A>
        <A href="/import" class={`sidebar__link ${isActive('/import') ? 'sidebar__link--active' : ''}`}>
          <Upload size={16} />
          Import
        </A>
        <A href="/settings" class={`sidebar__link ${isActive('/settings') ? 'sidebar__link--active' : ''}`}>
          <Settings size={16} />
          Settings
        </A>
      </nav>
      <div class="sidebar__sep" />
      <div class="sidebar__accounts">
        <For each={accounts().filter(a => !(a.deleted_at as string))}>
          {(account) => {
            const balance = () => accountBalances().get(account.id as string) ?? 0
            const TypeIcon = () => ACCOUNT_TYPE_ICONS[(account.type as string) ?? 'checking'] ?? CreditCard
            return (
              <A href={`/transactions?account=${account.id}`} class="sidebar__account">
                <span class="sidebar__account-icon"><TypeIcon size={14} /></span>
                <span class="sidebar__account-name">{account.name as string}</span>
                <span class={`sidebar__account-balance ${balance() >= 0 ? 'money--positive' : 'money--negative'}`}>
                  {formatMoneyUnsigned(Math.abs(balance()))}
                </span>
              </A>
            )
          }}
        </For>
      </div>
      <div class="sidebar__user">
        <div class="sidebar__user-row">
          <span class="sidebar__user-avatar">
            {(() => {
              const name = localStorage.getItem('user_name') || '?'
              return name.charAt(0).toUpperCase()
            })()}
          </span>
          <span class="sidebar__user-email">{localStorage.getItem('user_email') || ''}</span>
        </div>
        <button class="sidebar__logout" onClick={async () => {
          const confirmed = await confirmAction({
            message: 'Log out of 20 Dollar?',
            actionLabel: 'Log out',
          })
          if (!confirmed) return
          await fetch('/api/auth/logout', { method: 'POST' })
          const tables = ['accounts', 'payees', 'category_groups', 'categories', 'transactions', 'split_entries', 'assignments', 'schedules']
          for (const table of tables) await raw.clear(table)
          localStorage.removeItem('user_name')
          localStorage.removeItem('user_email')
          localStorage.removeItem('twenty-dollar:seeded')
          navigate('/login', { replace: true })
        }}>Log out</button>
      </div>
    </aside>
  )
}

export default App
