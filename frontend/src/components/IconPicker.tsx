import { createSignal, For, Show, onMount, onCleanup, type Component } from 'solid-js'
import { X } from 'lucide-solid'
import { ICON_GROUPS, getIconComponent, getInitial, getInitialColor } from '~/lib/icons'

interface IconPickerProps {
  value: string | null
  entityName: string
  onPick: (iconId: string | null) => void
  onCancel: () => void
}

const IconPicker: Component<IconPickerProps> = (props) => {
  const [selected, setSelected] = createSignal(props.value)
  let ref: HTMLDivElement | undefined

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      props.onCancel()
    }
  }

  function handleOutsideClick(e: MouseEvent) {
    if (ref && !ref.contains(e.target as Node)) {
      props.onCancel()
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown, true)
    document.addEventListener('mousedown', handleOutsideClick)
  })
  onCleanup(() => {
    document.removeEventListener('keydown', handleKeydown, true)
    document.removeEventListener('mousedown', handleOutsideClick)
  })

  function pick(iconId: string | null) {
    setSelected(iconId)
    props.onPick(iconId)
  }

  return (
    <div ref={ref} class="icon-picker">
      <div class="icon-picker__header">
        <span class="icon-picker__title">Choose icon</span>
        <button class="icon-picker__clear" onClick={() => pick(null)} title="Remove icon">
          <X size={14} />
        </button>
      </div>
      <div class="icon-picker__grid">
        <For each={ICON_GROUPS}>
          {(group) => (
            <>
              <div class="icon-picker__group-label">{group.label}</div>
              <div class="icon-picker__group-icons">
                <For each={group.icons}>
                  {(def) => {
                    const Icon = def.icon
                    return (
                      <button
                        class={`icon-picker__item ${selected() === def.id ? 'icon-picker__item--selected' : ''}`}
                        onClick={() => pick(def.id)}
                        title={def.id}
                      >
                        <Icon size={18} />
                      </button>
                    )
                  }}
                </For>
              </div>
            </>
          )}
        </For>
      </div>
    </div>
  )
}

export default IconPicker

export const EntityIcon: Component<{ icon: string | null | undefined; name: string; size?: number }> = (props) => {
  const size = () => props.size ?? 16
  const IconComp = () => getIconComponent(props.icon as string)

  return (
    <Show when={IconComp()} fallback={
      <span
        class="entity-icon entity-icon--initial"
        style={{ width: `${size()}px`, height: `${size()}px`, 'background-color': getInitialColor(props.name), 'font-size': `${size() * 0.55}px` }}
      >
        {getInitial(props.name)}
      </span>
    }>
      {(Icon) => (
        <span class="entity-icon entity-icon--lucide">
          {(() => { const I = Icon(); return <I size={size()} /> })()}
        </span>
      )}
    </Show>
  )
}
