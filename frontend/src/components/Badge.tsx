import type { Component, JSX } from 'solid-js'

interface BadgeProps {
  variant: 'positive' | 'negative' | 'warning' | 'neutral' | 'info'
  children: JSX.Element
}

const Badge: Component<BadgeProps> = (props) => {
  return <span class={`badge badge--${props.variant}`}>{props.children}</span>
}

export default Badge
