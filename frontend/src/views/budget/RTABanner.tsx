import type { Component } from 'solid-js'
import MoneyDisplay from '~/components/MoneyDisplay'
import { formatMoneyUnsigned } from '~/lib/format'

interface RTABannerProps {
  rta: number
}

const RTABanner: Component<RTABannerProps> = (props) => {
  const variant = () => {
    if (props.rta === 0) return 'rta--zero'
    if (props.rta > 0) return 'rta--positive'
    return 'rta--negative'
  }

  const message = () => {
    if (props.rta === 0) return 'All dollars have a job'
    if (props.rta > 0) return 'Assign these dollars to categories'
    return 'You assigned more than you have'
  }

  return (
    <div class={`rta-banner ${variant()}`}>
      <span class="rta-banner__amount">Ready to Assign: {formatMoneyUnsigned(props.rta)}</span>
      <span class="rta-banner__message">{message()}</span>
    </div>
  )
}

export default RTABanner
