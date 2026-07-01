import { type Component, type JSX, Show } from 'solid-js'
import { ChevronRight, ChevronDown } from 'lucide-solid'

export interface GroupHeaderProps {
  label: string
  count: number
  collapsed: boolean
  onToggle: () => void
  aggregate?: JSX.Element
}

const GroupHeader: Component<GroupHeaderProps> = (props) => {
  return (
    <div class={`group-header ${props.collapsed ? 'group-header--collapsed' : ''}`} onClick={props.onToggle}>
      <span class="group-header__chevron">
        {props.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
      </span>
      <span class="group-header__label">{props.label}</span>
      <span class="group-header__count">{props.count}</span>
      <Show when={props.aggregate}>
        <span class="group-header__aggregate">{props.aggregate}</span>
      </Show>
    </div>
  )
}

export default GroupHeader
