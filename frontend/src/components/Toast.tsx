import { Show, type Component } from 'solid-js'
import { X } from 'lucide-solid'
import { getToast, performUndo, dismissToast } from '~/lib/undo'

const Toast: Component = () => {
  const toast = getToast()

  return (
    <Show when={toast().visible}>
      <div class="toast toast--undo">
        <span class="toast__message">{toast().message}</span>
        <button class="btn btn--sm btn--primary" onClick={performUndo}>Undo</button>
        <span class="toast__hint">Ctrl+Z</span>
        <button class="toast__dismiss" onClick={dismissToast}><X size={14} /></button>
      </div>
    </Show>
  )
}

export default Toast
