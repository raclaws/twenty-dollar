import { createSignal, Show, type ParentComponent, type JSX } from 'solid-js'

interface DetailDialogProps {
  open: boolean
  title: string
  subtitle?: string
  icon?: JSX.Element
  onClose: () => void
  onRename?: (newName: string) => void
}

const DetailDialog: ParentComponent<DetailDialogProps> = (props) => {
  let dialogRef: HTMLDivElement | undefined
  const [editingTitle, setEditingTitle] = createSignal(false)
  const [titleDraft, setTitleDraft] = createSignal('')

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (editingTitle()) {
        setEditingTitle(false)
        e.stopPropagation()
        return
      }
      const active = document.activeElement as HTMLElement | null
      if (active && active.tagName === 'INPUT' && active.closest('.detail-dialog')) {
        active.blur()
        e.stopPropagation()
        return
      }
      props.onClose()
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('add-txn-overlay')) {
      props.onClose()
    }
  }

  function startRename() {
    if (!props.onRename) return
    setTitleDraft(props.title)
    setEditingTitle(true)
  }

  function commitRename() {
    const name = titleDraft().trim()
    if (name && name !== props.title) {
      props.onRename?.(name)
    }
    setEditingTitle(false)
  }

  return (
    <Show when={props.open}>
      <div class="add-txn-overlay detail-dialog-overlay" onClick={handleBackdropClick}>
        <div
          ref={dialogRef}
          class="detail-dialog"
          tabIndex={-1}
          onKeyDown={handleKeydown}
          onClick={(e) => e.stopPropagation()}
          ref={(el) => { dialogRef = el; requestAnimationFrame(() => el.focus()) }}
        >
          <div class="detail-dialog__header">
            <div class="detail-dialog__title">
              {props.icon}
              <Show when={editingTitle()} fallback={
                <span class={props.onRename ? 'detail-dialog__title-text--editable' : ''} onClick={startRename}>{props.title}</span>
              }>
                <input
                  class="detail-dialog__title-input"
                  value={titleDraft()}
                  onInput={(e) => setTitleDraft(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename() }}
                  onBlur={commitRename}
                  ref={(el) => requestAnimationFrame(() => el.focus())}
                />
              </Show>
              <Show when={props.subtitle && !editingTitle()}>
                <span class="detail-dialog__subtitle">{props.subtitle}</span>
              </Show>
            </div>
            <button class="detail-dialog__close" onClick={props.onClose}>Esc</button>
          </div>
          <div class="detail-dialog__body">
            {props.children}
          </div>
        </div>
      </div>
    </Show>
  )
}

export default DetailDialog
