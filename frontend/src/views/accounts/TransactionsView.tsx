import { createSignal, createEffect, For, Show, type Component } from 'solid-js'
import { useSearchParams } from '@solidjs/router'
import { ArrowLeftRight } from 'lucide-solid'
import { useStore } from '~/App'
import { createQuery } from '~/lib/solid-binding'
import TransactionTable from './TransactionTable'

const STORAGE_KEY = 'twenty-dollar:account'

const TransactionsView: Component = () => {
  const { reactive } = useStore()
  const accounts = createQuery(reactive, 'accounts')
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedAccount, setSelectedAccount] = createSignal<string | undefined>(undefined)

  createEffect(() => {
    const paramId = searchParams.account as string | undefined
    if (paramId) {
      setSelectedAccount(paramId)
      localStorage.setItem(STORAGE_KEY, paramId)
    } else {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setSelectedAccount(saved)
      } else {
        const first = activeAccounts()[0]
        if (first) setSelectedAccount(first.id as string)
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
