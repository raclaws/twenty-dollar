import { createSignal, Show, For, type Component } from 'solid-js'
import { ChevronLeft, ChevronRight } from 'lucide-solid'
import { parseMoney } from '~/lib/format'

// ─── DatePicker (ported from project_x) ───

export interface DatePickerProps {
  value: string
  onCommit: (val: string) => void
  onCancel: () => void
}

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getStartDay(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay()
  return d === 0 ? 6 : d - 1
}

export function DatePicker(props: DatePickerProps) {
  const initial = props.value ? new Date(props.value) : new Date()
  const validInitial = !isNaN(initial.getTime()) ? initial : new Date()

  const [viewYear, setViewYear] = createSignal(validInitial.getFullYear())
  const [viewMonth, setViewMonth] = createSignal(validInitial.getMonth())
  const [selectedDate, setSelectedDate] = createSignal(props.value || '')
  const [showYearGrid, setShowYearGrid] = createSignal(false)
  const [showMonthGrid, setShowMonthGrid] = createSignal(false)
  const [yearGridOffset, setYearGridOffset] = createSignal(0)

  let pickerRef: HTMLDivElement | undefined

  function toISO(day: number): string {
    const m = String(viewMonth() + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${viewYear()}-${m}-${d}`
  }

  function isSelected(day: number): boolean {
    return selectedDate() === toISO(day)
  }

  function isToday(day: number): boolean {
    const now = new Date()
    return now.getFullYear() === viewYear() && now.getMonth() === viewMonth() && now.getDate() === day
  }

  function getCalendarDays(): (number | null)[] {
    const daysInMonth = getDaysInMonth(viewYear(), viewMonth())
    const startDay = getStartDay(viewYear(), viewMonth())
    const cells: (number | null)[] = []
    for (let i = 0; i < startDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    return cells
  }

  function getYearPage(): number[] {
    const base = Math.floor((viewYear() + yearGridOffset()) / 12) * 12
    const years: number[] = []
    for (let i = 0; i < 12; i++) years.push(base + i)
    return years
  }

  function selectDay(day: number) {
    const val = toISO(day)
    setSelectedDate(val)
    props.onCommit(val)
  }

  function prevMonth() {
    if (viewMonth() === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth() === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (showYearGrid() || showMonthGrid()) { setShowYearGrid(false); setShowMonthGrid(false) }
      else props.onCancel()
    }
    if (!showYearGrid() && !showMonthGrid()) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); prevMonth() }
      if (e.key === 'ArrowRight') { e.preventDefault(); nextMonth() }
    }
  }

  return (
    <>
    <div class="entity-picker-backdrop" onClick={() => props.onCancel()} />
    <div
      class="date-picker"
      ref={pickerRef}
      tabIndex={0}
      onKeyDown={handleKeydown}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      ref={(el) => { pickerRef = el; requestAnimationFrame(() => el.focus()) }}
    >
      <Show when={showYearGrid()}>
        <div class="dp-header">
          <button class="dp-nav" onClick={() => setYearGridOffset(o => o - 12)}><ChevronLeft size={14} /></button>
          <span class="dp-title">{getYearPage()[0]}–{getYearPage()[11]}</span>
          <button class="dp-nav" onClick={() => setYearGridOffset(o => o + 12)}><ChevronRight size={14} /></button>
        </div>
        <div class="dp-picker-grid">
          <For each={getYearPage()}>
            {(y) => (
              <button
                class={`dp-picker-cell ${y === viewYear() ? 'dp-picker-active' : ''} ${y === new Date().getFullYear() ? 'dp-picker-current' : ''}`}
                onClick={() => { setViewYear(y); setYearGridOffset(0); setShowYearGrid(false) }}
              >{y}</button>
            )}
          </For>
        </div>
      </Show>

      <Show when={showMonthGrid() && !showYearGrid()}>
        <div class="dp-header">
          <span class="dp-title">{viewYear()}</span>
        </div>
        <div class="dp-picker-grid">
          <For each={MONTHS}>
            {(m, i) => (
              <button
                class={`dp-picker-cell ${i() === viewMonth() ? 'dp-picker-active' : ''} ${i() === new Date().getMonth() && viewYear() === new Date().getFullYear() ? 'dp-picker-current' : ''}`}
                onClick={() => { setViewMonth(i()); setShowMonthGrid(false) }}
              >{m}</button>
            )}
          </For>
        </div>
      </Show>

      <Show when={!showYearGrid() && !showMonthGrid()}>
        <div class="dp-header">
          <button class="dp-nav" onClick={prevMonth}><ChevronLeft size={14} /></button>
          <div class="dp-title-group">
            <button class="dp-title-btn" onClick={() => setShowMonthGrid(true)}>{MONTHS[viewMonth()]}</button>
            <button class="dp-title-btn" onClick={() => { setYearGridOffset(0); setShowYearGrid(true) }}>{viewYear()}</button>
          </div>
          <button class="dp-nav" onClick={nextMonth}><ChevronRight size={14} /></button>
        </div>
        <div class="dp-grid">
          <For each={DAYS}>{(day) => <span class="dp-weekday">{day}</span>}</For>
          <For each={getCalendarDays()}>
            {(cell) => (
              <Show when={cell !== null} fallback={<span class="dp-empty" />}>
                <button
                  class={`dp-day ${isSelected(cell!) ? 'dp-selected' : ''} ${isToday(cell!) ? 'dp-today' : ''}`}
                  onClick={() => selectDay(cell!)}
                >{cell}</button>
              </Show>
            )}
          </For>
        </div>
        <div class="dp-footer">
          <button class="dp-today-btn" onClick={() => { const n = new Date(); setViewYear(n.getFullYear()); setViewMonth(n.getMonth()); selectDay(n.getDate()) }}>Today</button>
          <Show when={selectedDate()}>
            <button class="dp-clear-btn" onClick={() => { setSelectedDate(''); props.onCommit('') }}>Clear</button>
          </Show>
        </div>
      </Show>
    </div>
    </>
  )
}

// ─── MemoCell ───

export interface MemoCellProps {
  value: string
  onCommit: (value: string) => void
}

export function MemoCell(props: MemoCellProps) {
  const [open, setOpen] = createSignal(false)
  let currentValue = props.value

  const hasMemo = () => !!props.value
  const tooltip = () => props.value.length > 80 ? props.value.slice(0, 80) + '…' : props.value

  function openPopup(e: MouseEvent) {
    e.stopPropagation()
    currentValue = props.value
    setOpen(true)
  }

  function commit() {
    setOpen(false)
    props.onCommit(currentValue)
  }

  function cancel() {
    setOpen(false)
  }

  function bindTextarea(el: HTMLTextAreaElement) {
    el.value = currentValue
    el.addEventListener('input', () => { currentValue = el.value })
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cancel()
      else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); commit() }
    })
    setTimeout(() => { el.focus(); el.setSelectionRange(el.value.length, el.value.length) }, 0)
  }

  return (
    <>
      <span
        class={`memo-icon ${hasMemo() ? 'memo-icon--filled' : 'memo-icon--empty'}`}
        title={hasMemo() ? tooltip() : 'Add memo'}
        onClick={openPopup}
        innerHTML={hasMemo()
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z"/></svg>'
        }
      />
      <Show when={open()}>
        <div class="memo-popup-backdrop" onClick={cancel}>
          <div class="memo-popup" onClick={(e) => e.stopPropagation()}>
            <textarea class="memo-popup__input" ref={bindTextarea} placeholder="Add a memo..." rows={4} />
            <div class="memo-popup__footer">
              <span class="memo-popup__hint">Ctrl+Enter to save</span>
              <div class="memo-popup__actions">
                <button class="btn btn--sm btn--secondary" onClick={cancel}>Cancel</button>
                <button class="btn btn--sm btn--primary" onClick={commit}>Save</button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}

// ─── AmountInput ───

export interface AmountInputProps {
  amount: number
  onCommit: (newAmount: number) => void
  onCancel: () => void
  showSign?: boolean
}

export function AmountInput(props: AmountInputProps) {
  const showSign = props.showSign !== false
  let currentValue = (Math.abs(props.amount) / 100).toFixed(2)
  const [isOutflow, setIsOutflow] = createSignal(props.amount < 0)
  let inputEl: HTMLInputElement | undefined
  let committed = false

  function commit() {
    if (committed) return
    committed = true
    const parsed = parseMoney(currentValue)
    if (parsed === null) { props.onCancel(); return }
    const signed = showSign ? (isOutflow() ? -Math.abs(parsed) : Math.abs(parsed)) : parsed
    props.onCommit(signed)
  }

  function bindInput(el: HTMLInputElement) {
    inputEl = el
    el.value = currentValue
    el.addEventListener('input', () => { currentValue = el.value })
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit() }
      else if (e.key === 'Escape') props.onCancel()
    })
    el.addEventListener('blur', commit)
    setTimeout(() => { el.focus(); el.select() }, 0)
  }

  function setSign(out: boolean, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsOutflow(out)
    if (inputEl) inputEl.focus()
  }

  return (
    <div class="txn-cell-amount">
      <Show when={showSign}>
        <div class="sign-toggle sign-toggle--sm">
          <button
            class={`sign-toggle__btn sign-toggle__btn--out ${isOutflow() ? 'sign-toggle__btn--active' : ''}`}
            onMouseDown={(e) => setSign(true, e)}
          >−</button>
          <button
            class={`sign-toggle__btn sign-toggle__btn--in ${!isOutflow() ? 'sign-toggle__btn--active' : ''}`}
            onMouseDown={(e) => setSign(false, e)}
          >+</button>
        </div>
      </Show>
      <input class="txn-cell-input txn-cell-input--amount" type="number" step="0.01" min="0" ref={bindInput} />
    </div>
  )
}
