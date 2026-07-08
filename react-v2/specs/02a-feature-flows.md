# Feature Spec: Twenty-Dollar React v2 — Flows & States

**Version**: 2.0  
**Date**: 2026-07-08  
**Depends on**: 01-prd.md (entities, behavior, constraints)

---

<!-- @feature:summary -->
## 1. Feature Summary

Derived from PRD entities and backend behavior. Features reference PRD entity names directly.

| ID | Feature | Core Entities |
|----|---------|---------------|
| F1 | Account Management | Account |
| F2 | Budget Grid | Assignment, BudgetMonth (computed), CategoryBudget (computed) |
| F3 | Transaction Ledger | Transaction, SplitEntry |
| F4 | Transfers | Transfer |
| F5 | Scheduled Transactions | Schedule |
| F6 | Import / Export | Transaction, ImportRule |
| F7 | Import Rules | ImportRule, Payee, Category |
| F8 | Category Management | Category, CategoryGroup, TargetType |
| F9 | Payee Management | Payee |
| F10 | Month Lock | BudgetMonth (lock state) |
| F11 | Undo | Undo (mutation log) |

**Cross-cutting concerns:**
- Offline-first: all writes go to IDB first, sync to Rust backend via SSE reconciliation
- Optimistic updates: MobX stores update immediately, rollback on sync failure
- All amounts in cents (integers); display formatting is presentation-only
- Single-tenant: no multi-user concerns

---

<!-- @feature:screens -->
## 2. Screen Inventory

TanStack Router file-based routes. Layout uses a persistent sidebar + main content area.

| Route Path | Screen | Zone | Entry Points |
|------------|--------|------|--------------|
| `/` | Redirect → `/budget` | — | App launch |
| `/budget` | Budget Grid | Main | Sidebar nav |
| `/budget/$month` | Budget Grid (specific month) | Main | Month nav arrows, URL direct |
| `/accounts` | All Accounts overview | Main | Sidebar nav |
| `/accounts/$accountId` | Account Ledger | Main | Sidebar account list, account card |
| `/accounts/$accountId/transactions` | Transaction list (filtered) | Main | Deep link |
| `/schedules` | Scheduled Transactions | Main | Sidebar nav |
| `/import` | CSV Import wizard | Modal overlay | Account menu action |
| `/settings` | Settings shell | Main | Sidebar bottom |
| `/settings/categories` | Category & Group management | Main | Settings nav |
| `/settings/payees` | Payee management | Main | Settings nav |
| `/settings/import-rules` | Import Rules management | Main | Settings nav |
| `/settings/export` | Export data | Main | Settings nav |

**Layout zones:**
- **Sidebar** (fixed, 240px): Account list with balances, nav links, net worth summary
- **Header bar**: Current month selector (budget), account name (ledger), breadcrumbs
- **Main content**: Route-dependent content area
- **Command palette** (overlay): Quick search/action via Cmd+K
- **Toast region** (bottom-right): Sonner notifications + undo toasts

---

<!-- @feature:flows -->
## 3. User Flows

### F1: Account Management

**Happy path — Create Account:**
1. User clicks "Add Account" in sidebar
2. Inline form appears: name, type (checking/savings/cash/credit)
3. User fills fields, presses Enter or clicks Save
4. Account appears in sidebar list with $0.00 balance
5. Toast confirms creation

**Happy path — Edit Account:**
1. User right-clicks account in sidebar → context menu → "Edit"
2. Inline edit mode activates (name becomes editable)
3. User modifies, presses Enter
4. Account updates, sidebar re-renders

**Abort:** Escape key or click-away cancels inline edit, restores previous value.

---

### F2: Budget Grid

**Happy path — Assign Money:**
1. User navigates to `/budget` (defaults to current month)
2. Grid shows CategoryGroups → Categories with columns: Assigned | Activity | Available
3. RTA (Ready to Assign) displays at top with colored indicator
4. User clicks Assigned cell for a category
5. Inline currency input activates (pre-filled with current value)
6. User types amount, presses Enter or Tab
7. Assignment saved, RTA recalculates, available updates
8. Undo toast appears (5s timeout)

