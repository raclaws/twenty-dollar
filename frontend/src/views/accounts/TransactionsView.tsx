import { createSignal, createEffect, createMemo, For, Show, type Component } from 'solid-js'
import { useSearchParams } from '@solidjs/router'
import { ArrowLeftRight, AlertCircle } from 'lucide-solid'
import { useStore } from '~/App'
import { createQuery } from '~/lib/solid-binding'
import { apiPost } from '~/lib/api'
import TransactionTable from './TransactionTable'

const STORAGE_KEY = 'twenty-dollar:account'

const TransactionsView: Component = () => {
  const { raw, reactive } = useStore()
  const accounts = createQuery(reactive, 'accounts')
  const transactions = createQuery(reactive, 'transactions')
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedAccount, setSelectedAccount] = createSignal<string | undefined>(undefined)

  createEffect(() => {
    const paramId = searchParams.account as string | undefined
    if (paramId) {
      setSelectedAccount(paramId)
      localStorage.setItem(STORAGE_KEY, paramId)
    } else {
      const saved = localStorage.getItem(STORAGE_KEY)
      const active = activeAccounts()
      if (saved && active.some(a => a.id === saved)) {
        setSelectedAccount(saved)
      } else {
        setSelectedAccount(undefined)
      }
    }
  })

  function handleAccountChange(val: string | undefined) {
    setSelectedAccount(val)
    if (val) {
      localStorage.setItem(STORAGE_KEY, val)
      setSearchParams({ account: val })
    } else {
      localStorage.removeItem(STORAGE_KEY)
      setSearchParams({ account: undefined })
    }
  }

  const activeAccounts = () => accounts().filter(a => !(a.deleted_at as string))

  const missingStartingBalance = createMemo(() => {
    const accId = selectedAccount()
    if (!accId) return false
    const txns = transactions().filter(t => t.account_id === accId)
    return !txns.some(t => (t.payee as string) === 'Starting Balance')
  })

  async function recreateStartingBalance() {
    const accId = selectedAccount()
    if (!accId) return
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const record = {
      id, account_id: accId, date: today, amount: 0,
      payee: 'Starting Balance', payee_id: null, category_id: null,
      memo: null, cleared: true, linked_id: null, source: 'system', splits: [],
      created_at: now,
    }
    await raw.put('transactions', { ...record, cleared: 1 })
    reactive.notify('transactions')
    apiPost('/api/transactions', record).catch(() => {})
  }

  return (
    <div class="accounts-view">
      <div class="accounts-view__topbar">
        <Show when={activeAccounts().length > 0} fallback={
          <span class="accounts-view__empty-hint">No accounts yet — create one in Settings</span>
        }>
          <select
            class="input accounts-view__picker"
            value={selectedAccount() ?? ''}
            onChange={(e) => handleAccountChange(e.currentTarget.value || undefined)}
          >
            <option value="">All Accounts</option>
            <For each={activeAccounts()}>
              {(acc) => <option value={acc.id as string}>{acc.name as string}</option>}
            </For>
          </select>
        </Show>
      </div>
      <Show when={missingStartingBalance()}>
        <div class="starting-balance-banner">
          <AlertCircle size={14} />
          <span>No starting balance set for this account.</span>
          <button class="btn btn--sm btn--secondary" onClick={recreateStartingBalance}>Create Starting Balance</button>
        </div>
      </Show>
      <Show when={activeAccounts().length === 0}>
        <div class="empty-state">
          <div class="empty-state__icon"><ArrowLeftRight size={32} /></div>
          <p class="empty-state__title">No accounts yet</p>
          <p class="empty-state__desc">Create an account in Settings to start tracking transactions.</p>
          <a href="/settings" class="btn btn--primary">Go to Settings</a>
        </div>
      </Show>
      <Show when={activeAccounts().length > 0}>
        <TransactionTable accountId={selectedAccount()} />
      </Show>
    </div>
  )
}

export default TransactionsView
