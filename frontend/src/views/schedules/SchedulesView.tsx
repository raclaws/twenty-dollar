import { createSignal, For, Show, type Component } from 'solid-js'
import { Pause, Play, Trash2, RefreshCw } from 'lucide-solid'
import { useStore } from '~/App'
import { createQuery } from '~/lib/solid-binding'
import { apiPut, apiDelete, apiPost } from '~/lib/api'
import { formatMoneyUnsigned } from '~/lib/format'
import { confirmAction } from '~/components/ConfirmDialog'

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

const SchedulesView: Component = () => {
  const { raw, reactive } = useStore()
  const schedules = createQuery(reactive, 'schedules')
  const accounts = createQuery(reactive, 'accounts')
  const categories = createQuery(reactive, 'categories')
  const payees = createQuery(reactive, 'payees')

  const [generating, setGenerating] = createSignal(false)

  const activeSchedules = () => schedules().filter(s => !(s.paused as number))
  const pausedSchedules = () => schedules().filter(s => !!(s.paused as number))

  function accountName(id: string) {
    const a = accounts().find(a => a.id === id)
    return a ? a.name as string : '—'
  }

  function categoryName(id: string | null) {
    if (!id) return '—'
    const c = categories().find(c => c.id === id)
    return c ? c.name as string : '—'
  }

  function payeeName(s: any): string {
    if (s.payee) return s.payee as string
    return '—'
  }

  async function togglePause(id: string, currentlyPaused: number) {
    const newPaused = currentlyPaused ? 0 : 1
    await raw.put('schedules', { ...schedules().find(s => s.id === id)!, paused: newPaused })
    reactive.notify('schedules')
    apiPut(`/api/schedules/${id}`, { paused: !!newPaused }).catch(() => {})
  }

  async function deleteSchedule(id: string) {
    const confirmed = await confirmAction({
      message: 'Delete this recurring transaction? This cannot be undone.',
      actionLabel: 'Delete',
    })
    if (!confirmed) return
    await raw.delete('schedules', id)
    reactive.notify('schedules')
    apiDelete(`/api/schedules/${id}`).catch(() => {})
  }

  async function generateDue() {
    setGenerating(true)
    try {
      await apiPost('/api/schedules/generate', {})
      const fresh = await fetch('/api/schedules').then(r => r.json())
      for (const s of fresh) await raw.put('schedules', s)
      reactive.notify('schedules')
      reactive.notify('transactions')
    } catch {}
    setGenerating(false)
  }

  function ScheduleRow(props: { schedule: any }) {
    const s = props.schedule
    const isPaused = () => !!(s.paused as number)
    const amount = s.amount as number

    return (
      <div class={`schedule-row ${isPaused() ? 'schedule-row--paused' : ''}`}>
        <div class="schedule-row__payee">{payeeName(s)}</div>
        <div class="schedule-row__account">{accountName(s.account_id as string)}</div>
        <div class="schedule-row__category">{categoryName(s.category_id as string | null)}</div>
        <div class={`schedule-row__amount ${amount >= 0 ? 'money--positive' : 'money--negative'}`}>
          {amount < 0 ? '-' : '+'}{formatMoneyUnsigned(Math.abs(amount))}
        </div>
        <div class="schedule-row__frequency">{FREQUENCY_LABELS[s.frequency as string] ?? s.frequency}</div>
        <div class="schedule-row__next">{isPaused() ? 'Paused' : s.next_due as string}</div>
        <div class="schedule-row__actions">
          <button class="btn btn--icon" title={isPaused() ? 'Resume' : 'Pause'} onClick={() => togglePause(s.id as string, s.paused as number)}>
            {isPaused() ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button class="btn btn--icon btn--icon--danger" title="Delete" onClick={() => deleteSchedule(s.id as string)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div class="schedules-view">
      <div class="schedules-view__topbar">
        <h1 class="schedules-view__title">Recurring</h1>
        <button class="btn btn--sm btn--secondary" disabled={generating()} onClick={generateDue}>
          <RefreshCw size={14} /> {generating() ? 'Generating...' : 'Generate Due'}
        </button>
      </div>

      <div class="schedules-view__content">
        <Show when={schedules().length === 0}>
          <div class="schedules-view__empty">
            <p>No recurring transactions yet.</p>
            <p class="schedules-view__empty-hint">Toggle "Recurring" when adding a transaction to create one.</p>
          </div>
        </Show>

        <Show when={activeSchedules().length > 0}>
          <div class="schedules-view__section">
            <div class="schedules-view__header">
              <div class="schedule-row__payee">Payee</div>
              <div class="schedule-row__account">Account</div>
              <div class="schedule-row__category">Category</div>
              <div class="schedule-row__amount">Amount</div>
              <div class="schedule-row__frequency">Frequency</div>
              <div class="schedule-row__next">Next Due</div>
              <div class="schedule-row__actions" />
            </div>
            <For each={activeSchedules()}>
              {(s) => <ScheduleRow schedule={s} />}
            </For>
          </div>
        </Show>

        <Show when={pausedSchedules().length > 0}>
          <div class="schedules-view__section">
            <h3 class="schedules-view__section-title">Paused</h3>
            <For each={pausedSchedules()}>
              {(s) => <ScheduleRow schedule={s} />}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default SchedulesView
