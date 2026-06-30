import { createSignal, createEffect, Show, type Component } from 'solid-js'
import { Target, Calendar, Repeat, X } from 'lucide-solid'
import { parseMoney, formatMoneyUnsigned } from '~/lib/format'
import { useStore } from '~/App'
import { apiPost } from '~/lib/api'
import type { Record } from '~/lib/sync-engine/types'

interface TargetDialogProps {
  open: boolean
  categoryId: string | null
  categoryName: string
  currentTarget: { type: string | null; amount: number | null; date: string | null }
  onClose: () => void
}

const TargetDialog: Component<TargetDialogProps> = (props) => {
  const { raw, reactive } = useStore()
  const [targetType, setTargetType] = createSignal<'monthly' | 'by_date' | 'savings' | null>(null)
  const [amount, setAmount] = createSignal('')
  const [date, setDate] = createSignal('')
  const [error, setError] = createSignal('')
  let dlgRef: HTMLDivElement | undefined

  createEffect(() => {
    if (props.open) {
      setTargetType(props.currentTarget.type as 'monthly' | 'by_date' | null)
      setAmount(props.currentTarget.amount ? (props.currentTarget.amount / 100).toFixed(2) : '')
      setDate(props.currentTarget.date ?? '')
      setError('')
      requestAnimationFrame(() => dlgRef?.focus())
    }
  })

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      const active = document.activeElement as HTMLElement
      if (active && active !== dlgRef && dlgRef?.contains(active)) {
        active.blur()
        dlgRef?.focus()
        return
      }
      props.onClose()
    }
  }

  async function handleSave() {
    const type = targetType()

    if (type === null) {
      await saveTarget(null, null, null)
      props.onClose()
      return
    }

    const cents = parseMoney(amount())
    if (cents <= 0) {
      setError('Amount must be greater than zero')
      return
    }

    if (type === 'by_date' && !date()) {
      setError('Please select a target date')
      return
    }

    await saveTarget(type, cents, type === 'by_date' ? date() : null)
    props.onClose()
  }

  async function saveTarget(type: string | null, amount: number | null, targetDate: string | null) {
    if (!props.categoryId) return

    const existing = await raw.get('categories', props.categoryId)
    if (!existing) return

    await raw.put('categories', {
      ...existing,
      target_type: type,
      target_amount: amount,
      target_date: targetDate,
    })
    reactive.notify('categories')

    apiPost('/api/categories/target', {
      category_id: props.categoryId,
      target_type: type,
      target_amount: amount,
      target_date: targetDate,
    }).catch(() => {})
  }

  return (
    <Show when={props.open}>
      <div class="dialog-backdrop" onClick={props.onClose}>
        <div
          ref={dlgRef}
          class="dialog dialog--sm"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeydown}
        >
          <div class="dialog__header">
            <Target size={16} />
            <span class="dialog__title">Set Target — {props.categoryName}</span>
            <button class="dialog__close" onClick={props.onClose}><X size={16} /></button>
          </div>

          <div class="dialog__body">
            <div class="target-type-picker">
              <button
                class={`target-type-btn ${targetType() === 'monthly' ? 'target-type-btn--active' : ''}`}
                onClick={() => setTargetType('monthly')}
              >
                <Repeat size={14} />
                Need each month
              </button>
              <button
                class={`target-type-btn ${targetType() === 'by_date' ? 'target-type-btn--active' : ''}`}
                onClick={() => setTargetType('by_date')}
              >
                <Calendar size={14} />
                Save by date
              </button>
              <button
                class={`target-type-btn ${targetType() === 'savings' ? 'target-type-btn--active' : ''}`}
                onClick={() => setTargetType('savings')}
              >
                <Target size={14} />
                Save total
              </button>
              <button
                class={`target-type-btn ${targetType() === null ? 'target-type-btn--active' : ''}`}
                onClick={() => setTargetType(null)}
              >
                <X size={14} />
                No target
              </button>
            </div>

            <Show when={targetType() !== null}>
              <div class="target-fields">
                <span class="target-field__hint">
                  {targetType() === 'monthly' && 'Progress measured by assigned amount each month'}
                  {targetType() === 'by_date' && 'Progress measured by available balance toward date'}
                  {targetType() === 'savings' && 'Progress measured by available balance (no deadline)'}
                </span>
                <label class="target-field">
                  <span class="target-field__label">Target amount</span>
                  <input
                    type="text"
                    class="input input--sm"
                    placeholder="0.00"
                    value={amount()}
                    onInput={(e) => setAmount(e.currentTarget.value)}
                  />
                </label>

                <Show when={targetType() === 'by_date'}>
                  <label class="target-field">
                    <span class="target-field__label">Target date</span>
                    <input
                      type="month"
                      class="input input--sm"
                      value={date()}
                      onInput={(e) => setDate(e.currentTarget.value)}
                    />
                  </label>
                </Show>
              </div>
            </Show>

            <Show when={error()}>
              <div class="dialog__error">{error()}</div>
            </Show>
          </div>

          <div class="dialog__footer">
            <button class="btn btn--ghost" onClick={props.onClose}>Cancel</button>
            <button class="btn btn--primary" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </Show>
  )
}

export default TargetDialog
