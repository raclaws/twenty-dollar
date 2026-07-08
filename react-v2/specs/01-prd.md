# Product Requirements Document: Twenty-Dollar React v2

> Envelope budget application — Solid.js to React rewrite (frontend only)

---

<!-- @prd:intent -->
## 1. Intent

### Problem Statement

Twenty-Dollar is a personal envelope-budgeting application currently on Solid.js. The rewrite to React 19 addresses:

1. **Ecosystem alignment** — React's larger ecosystem provides better long-term library support and community resources.
2. **Developer experience** — MobX 6 with React provides fine-grained reactivity with standard debugging tooling.
3. **Architecture cleanup** — enforce clean separation between pure budget engine, framework-agnostic sync layer, and UI components.

### Audience

- **Primary**: Individual users managing personal/household finances with envelope budgeting methodology.
- **Secondary**: Power users needing offline-first operation, multi-device sync, and bulk transaction management.

### Success Criteria

| Metric | Target |
|--------|--------|
| First Meaningful Paint | < 1.5s on 4G |
| Budget view interaction latency | < 50ms for assignment edits |
| Offline availability | Full CRUD without network |
| Data loss on page lifecycle events | Zero — all mutations persisted to IDB before acknowledgment |
| Sync conflict resolution | Last-write-wins with undo capability |
| Accessibility | WCAG 2.1 AA for all interactive elements |

### Constraints

- **Frontend only** — backend (Rust + Axum, port 3001) is out of scope
- **Stack locked** — React 19, TypeScript, MobX 6, IndexedDB (raw IDB), TanStack Router, Tailwind CSS v4, Vite 6, Sonner, Lucide React, date-fns, pdfjs-dist
- **Money representation** — all amounts in cents (integers), never floating point
- **Offline-first** — must function without server connectivity
- **SPA** — single-page application with client-side routing
- **Design system** — dark theme (Catppuccin Mocha custom dark+neon palette)

---

<!-- @prd:entities -->
## 2. Entities

### 2.1 Account [claude.md-ready]

| Attribute | Type | Constraints |
|-----------|------|-------------|
| id | string (UUID) | PK, immutable |
| name | string | required, 1-100 chars |
| type | enum | checking / savings / cash / credit |
| icon | string | emoji or icon key |
| sort_order | integer | >= 0, unique within active accounts |
| created_at | ISO timestamp | immutable |
| deleted_at | ISO timestamp / null | soft delete marker |

**Relationships**: Account has many Transactions. Account has zero-or-one Payee (for transfer representation).

**States**: active (deleted_at = null), closed (deleted_at set), reconciling (transient UI state during reconciliation flow).

**Invariants**: Name must be unique among active accounts. Closing an account soft-deletes; reopening nulls deleted_at.

---

### 2.2 Payee [claude.md-ready]

| Attribute | Type | Constraints |
|-----------|------|-------------|
| id | string (UUID) | PK, immutable |
| name | string | required, 1-200 chars |
| type | enum | external / account |
| account_id | string / null | FK to Account; required when type=account |
| created_at | ISO timestamp | immutable |

**Relationships**: Payee belongs to zero-or-one Account (transfer payees). Transaction references one Payee.

**States**: active (always — payees are not soft-deleted; orphaned payees remain for historical transactions).

**Invariants**: When type=account, account_id must reference a valid Account. Name must be unique across all payees.

---

### 2.3 CategoryGroup [claude.md-ready]

| Attribute | Type | Constraints |
|-----------|------|-------------|
| id | string (UUID) | PK, immutable |
| name | string | required, 1-100 chars |
| icon | string | emoji or icon key |
| sort_order | integer | >= 0, unique across groups |

**Relationships**: CategoryGroup has many Categories.

**States**: active (always — groups persist; empty groups are valid).

**Invariants**: Name must be unique. Deleting a group requires all child categories to be reassigned or deleted first.

---

### 2.4 Category [claude.md-ready]

