import { createSignal, Show, type Component } from 'solid-js'

interface ConfirmDialogState {
  open: boolean
  message: string
  actionLabel: string
  danger: boolean
  onConfirm: () => void
}

const [state, setState] = createSignal<ConfirmDialogState>({
  open: false,
  message: '',
  actionLabel: 'Confirm',
  danger: false,
  onConfirm: () => {},
})

export function confirmAction(options: {
  message: string
  actionLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return new Promise((resolve) => {
    const isDanger = options.danger ?? /delete|permanently|cannot be undone|remove/i.test(options.message)

    function cleanup() {
      document.removeEventListener('keydown', handleKey)
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setState(s => ({ ...s, open: false }))
        cleanup()
        resolve(false)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        setState(s => ({ ...s, open: false }))
        cleanup()
        resolve(true)
      }
    }

    setState({
      open: true,
      message: options.message,
      actionLabel: options.actionLabel ?? (isDanger ? 'Delete' : 'Confirm'),
      danger: isDanger,
      onConfirm: () => {
        setState(s => ({ ...s, open: false }))
        cleanup()
        resolve(true)
      },
    })

    document.addEventListener('keydown', handleKey)
  })
}

function dismiss() {
  setState(s => ({ ...s, open: false }))
}

const ConfirmDialog: Component = () => {
  return (
    <Show when={state().open}>
      <div class="dialog-backdrop" onClick={dismiss}>
        <div class="dialog dialog--confirm" onClick={(e) => e.stopPropagation()}>
          <p class="dialog__text">{state().message}</p>
          <div class="dialog__actions">
            <button class="btn btn--secondary" onClick={dismiss}>Cancel</button>
            <button
              class={`btn ${state().danger ? 'btn--danger' : 'btn--primary'}`}
              onClick={state().onConfirm}
            >
              {state().actionLabel}
            </button>
          </div>
        </div>
      </div>
    </Show>
  )
}

export default ConfirmDialog
