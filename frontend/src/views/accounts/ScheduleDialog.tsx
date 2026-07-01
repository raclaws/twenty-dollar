import { createSignal, Show } from 'solid-js'
import { Repeat, Calendar, X } from 'lucide-solid'
import { apiPost } from '~/lib/api'

interface ScheduleDialogProps {
  transaction?: {
    account_id: string
    category_id: string | null
    payee: string | null
    amount: number
    memo: string | null
  }
  onClose: () => void
  onCreated: () => void
}

export default function ScheduleDialog(props: ScheduleDialogProps) {
  const tx = props.transaction
  const [frequency, setFrequency] = createSignal<string>('monthly')
  const [nextDue, setNextDue] = createSignal(nextMonth())
  const [endDate, setEndDate] = createSignal('')
  const [autoClear, setAutoClear] = createSignal(true)
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal('')

  function nextMonth() {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  }

  const handleSave = async (e: Event) => {
    e.preventDefault()
    if (!tx) return
    setSaving(true)
    setError('')

    try {
      await apiPost('/api/schedules', {
        account_id: tx.account_id,
        category_id: tx.category_id,
        payee: tx.payee,
        amount: tx.amount,
        memo: tx.memo,
        frequency: frequency(),
        next_due: nextDue(),
        end_date: endDate() || null,
        auto_clear: autoClear(),
      })
      props.onCreated()
      props.onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create schedule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="dialog-backdrop" onClick={() => props.onClose()}>
      <div class="dialog schedule-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog__header">
          <Repeat size={16} />
          <span class="dialog__title">Make Recurring</span>
          <button class="dialog__close" onClick={() => props.onClose()}><X size={14} /></button>
        </div>

        <form class="schedule-dialog__form" onSubmit={handleSave}>
          <div class="schedule-dialog__summary">
            <Show when={tx?.payee}><span class="schedule-dialog__payee">{tx!.payee}</span></Show>
            <span class="schedule-dialog__amount">${(Math.abs(tx?.amount ?? 0) / 100).toFixed(2)}</span>
          </div>

          <label class="schedule-dialog__field">
            <span>Frequency</span>
            <select value={frequency()} onChange={(e) => setFrequency(e.currentTarget.value)}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>

          <label class="schedule-dialog__field">
            <span>Next due</span>
            <input type="date" value={nextDue()} onInput={(e) => setNextDue(e.currentTarget.value)} required />
          </label>

          <label class="schedule-dialog__field">
            <span>End date (optional)</span>
            <input type="date" value={endDate()} onInput={(e) => setEndDate(e.currentTarget.value)} />
          </label>

          <label class="schedule-dialog__checkbox">
            <input type="checkbox" checked={autoClear()} onChange={(e) => setAutoClear(e.currentTarget.checked)} />
            <span>Auto-clear when generated</span>
          </label>

          <Show when={error()}>
            <div class="schedule-dialog__error">{error()}</div>
          </Show>

          <div class="schedule-dialog__actions">
            <button type="button" class="btn btn--ghost" onClick={() => props.onClose()}>Cancel</button>
            <button type="submit" class="btn btn--primary" disabled={saving()}>
              {saving() ? 'Saving...' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
