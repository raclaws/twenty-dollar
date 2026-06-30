import type { Component } from 'solid-js'

interface HealthRingProps {
  available: number
  activity: number
  size?: number
}

const HealthRing: Component<HealthRingProps> = (props) => {
  const size = () => props.size ?? 20
  const strokeWidth = 3
  const radius = () => (size() - strokeWidth) / 2
  const circumference = () => 2 * Math.PI * radius()

  const ratio = () => {
    if (props.available < 0) return 0
    const absActivity = Math.abs(props.activity)
    if (absActivity === 0) return props.available > 0 ? 1 : 0
    return Math.min(props.available / absActivity, 1)
  }

  const color = () => {
    if (props.available < 0) return 'var(--c-negative)'
    const r = ratio()
    if (r >= 0.75) return 'var(--c-positive)'
    if (r >= 0.25) return 'var(--c-warning)'
    return 'var(--c-negative)'
  }

  const dashOffset = () => circumference() * (1 - ratio())

  return (
    <svg width={size()} height={size()} class="health-ring">
      <circle
        cx={size() / 2}
        cy={size() / 2}
        r={radius()}
        fill="none"
        stroke="var(--c-surface0)"
        stroke-width={strokeWidth}
      />
      <circle
        cx={size() / 2}
        cy={size() / 2}
        r={radius()}
        fill="none"
        stroke={color()}
        stroke-width={strokeWidth}
        stroke-dasharray={circumference()}
        stroke-dashoffset={dashOffset()}
        stroke-linecap="round"
        transform={`rotate(-90 ${size() / 2} ${size() / 2})`}
      />
    </svg>
  )
}

export default HealthRing
