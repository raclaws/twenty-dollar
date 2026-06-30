import type { Component } from 'solid-js'
import { ChevronLeft, ChevronRight } from 'lucide-solid'
import { formatMonth, prevMonth, nextMonth } from '~/lib/format'
import { useMonth } from '~/App'

const MonthNavigator: Component = () => {
  const { month, setMonth } = useMonth()

  return (
    <div class="month-nav">
      <button class="month-nav__btn" onClick={() => setMonth(prevMonth(month()))}><ChevronLeft size={16} /></button>
      <span class="month-nav__label">{formatMonth(month())}</span>
      <button class="month-nav__btn" onClick={() => setMonth(nextMonth(month()))}><ChevronRight size={16} /></button>
    </div>
  )
}

export default MonthNavigator