**Happy path — Move Money:**
1. User clicks "Move Money" button or right-clicks a category → "Move to…"
2. Modal opens: from-category (pre-filled if initiated from context), to-category (searchable dropdown), amount
3. User fills and confirms
4. Both categories' Available updates; RTA unchanged
5. Undo toast appears

**Happy path — Navigate Months:**
1. Left/right arrows in header bar cycle months
2. Budget grid re-fetches/recomputes for selected month
3. Locked months show lock icon; Assigned cells become read-only

**Abort:** Escape closes Move Money modal without changes. Empty/zero assign is a no-op.

---

### F3: Transaction Ledger

**Happy path — Add Transaction:**
1. User is on `/accounts/$accountId`
2. Clicks "Add" button or presses `N` hotkey
3. New row appears at top of ledger in edit mode
4. Fields: date (today default), payee (autocomplete from Payees), category (dropdown), memo, amount (outflow/inflow toggle)
5. User fills minimum (date + amount), presses Enter
6. Transaction saved, account balance updates, budget activity recalculates
7. If payee matches ImportRule, category auto-fills

**Happy path — Edit Transaction:**
1. User clicks a transaction row → row enters edit mode (inline)
2. User modifies fields, presses Enter or clicks away
3. Transaction updates optimistically

**Happy path — Bulk Operations:**
1. User selects multiple rows via checkbox column (Shift+click for range)
2. Bulk action bar appears at top: Delete | Clear | Unclear | Categorize
3. User picks action (Categorize shows category picker)
4. Confirmation for delete (destructive); others apply immediately
5. Toast with count + undo

**Happy path — Split Transaction:**
1. User clicks split icon on a transaction row
2. Split editor opens below the row: list of sub-amounts with category pickers
3. User adds splits (amounts must sum to transaction total)
4. Save validates sum = parent amount, saves SplitEntry records

**Abort:** Escape cancels new/edit row. Invalid split sum shows inline error, blocks save.

---

### F4: Transfers

**Happy path:**
1. User clicks "Transfer" button (available from any account view)
2. Modal: from-account, to-account, date, amount, memo
3. Save creates Transfer entity (appears in both account ledgers as linked transactions)
4. Both account balances update

**Abort:** Escape or click-outside closes modal.

---

### F5: Scheduled Transactions

**Happy path — Create Schedule:**
1. User navigates to `/schedules`
2. Clicks "New Schedule"
3. Form: account, payee, category, amount, frequency (weekly/biweekly/monthly/yearly), next due date, end date (optional), auto-clear toggle
4. Save creates Schedule
5. Schedule appears in list with next-due indicator

**Happy path — Generate Due:**
1. On app load (or manual trigger), system checks for due schedules
2. Due schedules generate Transaction records automatically
3. Toast: "3 scheduled transactions posted"
4. Schedule.next_due advances

**Happy path — Pause/Resume:**
1. User toggles pause switch on a schedule row
2. Paused schedules skip generation until resumed

**Abort:** Delete schedule via context menu (with confirmation).

---

### F6: Import / Export

**Happy path — CSV Import:**
1. User opens Import from account context menu or `/import`
2. Selects target account
3. Drops/selects CSV file
4. Preview table shows parsed rows with column mapping
5. Import rules auto-fill payee/category where matched
6. User reviews, clicks "Import All" or selects subset
7. Transactions created, toast shows count
8. Duplicates detected by date+amount+payee hash (skipped with warning)

**Happy path — JSON Export:**
1. User navigates to `/settings/export`
2. Clicks "Export All Data"
3. Full JSON backup downloads (all entities)

**Abort:** Cancel on preview screen discards parsed data.

---

### F7: Import Rules

**Happy path:**
1. User navigates to `/settings/import-rules`
2. List of rules: token pattern → payee + category mapping
3. "Add Rule": token input (matched against transaction descriptions during import), payee dropdown, category dropdown
4. Save creates ImportRule
5. Future imports auto-apply matching rules

