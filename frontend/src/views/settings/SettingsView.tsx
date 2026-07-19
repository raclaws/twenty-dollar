import { createSignal, Show, type Component } from 'solid-js'
import { getCurrencyCode, setCurrencyCode, CURRENCIES } from '~/lib/format'
import { useStore } from '~/App'
import { apiPost, apiGet } from '~/lib/api'
import EntityPicker, { type EntityPickerSection } from '~/components/EntityPicker'

const SettingsView: Component = () => {
  const { raw, reactive } = useStore()
  const [currency, setCurrency] = createSignal(getCurrencyCode())
  const [showCurrencyPicker, setShowCurrencyPicker] = createSignal(false)
  const [clearing, setClearing] = createSignal(false)
  const [confirmClear, setConfirmClear] = createSignal(false)
  let pickerJustClosed = false

  async function handleExport() {
    const data = await apiGet<any>('/api/export')
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `twenty-dollar-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleExportCsv() {
    const res = await fetch('/api/export/csv')
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `twenty-dollar-transactions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function clearSampleData() {
    setClearing(true)
    try {
      // Clear server-side first
      await apiPost('/api/reset', {})

      // Clear local IDB
      await raw.clear('transactions')
      await raw.clear('split_entries')
      await raw.clear('accounts')
      await raw.clear('payees')
      await raw.clear('assignments')
      await raw.clear('schedules')

      // Strip targets from categories (keep category structure)
      const cats = await raw.getAll('categories')
      for (const cat of cats) {
        await raw.put('categories', { ...cat, target_type: null, target_amount: null, target_date: null })
      }

      reactive.notify('transactions')
      reactive.notify('split_entries')
      reactive.notify('accounts')
      reactive.notify('payees')
      reactive.notify('assignments')
      reactive.notify('schedules')
      reactive.notify('categories')
    } finally {
      setClearing(false)
      setConfirmClear(false)
    }
  }

  const currencySections = (): EntityPickerSection[] => [
    {
      key: 'currencies',
      label: 'Currency',
      items: CURRENCIES.map(c => ({ id: c.code, label: `${c.country} — ${c.code}`, meta: c.symbol })),
    },
  ]

  const currentLabel = () => {
    const entry = CURRENCIES.find(c => c.code === currency())
    return entry ? `${entry.country} — ${entry.code} (${entry.symbol})` : currency()
  }

  function handleCurrencyPick(code: string) {
    setCurrency(code)
    setCurrencyCode(code)
    setShowCurrencyPicker(false)
  }

  function cancelPicker() {
    pickerJustClosed = true
    setShowCurrencyPicker(false)
    setTimeout(() => { pickerJustClosed = false }, 50)
  }

  return (
    <div class="settings-view">
      <div class="settings-view__topbar">
        <span class="settings-view__title">Settings</span>
      </div>
      <div class="settings-view__content">
        <section class="settings-section">
          <h3 class="settings-section__title">Currency</h3>
          <div class="settings-section__field">
            <label class="settings-section__label">Display currency</label>
            <div class="settings-currency-picker" style={{ position: 'relative' }}>
              <div
                class="add-txn-dialog__input add-txn-dialog__input--select"
                onClick={() => setShowCurrencyPicker(true)}
              >
                {currentLabel()} ▾
              </div>
              <Show when={showCurrencyPicker()}>
                <EntityPicker
                  sections={currencySections()}
                  value={currency()}
                  placeholder="Search country or currency..."
                  onPick={handleCurrencyPick}
                  onCreate={() => {}}
                  onCancel={cancelPicker}
                />
              </Show>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h3 class="settings-section__title">Data</h3>
          <div class="settings-section__actions">
            <button class="btn btn--secondary" onClick={handleExport}>Export JSON</button>
            <button class="btn btn--secondary" onClick={handleExportCsv}>Export CSV</button>
          </div>
        </section>

        <section class="settings-section">
          <h3 class="settings-section__title">Reset</h3>
          <p class="settings-section__desc">Clear all transactions, accounts, payees, and assignments. Categories and category groups are kept.</p>
          <div class="settings-section__actions">
            <Show when={!confirmClear()} fallback={
              <div class="settings-confirm-row">
                <span class="settings-confirm-row__text">Are you sure? This cannot be undone.</span>
                <button class="btn btn--danger btn--sm" disabled={clearing()} onClick={clearSampleData}>
                  {clearing() ? 'Clearing...' : 'Yes, clear all'}
                </button>
                <button class="btn btn--secondary btn--sm" onClick={() => setConfirmClear(false)}>Cancel</button>
              </div>
            }>
              <button class="btn btn--danger" onClick={() => setConfirmClear(true)}>Clear transactions &amp; accounts</button>
            </Show>
          </div>
        </section>
      </div>
    </div>
  )
}

export default SettingsView