| Attribute | Type | Constraints |
|-----------|------|-------------|
| id | string (UUID) | PK, immutable |
| group_id | string | FK to CategoryGroup, required |
| name | string | required, 1-100 chars |
| icon | string | emoji or icon key |
| sort_order | integer | >= 0, unique within group |
| target_type | enum / null | monthly / by_date / savings / null |
| target_amount | integer (cents) | >= 0; required when target_type is set |
| target_date | ISO date / null | required when target_type = by_date |

**Relationships**: Category belongs to one CategoryGroup. Category has many Transactions, SplitEntries, Assignments, and Schedules.

**States**: active, hidden (UI-only filter state — not persisted).

**Invariants**: Name unique within group. target_amount and target_date consistency enforced by target_type.

---

### 2.5 Transaction [claude.md-ready]

| Attribute | Type | Constraints |
|-----------|------|-------------|
| id | string (UUID) | PK, immutable |
| account_id | string | FK to Account, required |
| payee_id | string | FK to Payee, required |
| category_id | string / null | FK to Category; null for splits or uncategorized |
| date | ISO date | required |
| amount | integer (cents) | required; negative = outflow, positive = inflow |
| memo | string | 0-500 chars |
| cleared | integer | 0 = uncleared, 1 = cleared |
| linked_id | string / null | FK to Transaction; paired transfer partner |
| reconciled_at | ISO timestamp / null | set during reconciliation |
| schedule_id | string / null | FK to Schedule; auto-generated source |
| source | string | origin identifier (manual / import / schedule) |
| created_at | ISO timestamp | immutable |

**Relationships**: Transaction belongs to Account, Payee, and optionally Category. Transaction has many SplitEntries (when split). Transaction has zero-or-one linked Transaction (transfers).

**States**: uncleared (cleared=0), cleared (cleared=1), reconciled (reconciled_at set).

**Invariants**: If linked_id is set, the linked transaction must reference back (bidirectional). If SplitEntries exist, category_id must be null and sum of splits must equal transaction amount. Amount is always in cents.

---

### 2.6 SplitEntry [claude.md-ready]

| Attribute | Type | Constraints |
|-----------|------|-------------|
| id | string (UUID) | PK, immutable |
| transaction_id | string | FK to Transaction, required |
| category_id | string | FK to Category, required |
| amount | integer (cents) | required, non-zero |
| memo | string | 0-500 chars |

**Relationships**: SplitEntry belongs to one Transaction and one Category.

**States**: N/A (lifecycle tied to parent transaction).

**Invariants**: Sum of all SplitEntries for a transaction must equal the transaction amount. Minimum 2 entries for a split to be valid.

---

### 2.7 Assignment [claude.md-ready]

| Attribute | Type | Constraints |
|-----------|------|-------------|
| id | string (UUID) | PK, immutable |
| category_id | string | FK to Category, required |
| month | string | YYYY-MM format, required |
| amount | integer (cents) | required; can be negative (unassignment) |

**Relationships**: Assignment belongs to one Category.

**States**: N/A (immutable records — edits create new assignments or update in place).

**Invariants**: One assignment per category per month (upsert semantics). Month must be valid YYYY-MM.

---

### 2.8 Schedule [claude.md-ready]

| Attribute | Type | Constraints |
|-----------|------|-------------|
| id | string (UUID) | PK, immutable |
| account_id | string | FK to Account, required |
| category_id | string / null | FK to Category |
| payee | string | payee name (denormalized for flexibility) |
| amount | integer (cents) | required |
| memo | string | 0-500 chars |
| frequency | enum | weekly / biweekly / monthly / yearly |
| next_due | ISO date | required, computed on each generation |
| end_date | ISO date / null | null = indefinite |
| auto_clear | boolean | if true, generated transactions are pre-cleared |
| paused | boolean | if true, skip generation |
| created_at | ISO timestamp | immutable |

**Relationships**: Schedule belongs to Account. Schedule generates Transactions (via schedule_id FK).