---

### F8: Category Management

**Happy path — Reorder:**
1. User navigates to `/settings/categories`
2. Drag-and-drop categories within groups or between groups
3. Drag groups to reorder groups
4. sort_order updates persist on drop

**Happy path — Set Target:**
1. User clicks target icon on a category
2. Target editor: type (monthly_spending | monthly_contribution | target_balance_by_date | target_balance), amount, date (if applicable)
3. Save updates category target
4. Budget grid shows target progress indicators

**Abort:** Escape closes target editor.

---

### F9: Payee Management

**Happy path:**
1. `/settings/payees` shows searchable list
2. Add/edit/merge payees
3. Payees with type="transfer" link to accounts (auto-created for transfers)

---

### F10: Month Lock

**Happy path:**
1. In budget grid header, user clicks lock icon for current month
2. Confirmation: "Lock June 2026? Assignments cannot be changed."
3. Locked month: Assigned cells read-only, move-money disabled for that month
4. Unlock reverses (same flow)

---

### F11: Undo

**Happy path:**
1. After any mutation (assign, transaction create/edit/delete, move money)
2. Toast appears: "[Action description] — Undo"
3. User clicks Undo within 5s → mutation reverses
4. Ctrl+Z also triggers undo of most recent undoable action

---

<!-- @feature:states -->
## 4. State Catalog

Component states reference PRD entity states. This catalogs UI states per screen/component, not entity definitions.

### Budget Grid States

| State | Condition | Visual |
|-------|-----------|--------|
| Loading | Month data computing | Skeleton rows |
| Empty | No categories exist | CTA: "Set up categories" |
| Normal | Categories with data | Full grid |
| Locked | Month is locked | Grey overlay on Assigned column, lock badge |
| Overspent | Category available < 0 | Red text, warning icon |
| Underfunded | Target exists, available < target needs | Yellow/orange indicator |
| Funded | Available ≥ target | Green indicator |
| RTA Positive | ready_to_assign > 0 | Green pill with amount |
| RTA Zero | ready_to_assign = 0 | Neutral pill |
| RTA Negative | ready_to_assign < 0 | Red pill, pulsing |

### Transaction Ledger States

| State | Condition | Visual |
|-------|-----------|--------|
| Loading | Fetching from IDB | Skeleton rows |
| Empty | No transactions in account | Illustration + CTA |
| Normal | Transactions loaded | Virtual-scrolled list |
| Editing | Row in edit mode | Expanded row with inputs |
| Selected | Checkbox(es) checked | Highlight + bulk bar |
| Uncleared | transaction.cleared = false | Dimmed/italic text |
| Split | transaction.splits.length > 0 | Expand arrow, nested rows |
| Filtered | Active date/category filter | Filter badge in header |

### Account Sidebar States

| State | Condition | Visual |
|-------|-----------|--------|
| Empty | No accounts | "Add your first account" CTA |
| Normal | Accounts loaded | List with names + balances |
| Active | Account route matches | Highlighted row |
| Negative Balance | computed balance < 0 | Red balance text |

### Schedule List States

| State | Condition | Visual |
|-------|-----------|--------|
| Empty | No schedules | CTA illustration |
| Normal | Schedules exist | List with next-due dates |
| Due | schedule.next_due ≤ today | Orange badge "Due" |
| Overdue | next_due < today by >1 day | Red badge "Overdue" |
| Paused | schedule.paused = true | Greyed row, "Paused" chip |

### Global App States

| State | Condition | Visual |
|-------|-----------|--------|
| Online | Backend reachable | No indicator (default) |
| Offline | Backend unreachable | Orange "Offline" chip in header |
| Syncing | Pending writes queuing | Spinner in header |
| Sync Error | Write failed to reconcile | Red dot on sync icon, expandable error |
| First Run | No accounts, no categories | Onboarding wizard flow |
