import { createSignal, Show, type Component } from 'solid-js'
import { getCurrencyCode, setCurrencyCode, CURRENCIES } from '~/lib/format'
import EntityPicker, { type EntityPickerSection } from '~/components/EntityPicker'

const SettingsView: Component = () => {
  const [currency, setCurrency] = createSignal(getCurrencyCode())
  const [showCurrencyPicker, setShowCurrencyPicker] = createSignal(false)
  let pickerJustClosed = false

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
            <button class="btn btn--secondary">Import CSV</button>
            <button class="btn btn--secondary">Export JSON</button>
          </div>
        </section>
      </div>
    </div>
  )
}

export default SettingsView
