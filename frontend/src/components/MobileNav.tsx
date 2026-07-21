import { A, useLocation } from '@solidjs/router'
import { LayoutGrid, ArrowLeftRight, CreditCard, Settings } from 'lucide-solid'
import { createSignal } from 'solid-js'

const TABS = [
  { path: '/', label: 'Budget', Icon: LayoutGrid },
  { path: '/transactions', label: 'Transactions', Icon: ArrowLeftRight },
  { path: '/accounts', label: 'Accounts', Icon: CreditCard },
  { path: '/settings', label: 'Settings', Icon: Settings },
] as const

export default function MobileNav() {
  const location = useLocation()
  const [focusIdx, setFocusIdx] = createSignal(-1)
  let navRef: HTMLElement | undefined

  const activeIdx = () => {
    const idx = TABS.findIndex(t => t.path === location.pathname)
    return idx >= 0 ? idx : 0
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const current = focusIdx() >= 0 ? focusIdx() : activeIdx()
      const next = e.key === 'ArrowRight'
        ? (current + 1) % TABS.length
        : (current - 1 + TABS.length) % TABS.length
      setFocusIdx(next)
      const links = navRef?.querySelectorAll<HTMLAnchorElement>('.mobile-nav__tab')
      links?.[next]?.focus()
    }
  }

  return (
    <nav
      ref={navRef}
      class="mobile-nav"
      role="navigation"
      aria-label="Main navigation"
      onKeyDown={handleKeyDown}
    >
      {TABS.map((tab, i) => {
        const isActive = () => location.pathname === tab.path
        return (
          <A
            href={tab.path}
            class={`mobile-nav__tab ${isActive() ? 'mobile-nav__tab--active' : ''}`}
            aria-current={isActive() ? 'page' : undefined}
            tabIndex={isActive() ? 0 : -1}
          >
            <tab.Icon size={20} />
            <span class="mobile-nav__label">{tab.label}</span>
          </A>
        )
      })}
    </nav>
  )
}
