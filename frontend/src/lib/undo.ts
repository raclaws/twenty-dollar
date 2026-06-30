import { createSignal, For, Show, onCleanup } from 'solid-js'

export interface UndoEntry {
  description: string
  undo: () => Promise<void>
  redo: () => Promise<void>
}

const MAX_STACK = 50

const [undoStack, setUndoStack] = createSignal<UndoEntry[]>([])
const [redoStack, setRedoStack] = createSignal<UndoEntry[]>([])
const [toast, setToast] = createSignal<{ message: string; visible: boolean }>({ message: '', visible: false })
let busy = false

let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(message: string) {
  if (toastTimer) clearTimeout(toastTimer)
  setToast({ message, visible: true })
  toastTimer = setTimeout(() => setToast({ message: '', visible: false }), 4000)
}

export function pushUndo(entry: UndoEntry) {
  setUndoStack(s => [...s.slice(-(MAX_STACK - 1)), entry])
  setRedoStack([])
  showToast(entry.description)
}

export async function performUndo() {
  if (busy) return
  const stack = undoStack()
  if (stack.length === 0) return
  busy = true
  try {
    const entry = stack[stack.length - 1]
    setUndoStack(s => s.slice(0, -1))
    await entry.undo()
    setRedoStack(s => [...s, entry])
    showToast(`Undid: ${entry.description}`)
  } finally {
    busy = false
  }
}

export async function performRedo() {
  if (busy) return
  const stack = redoStack()
  if (stack.length === 0) return
  busy = true
  try {
    const entry = stack[stack.length - 1]
    setRedoStack(s => s.slice(0, -1))
    await entry.redo()
    setUndoStack(s => [...s, entry])
    showToast(`Redid: ${entry.description}`)
  } finally {
    busy = false
  }
}

export function useUndoKeyboard() {
  function handler(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      performUndo()
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault()
      performRedo()
    }
  }
  document.addEventListener('keydown', handler)
  onCleanup(() => document.removeEventListener('keydown', handler))
}

export function getToast() {
  return toast
}

export function dismissToast() {
  if (toastTimer) clearTimeout(toastTimer)
  setToast({ message: '', visible: false })
}

export function canUndo() { return undoStack().length > 0 }
export function canRedo() { return redoStack().length > 0 }
