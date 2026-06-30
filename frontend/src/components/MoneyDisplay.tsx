import type { Component } from 'solid-js'
import { formatMoney, formatMoneyUnsigned } from '~/lib/format'

interface MoneyDisplayProps {
  amount: number
  unsigned?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const MoneyDisplay: Component<MoneyDisplayProps> = (props) => {
  const cls = () => {
    const base = 'money'
    const variant = props.amount > 0 ? 'money--positive' : props.amount < 0 ? 'money--negative' : 'money--zero'
    const size = props.size ? `money--${props.size}` : ''
    return `${base} ${variant} ${size}`.trim()
  }

  const text = () => props.unsigned ? formatMoneyUnsigned(props.amount) : formatMoney(props.amount)

  return <span class={cls()}>{text()}</span>
}

export default MoneyDisplay
