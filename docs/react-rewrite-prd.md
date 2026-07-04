# PRD: Twenty Dollar — React + Tailwind Rewrite (Mobile-First)

## Why Rewrite

1. **AI assist friction** — SolidJS is 🟥 tier (constant hand-holding). React is ⬛ (zero friction). Every feature iteration with AI takes 3-5x corrections on Solid.
2. **No mobile view** — current UI is desktop-only (sidebar nav, wide grid). Budget apps are checked on phones, not laptops.
3. **Custom CSS debt** — 14 CSS files, no responsive system. Tailwind gives mobile-first breakpoints for free.
4. **Component reuse** — tables R&D already built React versions of EntityPicker, DatePicker, type-aware cells.

## What Does NOT Change

- Rust/Axum backend (zero changes, same binary)
- API contract (all endpoints stay identical)
- SQLite database schema
- IndexedDB schema on client (same tables, same fields)
- Docker deployment
- Auth flow (cookie-based, argon2)
- PWA manifest + service worker strategy
- `computeBudget()` pure function (copy as-is, it's plain TS)

## Target Stack

| Layer | Choice | Tier | Notes |
|-------|--------|------|-------|
| Framework | React 19 | ⬛ | Automatic batching, transitions |
| Styling | Tailwind 4 | ⬛ | Mobile-first utilities, dark mode built-in |
| Router | TanStack Router | 🟧 | Type-safe, file-based optional, lighter than react-router |
| State | Zustand | ⬛ | Minimal, works with sync engine pattern |
| Build | Vite | ⬛ | Same as current, keep PWA plugin |
| Icons | Lucide React | ⬛ | Same icon set as current |
| Animations | CSS transitions + Tailwind `animate-*` | — | No extra lib unless needed |

**Score: 47/50** (vs current Solid stack at ~22/50)

## Mobile-First Layout

### Navigation

```
Desktop (md+):              Mobile (default):
┌────────┬────────────┐     ┌──────────────────┐
│ Sidebar│            │     │                  │
│ - Budget            │     │    Content       │
│ - Txns │  Content   │     │    (full width)  │
│ - Accts│            │     │                  │
│ - Import            │     ├──────────────────┤
│ - Settings          │     │ ● ● ● ● ●       │
└────────┴────────────┘     │   Bottom tabs    │
                            └──────────────────┘
```

- Mobile: 5-tab bottom bar (Budget, Transactions, Accounts, Import, Settings)
- Desktop (md+): collapsible sidebar, same as current
- Transition: bottom bar hides at `md:` breakpoint, sidebar appears

### Budget View (Primary Screen)

**Mobile:**
```
┌──────────────────────────┐
│ ← Jun 2026 →    Rp 1.2M │  Month nav + Ready to Assign
├──────────────────────────┤
│ ▼ Needs                  │  Collapsible group
│ ┌──────────────────────┐ │
│ │ 🏠 Rent        2.5M  │ │  Category card
│ │ ■■■■■■■■■■ ✓ funded  │ │  Progress bar + status
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ 🛒 Groceries    320K │ │
│ │ ■■■■■■□□□□  64%      │ │
│ └──────────────────────┘ │
│ ...                      │
├──────────────────────────┤
│ ▼ Wants                  │  Another group
│ ...                      │
└──────────────────────────┘
```

- Groups are collapsible sections (tap header to fold)
- Each category is a card showing: icon + name + available amount
- Progress bar below (target progress, colored by status)
- Tap card → expand inline (show assigned/activity/available detail + edit)
- Long-press or swipe → quick actions (move budget, set target)
- Month nav: swipe horizontal or tap arrows

**Desktop (md+):**
- Restore the grid/table layout (columns: category, assigned, activity, available, target ring)
- Same as current but with Tailwind classes
- Use the tables R&D components (type system, sort, keyboard nav)

### Transactions View

**Mobile:**
```
┌──────────────────────────┐
│ 🔍 Filter...      All ▾  │  Search + account filter
├──────────────────────────┤
│ Today                    │
│ ┌──────────────────────┐ │
│ │ Indomaret    -45,000 │ │  Payee + amount
│ │ Groceries   ● cleared│ │  Category + status
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ Transfer → BCA  +1M  │ │
│ │ [transfer]  ● cleared│ │
│ └──────────────────────┘ │
│                          │
│ Yesterday                │
│ ...                      │
├──────────────────────────┤
│         [ + Add ]        │  FAB or bottom button
└──────────────────────────┘
```

- Grouped by date (Today, Yesterday, date headers)
- Card per transaction: payee + amount (top), category + cleared status (bottom)
- Tap card → expand to edit inline (same fields, EntityPicker for payee/category)
- Swipe left → delete (with undo toast)
- Pull-to-refresh → sync
- Amount colored: red = outflow, green = inflow/transfer-in

**Desktop (md+):**
- Table layout (sortable columns, inline editing, keyboard nav)
- Reuse tables R&D core (table-core.ts, types.ts)

### Accounts View

**Mobile:**
```
┌──────────────────────────┐
│ Total: Rp 15,450,000     │
├──────────────────────────┤
│ 💳 BCA Checking          │
│    Rp 8,200,000          │
│ 💰 Cash                  │
│    Rp 450,000            │
│ 🏦 Mandiri Savings       │
│    Rp 6,800,000          │
├──────────────────────────┤
│ Closed accounts (2)  ▾   │
└──────────────────────────┘
```

- Large cards with icon + name + balance
- Tap → shows transactions filtered to that account
- Drag to reorder

### Add/Edit Transaction (Mobile)

Full-screen sheet (not modal). Fields stacked vertically:

```
┌──────────────────────────┐
│ ✕ New Transaction    Save│
├──────────────────────────┤
│ Amount          -45,000  │  Large numpad-friendly input
│ Payee        [Indomaret] │  EntityPicker (full-screen sheet)
│ Category     [Groceries] │  EntityPicker (full-screen sheet)
│ Account      [BCA Check] │  Picker
│ Date         [Today    ] │  DatePicker
│ Memo         [optional ] │  Text
│ Cleared      [  ✓  ]    │  Toggle
└──────────────────────────┘
```

Key: pickers open as **full-screen sheets on mobile**, dropdowns on desktop. Same component, different presentation layer (`max-md:` = sheet, `md:` = dropdown).

## Sync Engine Port

The sync engine is the only non-mechanical port. Current Solid version:

```
createSyncStore(config)  → IndexedDB wrapper with table schemas
createReactiveLayer(raw) → signal-based change notifications
createSyncManager(opts)  → REST push + pull orchestration
```

React version:

```
useSyncStore(config)     → hook wrapping IndexedDB (same logic)
useReactiveQuery(table)  → returns data + subscribes to changes (replaces createQuery)
useSyncManager()         → starts sync on mount, returns status
```

The IndexedDB layer is framework-agnostic already (it's async functions over IDB). Only the reactive notification layer changes: Solid signals → Zustand store subscriptions or useSyncExternalStore.

## Pickers on Mobile

On mobile, pickers (payee, category, date, account) present as bottom sheets instead of floating dropdowns:

```
┌──────────────────────────┐
│                          │
│   (dimmed backdrop)      │
│                          │
├──────────────────────────┤
│ ┃  drag handle  ┃       │  Swipe down to close
│ 🔍 Search payee...      │
│ ─────────────────────── │
│ Payees                   │
│   Indomaret              │
│   Alfamart               │
│   PLN                    │
│   ...                    │
│ Transfer to              │
│   → BCA Checking         │
│   → Cash                 │
│ + New payee              │
└──────────────────────────┘
```

Same EntityPicker component, wrapped in a `<Sheet>` on mobile. The sheet pattern:
- Slides up from bottom
- Drag handle to dismiss
- Backdrop click to dismiss
- Keyboard stays open (search input auto-focused)
- Full viewport height minus safe area

## Offline Behavior

Same strategy as current (fire-and-forget), with better UX signals:

| State | Indicator | User sees |
|-------|-----------|-----------|
| Online + synced | Green dot | Nothing (quiet success) |
| Online + syncing | Blue pulse | "Saving..." in status bar |
| Offline | Yellow dot | "Offline — changes saved locally" |
| Error | Red flash | "Sync failed — will retry" toast |

Offline queue: IndexedDB writes succeed immediately. REST calls go to a queue. On reconnect, flush queue in order.

## Phase Plan

### Phase 1: Shell + Auth + Sync (Day 1-2)
- Vite + React + Tailwind + TanStack Router
- Tailwind config (Catppuccin Mocha tokens as CSS vars + Tailwind colors)
- Layout shell: bottom tabs (mobile) + sidebar (desktop)
- Port sync-engine to React hooks
- Auth flow (login, setup, session check)
- **Gate:** can login, IndexedDB loads, sync indicator works

### Phase 2: Budget View Mobile (Day 3-4)
- Month navigation (horizontal swipe/arrows)
- Group cards (collapsible)
- Category cards (icon, name, available, progress bar)
- Ready to Assign header
- Tap to expand → inline edit (assigned amount)
- Move Budget action (picker for from/to category)
- **Gate:** can view budget, assign money, see targets

### Phase 3: Transactions Mobile (Day 5-6)
- Transaction card list (grouped by date)
- Add transaction (full-screen form with pickers)
- Edit inline (tap to expand)
- Swipe to delete (with undo)
- Filter pills (account, category, date range)
- **Gate:** can add/edit/delete transactions, filters work

### Phase 4: Desktop Views (Day 7-8)
- Budget grid (table layout, tables R&D components)
- Transaction table (sortable, keyboard nav)
- Account sidebar
- Responsive breakpoint testing
- **Gate:** desktop matches current Solid version's functionality

### Phase 5: Polish + PWA (Day 9-10)
- PWA install prompt
- Offline queue visualization
- Transitions/animations (page transitions, card expand, sheet slide)
- Import (CSV) + Export (JSON)
- Scheduled transactions
- Settings page
- **Gate:** feature parity with current Solid version

## Ceiling Statement

This rewrite does NOT:
- Add multi-device sync (still push-only, no pull endpoint yet)
- Add multi-user support
- Change the backend at all
- Add new features — this is a 1:1 port with better mobile UX

The sync engine ceiling remains: "fresh browser login = empty until pull endpoint is implemented." This is an existing known gap carried forward, not introduced by the rewrite.

## File Structure

```
twenty-dollar-react/
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # Router + providers
│   ├── lib/
│   │   ├── sync-engine/           # Port of current sync (IndexedDB + REST)
│   │   │   ├── store.ts           # IDB wrapper
│   │   │   ├── sync-manager.ts    # Push/pull orchestrator
│   │   │   └── types.ts
│   │   ├── hooks/
│   │   │   ├── useStore.ts        # Zustand store
│   │   │   ├── useQuery.ts        # Reactive table query
│   │   │   ├── useBudget.ts       # computeBudget() + derived signals
│   │   │   └── useSync.ts         # Sync status + manager lifecycle
│   │   ├── budget-engine.ts       # Pure function (copy from Solid)
│   │   ├── format.ts              # Currency, date formatters
│   │   └── api.ts                 # REST client (fire-and-forget)
│   ├── components/
│   │   ├── Shell.tsx              # Layout (tabs + sidebar + outlet)
│   │   ├── BottomTabs.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Sheet.tsx              # Mobile bottom sheet primitive
│   │   ├── EntityPicker.tsx       # From tables R&D (adapted)
│   │   ├── DatePicker.tsx         # From tables R&D
│   │   ├── SyncIndicator.tsx
│   │   ├── Toast.tsx
│   │   └── ConfirmDialog.tsx
│   ├── views/
│   │   ├── budget/
│   │   │   ├── BudgetView.tsx     # Mobile: cards. Desktop: grid.
│   │   │   ├── CategoryCard.tsx
│   │   │   ├── BudgetGrid.tsx     # Desktop table (tables R&D)
│   │   │   └── MoveBudget.tsx
│   │   ├── transactions/
│   │   │   ├── TransactionsView.tsx
│   │   │   ├── TransactionCard.tsx
│   │   │   ├── TransactionForm.tsx
│   │   │   └── TransactionTable.tsx  # Desktop
│   │   ├── accounts/
│   │   │   ├── AccountsView.tsx
│   │   │   └── AccountCard.tsx
│   │   ├── import/
│   │   │   └── ImportView.tsx
│   │   ├── settings/
│   │   │   └── SettingsView.tsx
│   │   └── auth/
│   │       ├── LoginView.tsx
│   │       └── SetupView.tsx
│   └── styles/
│       └── tailwind.css           # @tailwind base/components/utilities + custom tokens
├── tailwind.config.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Open Questions

1. **TanStack Router vs react-router?** — TanStack is newer (🟧 tier) but type-safe and lighter. react-router is ⬛ but heavier. For a 5-page app either works. Lean TanStack for type safety.
2. **Zustand vs just React context?** — Zustand is simpler for the sync-engine bridge. Context causes unnecessary re-renders without careful memoization.
3. **Sheet library or roll own?** — vaul (drawer/sheet) is popular but small enough to build. Depends on how polished the gesture (drag-to-dismiss) needs to be.
4. **Framer Motion?** — adds 30KB. Tailwind `animate-*` + CSS transitions cover 90% of needs. Only add if page transitions or gesture animations feel janky.
5. **Keep same repo or new?** — New repo. Current repo has Rust backend + Solid frontend interleaved. New repo = frontend only, points at same backend API.
