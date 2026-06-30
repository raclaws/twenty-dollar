import type { Observable } from './reactive'
import type { Record } from './types'

export interface VirtualListOptions {
  container: HTMLElement
  rowHeight: number
  bufferRows?: number
  renderRow: (record: Record, index: number) => HTMLElement
}

export interface VirtualList {
  setData(observable: Observable<Record[]>): void
  destroy(): void
}

export function createVirtualList(options: VirtualListOptions): VirtualList {
  const { container, rowHeight, bufferRows = 5, renderRow } = options

  let data: Record[] = []
  let unsub: (() => void) | null = null

  // Create DOM structure — seamless with page (no visible box boundary)
  const wrapper = document.createElement('div')
  wrapper.style.overflow = 'auto'
  wrapper.style.height = '100%'
  wrapper.style.position = 'relative'
  wrapper.style.borderRadius = '0'

  const spacer = document.createElement('div')
  spacer.style.width = '1px'

  const viewport = document.createElement('div')
  viewport.style.position = 'absolute'
  viewport.style.top = '0'
  viewport.style.left = '0'
  viewport.style.right = '0'

  wrapper.appendChild(spacer)
  wrapper.appendChild(viewport)
  container.appendChild(wrapper)

  // Row pool for recycling
  const pool: HTMLElement[] = []
  let visibleStart = 0
  let visibleEnd = 0

  function getContainerHeight(): number {
    return wrapper.clientHeight
  }

  function getTotalHeight(): number {
    return data.length * rowHeight
  }

  function render() {
    const scrollTop = wrapper.scrollTop
    const containerHeight = getContainerHeight()

    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - bufferRows)
    const end = Math.min(data.length, Math.ceil((scrollTop + containerHeight) / rowHeight) + bufferRows)

    if (start === visibleStart && end === visibleEnd) return

    visibleStart = start
    visibleEnd = end

    // Update spacer height
    spacer.style.height = getTotalHeight() + 'px'

    // Clear and re-render visible rows
    viewport.innerHTML = ''
    viewport.style.transform = `translateY(${start * rowHeight}px)`

    for (let i = start; i < end; i++) {
      const row = renderRow(data[i], i)
      row.style.height = rowHeight + 'px'
      row.style.overflow = 'hidden'
      viewport.appendChild(row)
    }
  }

  function onScroll() {
    requestAnimationFrame(render)
  }

  wrapper.addEventListener('scroll', onScroll, { passive: true })

  // Keyboard navigation
  let focusIndex = -1

  function setFocus(index: number) {
    const rows = viewport.children
    for (let i = 0; i < rows.length; i++) {
      rows[i].classList.remove('row-focused')
    }
    if (index < 0 || index >= data.length) { focusIndex = -1; return }
    focusIndex = index

    // Scroll into view if needed
    const rowTop = index * rowHeight
    const rowBottom = rowTop + rowHeight
    if (rowTop < wrapper.scrollTop) {
      wrapper.scrollTop = rowTop
    } else if (rowBottom > wrapper.scrollTop + getContainerHeight()) {
      wrapper.scrollTop = rowBottom - getContainerHeight()
    }

    // Highlight the focused row in viewport
    requestAnimationFrame(() => {
      const localIndex = index - visibleStart
      if (localIndex >= 0 && localIndex < viewport.children.length) {
        viewport.children[localIndex].classList.add('row-focused')
      }
    })
  }

  function handleKeydown(e: KeyboardEvent) {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
    if (data.length === 0) return

    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault()
      setFocus(Math.min(focusIndex + 1, data.length - 1))
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault()
      setFocus(Math.max(focusIndex - 1, 0))
    } else if (e.key === 'Enter') {
      if (focusIndex >= 0 && focusIndex < data.length) {
        e.preventDefault()
        const row = viewport.children[focusIndex - visibleStart] as HTMLElement | undefined
        row?.click()
      }
    } else if (e.key === 'Escape') {
      focusIndex = -1
      const rows = viewport.children
      for (let i = 0; i < rows.length; i++) {
        rows[i].classList.remove('row-focused')
      }
    }
  }

  document.addEventListener('keydown', handleKeydown)

  function onDataChange(records: Record[]) {
    data = records
    spacer.style.height = getTotalHeight() + 'px'
    visibleStart = -1
    visibleEnd = -1
    if (focusIndex >= data.length) focusIndex = data.length - 1
    requestAnimationFrame(render)
  }

  return {
    setData(observable: Observable<Record[]>) {
      unsub?.()
      unsub = observable.subscribe(onDataChange)
    },

    destroy() {
      unsub?.()
      wrapper.removeEventListener('scroll', onScroll)
      document.removeEventListener('keydown', handleKeydown)
      container.removeChild(wrapper)
    }
  }
}