**States**: active (paused=false, next_due <= end_date or no end_date), paused (paused=true), expired (next_due > end_date).

**Invariants**: next_due must advance by frequency after each generation. Generated transactions must carry schedule_id reference.

---

<!-- @prd:behavior -->
## 3. Behavior

### F1: Budget View

**Trigger**: User navigates to `/budget` or `/budget/:month` route.

**Input**: Current month (from URL or default to today's month), user interactions (assignment edits, category actions).

**Output**: Rendered budget grid showing category groups, categories with assigned/activity/available columns, target progress, and Ready to Assign (RTA) banner.

**Constraints**:
- Month navigator allows forward/backward month traversal
- Assignment editing is inline (click cell, type amount, Enter/Tab to confirm)
- All computations delegate to pure budget engine (F10)
- Category groups are collapsible with persistent state

**Edge Cases**:
- First month with no data: show zero state with all categories at $0.00
- Negative available: highlight in warning color (red/orange)
- Overfunded RTA (negative): show warning banner
- Large number of categories (50+): virtualize if scroll performance degrades

**Acceptance Criteria**:
1. Month navigator displays current month and allows prev/next navigation
2. Category groups render with expand/collapse, drag reorder
3. Inline assignment editing persists on Enter/Tab, cancels on Escape
4. Target progress bars show percentage toward goal
5. Health rings show category funding status (green/yellow/red)
6. RTA banner shows correct Ready to Assign amount
7. Cover/Move dialog allows transferring available between categories
8. Context menu on category: rename, set target, delete, move to group
9. Icon picker allows changing category/group icons
10. Budget filters: hide funded, hide zero, show overspent only

---

### F2: Transactions View

**Trigger**: User navigates to `/transactions` or `/accounts/:id/transactions`.

**Input**: Account filter (optional), user interactions (add, edit, select, bulk actions).

**Output**: Transaction table with inline editing, running balance, grouping.

**Constraints**:
- Add row pinned to top of table (always visible)
- Inline editing: click cell to edit, Tab to advance, Enter to save
- Running balance computed per-account (cleared + uncleared)
- Transfers display as single row with transfer indicator

**Edge Cases**:
- Empty account: show empty state with "Add transaction" prompt
- Split transaction display: show parent row with expand chevron
- Deleted payee/category references: show "(deleted)" placeholder
- Bulk select 500+ transactions: must remain responsive

**Acceptance Criteria**:
1. Table displays date, payee, category, memo, outflow, inflow, cleared columns
2. Add row allows quick transaction entry without modal
3. Grouping modes: by date (default), by payee, by category
4. Bulk selection via checkbox column + Shift+click range select
5. Bulk actions: categorize, clear, delete, approve
6. Context menu: edit, duplicate, split, make recurring, delete
7. Keyboard navigation: arrow keys between cells, Enter to edit
8. Account filter sidebar or dropdown filters to single account
9. Running balance column shows cumulative from oldest to newest
10. Transfer transactions show linked account name as payee indicator

---

### F3: Accounts View

**Trigger**: User navigates to `/accounts`.

**Input**: User interactions (create, rename, close, reopen, reconcile).

**Output**: Account cards with balances, organized by type.

**Constraints**:
- Cards grouped by account type (checking, savings, cash, credit)
- Balance shows cleared balance and working balance (cleared + uncleared)
- Closed accounts in collapsed section at bottom

**Edge Cases**:
- No accounts: show setup wizard or "Add first account" CTA
- Reconciliation with discrepancy: prompt user to create adjustment transaction
- Reopen closed account: move back to active section, restore sort_order

**Acceptance Criteria**:
1. Account cards display name, icon, type badge, cleared balance, working balance
2. Create account dialog with name, type, icon, opening balance
3. Rename via inline edit or context menu
4. Close account: soft-delete, move to closed section
5. Reopen: restore to active accounts
6. Reconcile flow: enter statement balance, mark transactions, resolve discrepancy
7. Click card navigates to `/accounts/:id/transactions` (filtered view)
8. Drag-to-reorder within type group
9. Closed accounts section is collapsible, hidden by default if empty

---

### F4: Scheduled Transactions

**Trigger**: App init (auto-generate due transactions), user creates/edits schedule.

**Input**: Schedule definition, frequency parameters, date range.

**Output**: Generated transactions on schedule, schedule management UI.

**Constraints**:
- On app initialization, generate all overdue scheduled transactions
- Generated transactions carry schedule_id for lineage tracking
- "Make Recurring" creates schedule from existing transaction template

**Edge Cases**:
- App offline for 30 days: generate all missed occurrences on reconnect
- Schedule with end_date in past: mark as expired, stop generating
- Paused schedule: skip generation but retain for future resume
- Frequency edge: monthly on Jan 31 — next is Feb 28 (last day of month)

**Acceptance Criteria**:
1. Schedule dialog allows setting: account, payee, category, amount, frequency, start date, end date
2. Frequency options: weekly, biweekly, monthly, yearly
3. Auto-generate on init: create transactions for all schedules where next_due <= today
4. Advance next_due by frequency after each generation
5. "Make Recurring" in transaction context menu pre-fills schedule from transaction
6. Auto-clear option: generated transactions start as cleared
7. Pause/resume toggle on schedule list
8. Schedule list shows upcoming, frequency, amount, last generated

---

### F5: Import View

**Trigger**: User navigates to `/import` or initiates import from account context.

**Input**: Pasted text, CSV file, or PDF bank statement.

**Output**: Parsed transactions ready for review, duplicate detection results.

**Constraints**:
- tx-parser pipeline handles format detection and field mapping
- pdfjs-dist extracts text from PDF statements
- Duplicate detection uses date + amount + payee fuzzy match
- Import rules allow auto-categorization based on payee patterns

**Edge Cases**:
- Malformed CSV: show parsing errors with line numbers
- PDF with no extractable text (scanned image): show error, suggest CSV
- Duplicate detection false positive: allow user override
- 1000+ transaction import: progressive loading with progress indicator

**Acceptance Criteria**:
1. Three input modes: paste text, upload CSV, upload PDF
2. Auto-detect field mapping (date, amount, payee, memo columns)
3. Manual field mapping override with column picker
4. Preview table shows parsed transactions with edit capability
5. Duplicate detection highlights potential matches with existing transactions
6. Import rules: if payee matches pattern, auto-assign category
7. Progressive reconciliation: mark imported as uncleared, user clears manually
8. Bulk approve/reject individual rows before final import
9. Import summary: X imported, Y skipped (duplicates), Z errors

---

### F6: Settings View

**Trigger**: User navigates to `/settings`.

**Input**: User preferences, export/import actions.

**Output**: Applied settings, exported JSON, imported data.

**Constraints**:
- Currency selection affects display formatting only (all storage remains cents)
- Export produces complete JSON snapshot of all entities
- Import validates JSON schema before applying

**Edge Cases**:
- Import with ID collisions: overwrite or skip strategy (user choice)
- Export of large dataset (10k+ transactions): stream to avoid memory pressure
- Currency with non-standard decimal places (JPY = 0 decimals)

**Acceptance Criteria**:
1. Currency picker with common currencies (USD, EUR, GBP, CAD, AUD, JPY)
2. Currency selection persists and updates all MoneyDisplay components
3. Export button generates JSON file download of all data
4. Import accepts JSON file with validation and preview
5. Import conflict resolution: overwrite / skip / cancel options
6. Settings persist to IDB (survive browser clear if IDB retained)

---

### F7: Auth

**Trigger**: App load (check auth state), user login/logout actions.

**Input**: Credentials (login), session token (validation).

**Output**: Authenticated session, cached auth state.

**Constraints**:
- Cookie-based sessions with backend
- Cached auth in localStorage for instant UI (validate in background)
- Background validation: if session expired, redirect to login
- Logout clears all local state (IDB, localStorage, memory)

**Edge Cases**:
- Stale localStorage cache with expired session: show app briefly, then redirect
- Network unavailable during validation: trust cache, queue validation for reconnect
- Multiple tabs: logout in one tab should propagate (storage event listener)

**Acceptance Criteria**:
1. Login view with credentials form
2. Setup view for first-time users (create account with backend)
3. Session cookie set by backend, validated on each app load
4. localStorage caches auth state for instant hydration
5. Background validation on focus/reconnect
6. Failed validation redirects to login (clear stale cache)
7. Logout clears: localStorage auth, IDB data, MobX stores, redirect to login
8. Cross-tab logout propagation via storage event

---

### F8: Shared Components

**Trigger**: Used by feature views as needed.

**Input**: Props/configuration per component contract.

**Output**: Rendered UI elements with consistent behavior.

**Constraints**:
- All components follow design system (F11)
- Accessibility: keyboard navigable, ARIA labels, focus management
- Components are MobX-observer wrapped where they consume store data

**Edge Cases**:
- EntityPicker with 500+ items: virtualized dropdown with search
- ContextMenu near viewport edge: reposition to stay visible
- Toast queue: max 3 visible, oldest auto-dismiss after 5s

**Acceptance Criteria**:
1. EntityPicker: searchable dropdown for Account/Payee/Category selection
2. IconPicker: grid of available icons with search
3. ConfirmDialog: modal with message, confirm/cancel buttons
4. DetailDialog: slide-over panel for entity details
5. MoneyDisplay: formatted currency display respecting user's currency setting
6. Toast/Undo: Sonner-based notifications with undo action for destructive operations
7. SyncIndicator: connection status badge (synced/syncing/offline)
8. HealthRing: SVG ring showing category funding percentage
9. Badge: label with color variants (status indicators)
10. AmountInput: cents-aware input with auto-formatting (type "1234" shows "$12.34")
11. ContextMenu: right-click or long-press menu with icon + label items

---

### F9: Data Layer

**Trigger**: App initialization, user mutations, server sync events.

**Input**: User actions, SSE events, IDB hydration.

**Output**: Consistent in-memory state, persisted IDB, queued mutations.

**Constraints**:
- SyncStore: IDB as persistence, in-memory Map as read path
- MobX stores wrap SyncStore with observable maps and computed values
- SyncManager handles hydrate from IDB on init, SSE for live sync
- Undo/Redo: 50-entry stack, Ctrl+Z / Ctrl+Y (Cmd on Mac)

**Edge Cases**:
- IDB corruption: detect via version check, offer full re-sync from server
- SSE disconnect: exponential backoff reconnect, queue mutations offline
- Concurrent edits: last-write-wins with undo available for overwritten local change
- Page frozen (tab backgrounded): on resume, flush pending mutations, reconnect SSE
- IDB quota exceeded: show warning, suggest export + clear old data

**Acceptance Criteria**:
1. SyncStore provides get/set/delete with immediate in-memory update + async IDB write
2. MobX store layer exposes observable maps per entity type
3. Computed values (balances, budget calculations) auto-update on data change
4. Hydration: on app init, load all IDB data into memory maps
5. SSE listener applies remote changes to local store (merge, not replace)
6. Offline queue: mutations stored in IDB, replayed on reconnect in order
7. Undo/Redo: 50-entry circular buffer, keyboard shortcuts, works across entity types
8. Page lifecycle: visibilitychange + freeze events flush pending writes to IDB

---

### F10: Budget Engine

**Trigger**: Called by Budget View (F1) and any component needing budget computations.

**Input**: Assignments, Transactions, Categories (for a given month).

**Output**: BudgetMonth object with per-category computed values.

**Constraints**:
- Pure module: no MobX imports, no React imports, no side effects
- Input/output are plain objects/arrays
- All money in cents (integers)
- Must be independently testable without any framework

**Edge Cases**:
- Category with no assignments and no activity: available = carried forward from prior month
- Overspent category: negative available carries forward as reduced RTA next month
- Credit card category: activity is payment, not spending (inverted sign logic)
- Split transaction: each split's amount contributes to its respective category

**Acceptance Criteria**:
1. computeBudget(month, assignments, transactions, categories) returns BudgetMonth
2. BudgetMonth contains per-category: assigned, activity, available
3. RTA calculation: total income - total assigned across all categories for current month
4. Available = prior month carryover + assigned + activity
5. Overspent handling: negative available in prior month reduces current month RTA
6. Target computations: monthly (need X/month), by_date (need X total by date), savings (accumulate toward X)
7. Activity = sum of transaction amounts for category in month (including splits)
8. Function is pure — same inputs always produce same outputs, no global state

---

### F11: Design System

**Trigger**: Applied globally via CSS custom properties and Tailwind configuration.

**Input**: Design tokens (colors, typography, spacing, borders).

**Output**: Consistent visual language across all views.

**Constraints**:
- Dark theme: Catppuccin Mocha base with custom neon accents
- Typography: Figtree (UI text), JetBrains Mono (numbers/code)
- CSS custom properties for all tokens (enables future theming)
- Sharp corners (no border-radius except explicit pill buttons)
- Flat table rows (no zebra striping, subtle borders)

**Edge Cases**:
- High contrast mode: ensure sufficient contrast ratios (4.5:1 minimum)
- Very long category names: truncate with ellipsis, full name on hover
- Mobile viewport: responsive but desktop-first (budget app is primarily desktop)

**Acceptance Criteria**:
1. CSS custom properties defined for: surface, text, accent, warning, success, error colors
2. Tailwind config extends default theme with custom palette
3. Figtree loaded for body text, JetBrains Mono for numeric/monospace contexts
4. All interactive elements have visible focus indicators
5. Sharp corners on cards, inputs, buttons (border-radius: 0 or 2px max)
6. Table rows: flat with 1px border-bottom, no alternating backgrounds
7. Neon accent colors for: primary actions, active states, selected items
8. Consistent spacing scale: 4px base unit (4, 8, 12, 16, 24, 32, 48, 64)

---

<!-- @prd:first-principles -->
## 4. First-Principles Analysis

### Entity Decomposition Rationale

**Why 8 entities (not fewer)?**

The entity model maps directly to envelope budgeting's conceptual model:

1. **Account/Payee separation** — Accounts are containers for money; Payees are counterparties. A transfer creates a Payee of type "account" pointing back. This avoids overloading Account with payee semantics while maintaining the UX pattern of "Transfer to: Savings" appearing in the payee field.

2. **CategoryGroup/Category split** — Groups exist purely for organizational hierarchy. Flattening into a single Category with parent_id was considered but rejected: groups have no budget semantics (no assignments, no targets), so a separate entity avoids null-heavy rows and simplifies the budget engine interface.

3. **SplitEntry as separate entity** — Split transactions could embed splits as a JSON array in Transaction. Separate entity chosen because: (a) splits need independent category FK for budget calculations, (b) query patterns need "all activity for category X" which requires flat access, (c) avoids JSON parsing overhead on every budget computation.

4. **Assignment as entity (not embedded in Category)** — Assignments are per-month records. Embedding in Category would require a map/array per category growing unboundedly. Separate entity enables: efficient month-range queries, undo granularity, sync granularity.

5. **Schedule as standalone** — Schedules are templates, not transactions. They generate transactions but have independent lifecycle (pause, edit frequency, set end date). Coupling to Transaction would conflate template with instance.

### Load-Bearing Decisions

| Decision | Rationale | Risk if Changed |
|----------|-----------|-----------------|
| Cents integers for money | Eliminates floating-point precision bugs | Requires consistent formatting layer |
| In-memory Map as read path | O(1) reads, MobX can observe Map | Memory bounded by dataset size (~10MB for 50k transactions) |
| IDB as persistence (not localStorage) | Structured data, async, no 5MB limit | More complex API than localStorage |
| MobX over React state | Fine-grained re-renders, computed caching | Learning curve, bundle size (+15KB) |
| Pure budget engine | Testable, portable, no framework coupling | Must marshall data in/out (no direct store access) |
| Paired transactions for transfers | Each account sees its side of transfer | Must maintain bidirectional consistency |
| Soft delete for accounts | Preserves transaction history references | Must filter in all account queries |
| Last-write-wins sync | Simple, no conflict resolution UI needed | Can lose concurrent edits (mitigated by undo) |

### Alternatives Considered

1. **SQLite in browser (via OPFS/wa-sqlite)** — Rejected: adds WASM bundle (~500KB), complicates sync, IDB with in-memory map achieves same read performance for this dataset size.

2. **React Query / TanStack Query for server state** — Rejected: offline-first with IDB means local store IS the source of truth. TanStack Query's cache invalidation model doesn't fit "local-first, sync later."

3. **Zustand instead of MobX** — Rejected: MobX's computed values and fine-grained reactivity map better to budget calculations that depend on many entities. Zustand would require manual memoization.

4. **File-system-based storage (OPFS)** — Rejected: no query capability, would require custom indexing. IDB provides indexed access patterns out of the box.

5. **Immer for immutability** — Rejected: MobX observables already provide change tracking. Adding Immer creates double-tracking overhead.

---

<!-- @prd:resolution -->
## 5. Resolution Surface

### C-Dimension Decisions

| Dimension | Resolution | Justification |
|-----------|-----------|---------------|
| **Offline** | IN SCOPE | Offline-first is core architecture. App must provide full CRUD without network. IDB stores all data locally; mutation queue replays on reconnect. |
| **Page lifecycle** | IN SCOPE | IDB + mutation queue must survive frozen/terminated states. visibilitychange and freeze event handlers flush pending writes. On resume, reconnect SSE and replay queue. |
| **Browser cache** | ACCEPTED RISK | SPA with IDB — static assets are the only cached resources. Vite handles cache busting via content hashes in filenames. Data is never in HTTP cache. |

### Ambiguity Register

#### [OPEN: Conflict resolution granularity]
Last-write-wins is defined at entity level. Open question: should field-level merging be attempted (e.g., two tabs edit different fields of same transaction)? Current resolution: entity-level LWW is sufficient for single-user app. Revisit if multi-user collaboration is added.

#### [OPEN: Maximum offline duration]
No defined limit on how long the app can operate offline. Mutation queue grows unboundedly. Should there be a warning at N pending mutations? Suggested: warn at 100 pending, hard limit at 1000 with forced sync prompt.

#### [ASSUMED: Single-user per browser]
Auth model assumes one user per browser context. Multiple users would require IDB namespacing by user_id. Current design uses a single IDB database without user scoping.

#### [ASSUMED: Backend API contract stable]
This spec assumes the Rust+Axum backend (port 3001) exposes REST endpoints for CRUD and SSE for sync. Specific endpoint shapes are not defined here — the sync layer adapts to whatever the backend provides.

#### [ASSUMED: Dataset size bounded]
Memory model assumes datasets fit in browser memory (~50K transactions, ~500 categories, ~100 accounts). For typical personal finance use, this covers 10+ years of daily transactions.

#### [BLOCKING: None]
No blocking dependencies identified. Frontend can be developed against mock API / IDB-only mode with sync disabled.

### Non-Functional Requirements

| Requirement | Target | Measurement |
|-------------|--------|-------------|
| Bundle size (gzipped) | < 200KB initial, < 400KB total | Vite build output |
| Time to Interactive | < 2s on 4G | Lighthouse |
| IDB hydration | < 500ms for 10K entities | Performance.mark timing |
| Memory ceiling | < 100MB for 50K transactions | DevTools heap snapshot |
| Accessibility | WCAG 2.1 AA | axe-core automated + manual screen reader testing |
| Browser support | Chrome 100+, Firefox 100+, Safari 16+ | Manual verification matrix |

---

*End of PRD — twenty-dollar react-v2*
