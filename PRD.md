# PRD: 20 Dollar is Expensive

**Version**: 2.0 (Unified Entity Model)
**Date**: 2026-06-29
**Status**: Complete specification — unified Transaction-anchored model with Payee entity, no separate Transfers table

---

## Layer 1 — Intent

"20 Dollar is Expensive" exists because consumer budgeting software falls into two traps: either it automates categorization and removes the user from the decision loop (Mint, Copilot), or it charges a monthly subscription that contradicts the philosophy it preaches (YNAB at $14.99/month). This app takes the position that budgeting is a manual, intentional act — every dollar gets a job assigned by the user, not by an algorithm — and that the tool itself should cost nothing to run once deployed.

The target user is someone who has tried YNAB's methodology and believes in envelope budgeting but wants ownership of their data, offline-first reliability, and zero recurring cost. They are comfortable self-hosting a backend but expect a polished, fast PWA frontend that feels like a native spreadsheet app.

Success looks like: a single user can manage their full financial lifecycle — accounts, transactions, categorized spending, monthly envelope allocation, transfers, reconciliation — without ever leaving the app or reaching for a spreadsheet. Every interaction completes in under 100ms perceived latency. The app works fully offline and syncs when connectivity returns. No data is lost if the browser crashes mid-edit.

**Constraints:**
- Single-tenant, self-hosted (one user per deployment)
- No third-party bank integrations (manual transaction entry only)
- No recurring subscription or cloud dependency
- PWA-installable, works on mobile viewport
- All amounts stored as integers (cents) — no floating point money

---

## Layer 2 — Entities

### Anchor Entity

**Transaction** — The atomic unit of financial truth. Every other entity exists to contain, label, plan against, or derive from Transactions. A Transaction records that money moved — the amount, when, who, and optionally why.
- Has: account_id, payee_id, category_id (nullable), date, amount (integer cents, negative = outflow, positive = inflow), memo (nullable), cleared (0 | 1), reconciled_at (nullable ISO timestamp), linked_id (nullable — points to mirror transaction for transfers), created_at
- Relationships:
  - belongs to exactly one **Account** (the "where")
  - belongs to exactly one **Payee** (the "who")
  - optionally belongs to one **Category** (the "why" — null means income or transfer)
  - has zero or more **SplitEntries** (when split, category_id on parent is null)
  - optionally linked to one other **Transaction** via linked_id (transfer pair)
- States: uncleared (default) → cleared (user-confirmed) → reconciled (matched to bank statement)
- Constraints: Amount stored as integer cents. A Transaction with SplitEntries must have category_id = null on the parent. When linked_id is set, the linked transaction must have its linked_id pointing back (bidirectional).
- Transfer semantics: When a Transaction's payee has `account_id` set, the system auto-creates a mirror Transaction in the linked account (opposite amount, same date/memo, linked_id pointing to each other). Editing one side propagates date/amount/memo to the mirror. Deleting one side deletes the mirror.
- Derivation surface: Account balance, Category activity, Budget available, RTA — all computed by aggregating Transactions. Transaction is the single source of financial truth.

### Dependent Entities (exist to organize or extend Transactions)

**Account** — A grouping container that answers "where does this money live?" Every Transaction must belong to one Account.
- Has: name, type (checking | savings | cash | credit), sort_order, created_at, deleted_at (soft-delete)
- Relationships: An Account has zero or more Transactions. An Account auto-generates a corresponding Payee record (type = 'account').
- States: active (deleted_at is null), deleted (deleted_at is set)
- Constraints: Cannot be deleted while Transactions exist (delete guard — protects anchor integrity). Name must be unique among active Accounts.
- Derived values: balance = sum of all Transaction amounts in this Account

**Payee** — An entity that money flows to or from. Answers "who is on the other side of this transaction?"
- Has: name, type ('external' | 'account'), account_id (nullable — set when type = 'account'), created_at
- Relationships: A Payee has zero or more Transactions. When type = 'account', references exactly one Account.
- Constraints: Name must be unique among active Payees. When type = 'account', the corresponding Account must exist.
- Auto-creation: Every Account automatically gets a Payee record (type = 'account', account_id = the account's id). External payees are created explicitly by the user or auto-registered on first transaction entry.
- Role: Payee is the "who" dimension of every Transaction. It enables: spending-per-payee reports, recurring payee detection, payee-default-category mapping, and the unified transfer model (transfer = transaction where payee.type is 'account').

**SplitEntry** — A sub-allocation that distributes a single Transaction's amount across multiple Categories. Exists only as a child of a Transaction.
- Has: transaction_id, category_id, amount (integer cents), memo (nullable)
- Relationships: belongs to exactly one Transaction, belongs to exactly one Category
- Constraints: Sum of SplitEntry amounts must equal parent Transaction amount. Each SplitEntry must have a Category. Parent Transaction's category_id must be null when splits exist.

### Labeling Entities (exist to classify Transactions for budgeting)

**CategoryGroup** — An organizational container that groups related Categories for display hierarchy.
- Has: name, sort_order
- Relationships: has one or more Categories
- Constraints: Cannot be deleted while Categories exist (delete guard). Name should be unique.

**Category** — An envelope label. Answers "why was this money spent?" Applied to Transactions (or SplitEntries) to enable budget tracking.
- Has: group_id, name, sort_order, target_type (nullable), target_amount (nullable), target_date (nullable)
- Relationships: belongs to exactly one CategoryGroup. Referenced by zero or more Transactions. Referenced by zero or more SplitEntries. Has zero or more Assignments.
- Constraints: Cannot be deleted while Transactions reference it (delete guard — protects anchor integrity). Name must be unique within its CategoryGroup.

### Planning Entity (intention layer over Transactions)

**Assignment** — A budget allocation: the user's intention of how much money a Category should have for a given month. The gap between Assignment (plan) and Transaction activity (reality) is the core tension the app surfaces.
- Has: category_id, month (YYYY-MM format), amount (integer cents)
- Relationships: belongs to exactly one Category
- Constraints: One Assignment per Category per month (upsert semantics). Amount can be positive (funding) or zero (explicit zero allocation).
- Role: Assignment is pure intention. It does not move money. It sets the benchmark against which Transaction activity is measured.

### Computed Concepts (derived from Transactions + Assignments — never persisted)

**BudgetMonth** — The computed budget state for a given month. Pure function of (Transactions, SplitEntries, Assignments, Categories, CategoryGroups, month).
- Derived from: all Assignments up to and including this month, all Transactions up to end of this month
- Contains: Ready to Assign (RTA), list of BudgetGroups with CategoryBudgets
- Recomputes on: any Transaction/Assignment/Category mutation, month navigation

**CategoryBudget** — Computed state for one Category in one month. The intersection of plan (Assignment) and reality (Transactions).
- assigned: Assignment amount for this specific month
- activity: sum of Transaction amounts in this Category for this specific month
- available: cumulative assigned + cumulative activity (all time up to this month end)
- Indicators:
  - overspent: available < 0 (spent more than planned — needs attention)
  - underfunded: available > 0, assigned = 0 (has leftover but no active plan)
  - funded: available > 0, assigned > 0 (healthy — plan and reality aligned)
  - neutral: available = 0 (zero balance, neither over nor under)

**Ready to Assign (RTA)** — Total unallocated income. The money that exists (via Transactions) but has no job yet (no Assignment).
- Formula: sum of all income Transactions (positive amount, null category_id, date ≤ month end) minus sum of all Assignment amounts (month ≤ current month)
- Indicator states: zero (fully allocated — ideal), positive (money to assign), negative (over-assigned)
- Conceptual role: RTA is the bridge between Transaction reality and Assignment intention. When RTA = 0, every dollar has a job.

**Account Balance** — Sum of all Transaction amounts belonging to an Account. Pure derivation, never stored.

### Entity Dependency Graph

```
Transaction (anchor — ground truth)
├── Account (where — container)
├── Payee (who — the other party)
│   └── account_id? (when payee IS an account → transfer semantics)
├── Category (why — label)
│   └── CategoryGroup (display grouping)
├── SplitEntry (subdivision of a Transaction across Categories)
├── linked_id → Transaction (mirror — transfer pair)
└── Assignment (plan — intention per Category per month)
     └── Category (what the plan targets)

All derived values flow FROM Transaction:
  Transaction → Account Balance
  Transaction → Category Activity
  Transaction + Assignment → CategoryBudget (available)
  Transaction + Assignment → RTA
  Transaction (where payee.type = 'account') → Transfer (no special table, just linked pairs)
```

### Infrastructure

**SyncEngine** — The offline-first data layer.
- Stores: all entity tables in IndexedDB
- Behavior: optimistic write to local store → fire API call → rollback on failure
- Reactive layer: table-level signal notifications trigger UI re-renders
- Hydration: on startup, pulls all data from REST API into IndexedDB

**UndoStack** — Global undo/redo state.
- Stores: ordered list of {description, undo(), redo()} entries
- Behavior: Ctrl+Z triggers undo, Ctrl+Shift+Z triggers redo, toast shows action description with undo button
- Constraints: busy guard prevents concurrent undo/redo execution

---

## Layer 3 — Behavior

### F1: Account Management [claude.md-ready]

**Trigger**: User navigates to Settings view, or selects an Account in the sidebar.

**Create Account**
- Input: name (text, required, unique among active), type (select: checking | savings | cash | credit)
- Output: New Account record persisted. Appears in sidebar with $0.00 balance.
- Constraints: Name cannot be empty. Name cannot duplicate an existing active Account (case-insensitive). Validation error shown inline.
- Edge cases:
  - Empty name → inline error "Account name is required"
  - Duplicate name → inline error "Account '[name]' already exists"
  - API failure → optimistic record rolled back, Account disappears
- Acceptance criteria:
  - Account appears in sidebar within 16ms of creation
  - Running balance shows $0.00 for new Account
  - Undo restores previous state (Account removed)

**Delete Account**
- Trigger: Delete button on Account row in Settings
- Input: Account ID
- Constraints: If Account has Transactions, show blocking dialog: "Cannot delete '[name]' — it has N transactions. Move or delete them first." with OK button only. If Account has zero Transactions, show confirm dialog: "Delete '[name]'?" with "Delete Account" danger button.
- Output: Account record removed from store.
- Edge cases:
  - Account with 1+ Transactions → blocked, informational dialog, no deletion
  - Account with 0 Transactions → confirm, then delete
  - API failure → rollback, Account reappears
- Acceptance criteria:
  - Delete guard prevents orphaning Transactions
  - Confirm dialog uses custom ConfirmDialog (never native confirm())
  - Undo re-creates the Account

### F2: Transaction Entry [claude.md-ready]

**Trigger**: User is viewing a specific Account (not "All Accounts" view).

**Add Transaction (inline form)**
- Input: date (date picker, defaults to today), payee (EntityPicker — searchable dropdown of known payees + accounts, with "+ New payee" create option), category (EntityPicker — nested by group with per-group create, optional), memo (icon cell — click to open long-text popup), sign toggle (−/+, default: outflow), amount (positive number, required)
- Output: New Transaction record with computed signed amount (negative if outflow, positive if inflow). If payee has type = 'account', a mirror Transaction is auto-created (transfer semantics).
- Constraints:
  - Date is required
  - Amount is required, must be > 0, parsed to cents
  - If split mode: sum of SplitEntry amounts must equal Transaction amount; all splits need a category and valid amount
  - Category select includes all Categories grouped by CategoryGroup, plus "+ Create new category" option
- Edge cases:
  - Amount "0" → validation error "Amount cannot be zero"
  - Empty amount → validation error "Amount is required"
  - Non-numeric amount → validation error "Invalid number"
  - Split total ≠ parent → validation error with expected total
  - "+ Create new category" selected → inline form appears for new Category name, Enter creates it in first group (or auto-creates "General" group if none exist)
  - API failure → Transaction and all SplitEntries rolled back
- Acceptance criteria:
  - Transaction appears in list immediately (optimistic)
  - Running balances update instantly
  - Form resets after successful submission
  - Undo removes the Transaction and all associated SplitEntries

**Split Transaction**
- Trigger: "Split" button toggles split mode on AddTransactionRow
- Input: Array of {category, amount, memo} lines
- Output: Parent Transaction (category_id = null) + N SplitEntry records
- Constraints: All splits must have a category. All splits must have a valid amount. Sum must equal parent amount.
- Edge cases:
  - Single split line with amount matching parent → allowed (functionally same as non-split)
  - User toggles back to "Single" mode → splits cleared, regular category select reappears

### F3: Transaction Inline Editing (Per-Cell) [claude.md-ready]

**Trigger**: User clicks on a specific cell in a Transaction row.

**Cell Edit Behavior**
- Input: Click on any editable cell (date, payee, category, memo, amount)
- Output: Only the clicked cell enters edit mode. Other cells remain in display mode.
- Constraints:
  - Only one cell editable at a time per row
  - Only one row editable at a time in the table
  - Escape cancels edit, restores original value
  - Enter or blur commits the change (Ctrl+Enter for textarea/memo)
  - Tab moves to next editable cell in the row (order: date → payee → category → amount)
- Cell types and their edit modes:
  - Date: opens date picker via showPicker() on first click
  - Payee: opens EntityPicker (sections: known payees + accounts for transfer)
  - Category: opens EntityPicker (nested by group, per-group create, + New Group)
  - Memo: icon cell — click opens long-text popup with textarea
  - Amount: inline number input with sign toggle (±)
- Transfer transactions: date/amount/memo editable (propagates to mirror), payee editable (changes transfer destination), category locked
- Implementation pattern: `ref` + direct DOM event listeners (addEventListener), NOT Solid's `onInput` JSX prop (unreliable in Vite build with event delegation)
- Edge cases:
  - Click on different cell while one is editing → commit current, open new
  - Click outside row while editing → commit current
  - Invalid value on commit (e.g., non-numeric amount) → revert to original, no save
  - Category cell → renders as dropdown select on edit
  - Amount cell → renders with sign toggle + positive number input
  - Date cell → renders as date input
- Acceptance criteria:
  - Clicking a cell transitions only that cell to edit mode within 16ms
  - No row expansion or layout shift when entering edit mode
  - Commit triggers optimistic update + API PATCH + undo entry
  - Pattern matches proven AssignedCell implementation

**Cleared Toggle**
- Trigger: Click on cleared checkbox (leftmost column)
- Input: Click event (stopPropagation — does not trigger row edit)
- Output: Toggled cleared state (0 ↔ 1)
- Constraints: Does not enter cell-edit mode. Independent of row editing.

**Reconciled Toggle**
- Trigger: Available in row edit mode (second row of edit UI) or context menu
- Output: Sets reconciled_at to current ISO timestamp, or null if un-reconciling

### F4: Transaction List Display [claude.md-ready]

**Trigger**: User selects an Account in the sidebar, or views "All Accounts."

**Virtual Scroll**
- Renders only visible rows (36px height each) plus buffer of 5 above/below
- Total height calculated from full transaction count
- Scroll position tracked via container ref

**Columns**: Cleared (checkbox) | Date | Account (only in All Accounts view) | Payee (resolved name from payee_id) | Category (resolved name, or muted "Transfer" for transfer transactions) | Memo (icon cell — empty/filled state) | Amount (colored) | Running Balance

**Running Balance**: Computed bottom-up — chronologically earliest transaction starts at its amount, each subsequent adds to running total. Displayed per-row.

**Sort Order**: Default oldest-first (ascending). Sortable columns: Date, Payee (A-Z), Amount. Click header to toggle direction. Active sort shows ↑/↓ indicator.

**Category Filter**: Category header is filterable — click opens multi-select checkbox dropdown. Active filter shows count badge.

**Account Filter**: When specific Account selected, only that Account's Transactions shown. When "All Accounts" selected, all Transactions shown with Account column visible.

**Context Menu**: Right-click on row shows: Edit | Toggle Cleared | (separator) | Delete (danger). For transfer transactions, Delete removes both linked transactions.

**Cell Type Affordances (global standard)**:
- `.cell--text` / `.cell--number`: dashed underline on individual cell hover, cursor: text
- `.cell--select`: dashed underline on cell hover + permanent subtle ▾ chevron
- `.cell--computed`: no interaction signal, cursor: default
- `.cell--memo`: icon cell (comment icon, empty/filled state, click opens popup)
- Transfer rows: date/amount/memo are editable (route writes to both linked transactions), payee shows account name (editable — changes transfer destination), category is locked as "Transfer"

- Edge cases:
  - Zero transactions → empty state message
  - All Accounts with no account selected → AddTransactionRow hidden (cannot create without knowing which Account)
  - Transaction with null category_id → Category column shows empty string
  - Transaction with category_id not found in local store → shows empty (not UUID)
- Acceptance criteria:
  - 10,000 transactions render without jank (virtual scroll)
  - Category shows human name, never UUID
  - Account column appears/hides based on view mode
  - Running balances are correct and update when any Transaction changes

### F5: Budget Allocation [claude.md-ready]

**Trigger**: User navigates to Budget view (default/home route).

**Month Context**
- Global month signal (YYYY-MM format), shared across all views
- MonthNavigator in top bar: ← [Month Year] →
- Default: current calendar month
- Changing month recalculates entire BudgetMonth

**Ready to Assign (RTA) Banner**
- Displays: amount and contextual message
- States:
  - Zero (green): "All money assigned!" — ideal state
  - Positive (yellow): "$X.XX to assign" — money available
  - Negative (red): "$X.XX over-assigned" — overspent total budget
- Position: top bar, right-aligned next to month navigator

**Budget Grid**
- Columns: Category Name | Assigned | Activity | Available
- Grouped by CategoryGroup with collapsible headers
- CategoryGroup header shows: group name + aggregated assigned/activity/available + action buttons (rename, delete)

**Assign Money to Category (AssignedCell)**
- Trigger: Click on Assigned column cell for any Category
- Input: Click shows inline number input, pre-filled with current assignment (in dollars)
- Output: Assignment record created or updated for this Category + month
- Behavior:
  - Focus + select-all on mount
  - Enter or blur commits
  - Escape cancels
  - Uses `ref` + direct DOM addEventListener pattern
- Constraints: Amount stored as integer cents. Blank input treated as 0.
- Edge cases:
  - First assignment for this category+month → creates new Assignment record
  - Existing assignment → updates amount via upsert
  - API failure → rollback to previous amount
  - Setting to 0 → keeps Assignment record with amount=0 (not deleted)
- Acceptance criteria:
  - Value updates RTA immediately on commit
  - Available column recalculates immediately
  - Undo restores previous assignment value

**Budget Indicators (Available column)**
- Overspent (available < 0): red badge, "Overspent" label
- Underfunded (available > 0, assigned = 0): yellow state, "Underfunded" label
- Funded (available > 0, assigned > 0): green badge, no label
- Neutral (available = 0): default text, no badge

**Move Money Between Categories**
- Trigger: "Move Money" button in Budget top bar
- Input: From category (select), To category (select), Amount (positive number)
- Output: Decreases From's Assignment, increases To's Assignment for current month
- Constraints:
  - Requires ≥2 Categories to exist (button disabled otherwise)
  - From and To must be different categories
  - Amount must be > 0
  - From category's current assignment must be ≥ amount (validation)
- Edge cases:
  - Moving more than From has assigned → validation error
  - Only 1 category exists → Move Money button hidden/disabled
  - From category changes via dropdown → reset amount field
- Acceptance criteria:
  - Both categories' Assigned and Available update immediately
  - RTA unchanged (zero-sum operation)
  - Undo reverts both assignments atomically

### F6: Category & Group Management [claude.md-ready]

**Create CategoryGroup**
- Trigger: "Add Group" button below budget grid
- Input: name (inline form, required)
- Output: New CategoryGroup with sort_order = last
- Constraints: Name required. Delete guard when Categories exist.

**Create Category**
- Trigger: "+" button on CategoryGroup header row
- Input: name (inline form, required)
- Output: New Category in that group with sort_order = last in group
- Constraints: Name required, unique within group.

**Rename Category/Group**
- Trigger: ✎ button (hover-reveal)
- Input: InlineForm with current name pre-filled
- Output: Updated name

**Move Category to Different Group**
- Trigger: Dropdown select (⇄ icon) on Category row, showing other groups
- Input: Target group ID
- Output: Category's group_id updated

**Delete Category**
- Trigger: × button (hover-reveal, danger styled)
- Constraints: If Transactions reference this Category, show blocking dialog. If no Transactions reference it, confirm dialog.
- Output: Category removed

**Delete CategoryGroup**
- Trigger: × button on group header
- Constraints: If group has Categories, show blocking dialog. If empty, confirm dialog.
- Output: CategoryGroup removed

### F7: Transfers [claude.md-ready]

**Trigger**: User selects a Payee with type = 'account' during transaction entry or inline edit.

**Unified Model**: A transfer is not a separate entity — it is a pair of linked Transactions where the payee is one of the user's own Accounts.

**Create Transfer**
- Input: User picks an account-type payee from the EntityPicker (shown in "Transfer to" section)
- Output: Two linked Transaction records created:
  1. Source transaction: account_id = current account, payee_id = destination account's payee, amount = negative (outflow), linked_id = mirror's id
  2. Mirror transaction: account_id = destination account, payee_id = source account's payee, amount = positive (inflow), linked_id = source's id
- Both share: date, absolute amount, memo, cleared state
- Constraints: Cannot transfer to same account (payee picker excludes current account). Amount must be > 0.
- Display: In source Account list, shows as outflow with payee "[destination name]". In destination Account list, shows as inflow with payee "[source name]". Category cell shows muted "Transfer" label (not editable — transfers are budget-neutral).

**Edit Transfer (inline)**
- Trigger: User clicks any editable cell on a transfer transaction
- Behavior: Identical to editing any other transaction. Date, amount, memo changes propagate to the mirror transaction automatically.
- Constraints: Payee cannot be changed to a non-account payee (would break the link). Changing payee to a different account = changing the transfer destination (updates mirror accordingly). Category is locked (transfers are uncategorized).

**Delete Transfer**
- Trigger: Delete from context menu or keyboard
- Output: Both linked transactions deleted atomically
- Undo: Restores both transactions

**Reconciliation**
- Each side of the transfer is reconciled independently (you may have confirmed it in your checking but not yet in savings)

**Edge cases**
- Transfer does not affect budget (category_id = null on both sides, excluded from activity computation)
- One account deleted after transfer created → remaining side stays visible but payee shows "[Deleted Account]"
- Editing amount on one side → mirror amount updates to opposite sign of same absolute value

### F8: Undo/Redo System [claude.md-ready]

**Trigger**: Ctrl+Z (undo), Ctrl+Shift+Z (redo), or click "Undo" in toast notification.

**Behavior**:
- Every mutating action pushes an entry to the undo stack: {description, undo(), redo()}
- Undo executes the undo function, moves entry to redo stack
- Redo executes the redo function, moves entry back to undo stack
- Toast appears on any undo/redo: "[description] — Undo (Ctrl+Z)"

**Constraints**:
- Busy guard: if undo/redo is currently executing, subsequent calls are no-ops
- Stack is in-memory only (not persisted across page refresh)
- Undo/redo functions must handle both local store AND API calls

**Edge cases**:
- Undo with empty stack → no-op
- Redo with empty redo stack → no-op
- API call in undo fails → local state still reverted (best-effort API)

### F9: Settings & Account Types [claude.md-ready]

**Trigger**: User navigates to Settings view.

**Sections**:
1. **Accounts**: List of active accounts with name, type, delete button. Add form below.
2. **Data**: Import CSV button, Export JSON button.

**Account Types**: checking, savings, cash, credit
- Type affects display only (icon/label in sidebar), no behavioral difference in v1.

### F10: Import/Export

**Import CSV**
- Trigger: "Import CSV" button in Settings
- Input: File picker → CSV file
- Output: Transactions created from CSV rows, mapped to selected Account
- Constraints: Must select target Account before import. CSV must have date and amount columns minimum.
- [OPEN: Define exact CSV column mapping — which columns are required vs optional, how to handle payee/memo/category matching | Impact: Users may have different CSV formats from different banks]

**Export JSON**
- Trigger: "Export JSON" button in Settings
- Output: Full database dump as JSON file downloaded to user's device
- Includes: all Accounts, Payees, Transactions, SplitEntries, Categories, CategoryGroups, Assignments

### F11: Reports & Analytics

**Trigger**: User navigates to Reports view (future route).

**Spending by Category (monthly)**
- Input: Month selector (reuses global month context)
- Output: Bar/pie chart showing spending per Category for selected month
- Data source: sum of Transaction amounts per Category for the month

**Spending Over Time**
- Input: Date range selector
- Output: Line chart showing total spending per month across range

**Income vs. Expenses**
- Input: Month or range
- Output: Comparison of total inflows vs total outflows

[OPEN: Decide chart library — lightweight (Chart.js), zero-dep (canvas/SVG manual), or skip charts and use tabular display only | Impact: Bundle size, mobile performance, implementation time]

### F12: Scheduled/Recurring Transactions

**Trigger**: User creates a recurring rule for automatic Transaction generation.

**Create Schedule**
- Input: Template transaction (payee, category, amount, sign), frequency (weekly | biweekly | monthly | yearly), start date, end date (optional)
- Output: ScheduledTransaction record stored

**Auto-generation**
- On app open, check all ScheduledTransactions
- For any with next_due ≤ today: generate Transaction(s) for missed dates
- Mark as generated, advance next_due

[OPEN: Should generated transactions auto-clear or require manual clearing? | Impact: User workflow — auto-clear reduces friction but may mask missed payments]

### F13: Goals/Targets per Category

**Trigger**: User sets a funding target on a Category.

**Target Types**:
- Monthly target: "I want $X assigned to this Category every month"
- Target by date: "I want $X total available by [date]" (calculates monthly needed)
- Custom: "I want to save $X per month until I hit $Y"

**Display**: Progress indicator on Category row showing % funded toward target. Underfunded indicator uses target to show how much more is needed.

[OPEN: How do targets interact with the Underfunded indicator? Does "underfunded" mean "below target" or "available > 0 but assigned = 0"? | Impact: Core budget indicator semantics change if targets are introduced]

### F14: Age of Money

**Metric**: Average number of days between when money is received (income Transaction) and when it is spent (outflow Transaction).

**Calculation**: FIFO queue of income → match against spending chronologically → average age.

**Display**: Single number in app header or dashboard. Higher = better (more buffer).

[ASSUMED: Age of Money uses a simplified 30-day rolling calculation rather than true per-dollar FIFO tracking | Rationale: True FIFO is computationally expensive and the 30-day approximation matches YNAB's own simplified approach]

### F15: Mobile Responsive Layout

**Trigger**: Viewport width < 768px.

**Behavior**:
- Sidebar collapses to hamburger menu
- Budget grid switches to card-based layout (one Category per card)
- Transaction table hides Memo and Balance columns, shows essential columns only
- AddTransactionRow stacks vertically
- Touch targets minimum 44×44px

[ASSUMED: Breakpoint at 768px with single responsive tier (no tablet-specific layout) | Rationale: Single breakpoint minimizes CSS complexity; tablet users get desktop layout which works fine with touch]

### F16: Offline-First & Sync [claude.md-ready]

**Behavior**:
- All reads come from IndexedDB (never waits for network)
- All writes go to IndexedDB first (optimistic), then API
- API failure → rollback local state, surface error via toast
- On app startup: hydrate all tables from REST API into IndexedDB
- SyncIndicator in sidebar shows connectivity status (online/offline/syncing)

**Constraints**:
- No conflict resolution needed (single-tenant, one writer)
- Full table hydration on startup (no incremental sync in v1)
- Tables: accounts, payees, category_groups, categories, transactions, split_entries, assignments

**Edge cases**:
- App opened offline → works entirely from IndexedDB cache
- Network drops mid-session → writes queue locally, sync on reconnect
- Fresh install with empty IndexedDB → hydration pulls everything from API

### F17: Multi-Currency Support (Future)

[OPEN: BLOCKING — Decide whether multi-currency means: (a) each Account has a base currency and transactions in that account are always in that currency, or (b) individual Transactions can have a foreign currency with exchange rate | Impact: Fundamentally changes the Transaction schema and all amount computations]

---

## Layer 3 Addendum — Interaction Standards

These apply globally across all features:

**The Table is the Workspace**
- The transaction table is both the display and the input method — no separate forms or modals for data entry
- New transaction = empty row at top, always ready to fill
- The row IS the form, the form IS the row — no state transition between "viewing" and "editing"
- Every cell edits in-place with one click (picker cells open immediately via showPicker/EntityPicker)

**Less Free-Text, More Structure**
- Every field prefers picking from known entities over typing
- Payee: EntityPicker with saved payees + accounts (transfer targets) + create-new
- Category: EntityPicker with nested groups + per-group create + new-group
- Reduce cognitive load: the system remembers entities, user just picks

**Cell Type Affordances (visual differentiation standard)**
- Each column type signals its expected interaction at rest:
  - Text/Number: dashed underline on cell hover (not row hover)
  - Select/Picker: permanent subtle ▾ chevron + dashed underline on cell hover
  - Computed: no hover reaction, no cursor change — absence of signal IS the signal
  - Memo/Note: icon (empty = outline, filled = solid) with hover tooltip (80 char max)
  - Toggle: visual checkbox
- Majority rule: when most columns are editable, signal the computed ones. When most are computed, signal the editable ones.

**One Interaction Model**
- Click cell → edit in place → Enter/Tab to commit → done
- No modals for inline data. Pickers float anchored to the cell.
- Keyboard: Escape = cancel, Enter = submit (Ctrl+Enter for textarea), Tab = advance, ↑/↓ = navigate picker items

**Context is Always Visible**
- Sidebar shows accounts + balances at all times
- Running balance column gives instant feedback per-row
- Sort/filter state shown in column headers (↑/↓ indicators, filter badges)

**Perceived Performance**
- All data is local (sync-engine) — pickers render instantly, no loading states
- Optimistic updates: user sees change in <16ms
- Virtual scroll for large lists

**No Native Browser Dialogs**
- Never use `window.confirm()`, `window.prompt()`, or `window.alert()`
- All confirmations use the custom `ConfirmDialog` component (promise-based)
- All inline creation uses the `InlineForm` component

**Delete Guards**
- Parent entities with existing children cannot be deleted
- Show informational blocking dialog explaining what must be resolved first
- Applies to: Account (blocks if Transactions exist), CategoryGroup (blocks if Categories exist), Category (blocks if Transactions reference it)

**Amount Input Pattern**
- All money inputs accept positive numbers only
- Direction controlled by segmented −/+ toggle (SignToggle component)
- Toggle default: outflow (−) for transaction creation, context-dependent elsewhere
- Display: red for negative, green for positive, default for zero

**Input Binding Pattern**
- All text/number inputs use `ref` callback + `el.addEventListener('input', ...)` for value tracking
- Do NOT use Solid's `onInput={(e) => ...}` JSX prop (unreliable with Vite's event delegation)
- Pattern proven working in AssignedCell, must be applied to all editable cells

**Virtual Scroll**
- Applied to any list that may exceed ~50 items
- Row height fixed (36px transactions, 32px budget rows)
- Buffer: 5 rows above and below visible area
- Scroll container tracks scrollTop via ref

**Optimistic Updates**
- Every write: local store first → notify reactive layer → fire API → rollback on failure
- User sees change immediately (<16ms)
- API failure triggers rollback + optional error toast

**Undo Coverage**
- Every user-initiated mutation (create, update, delete) pushes to undo stack
- Toast notification shows action description + "Undo" button + keyboard shortcut hint

---

## Resolution Surface

### BLOCKING (must resolve before execution)
- **F17**: Multi-currency — Account-level vs Transaction-level currency model

### OPEN (resolve before or during implementation)
- **F10**: CSV import column mapping standard
- **F11**: Chart library choice for Reports view
- **F12**: Auto-clear behavior for scheduled transaction generation
- **F13**: Target interaction with Underfunded indicator semantics

### ASSUMED (review before execution)
- **F14**: Age of Money uses simplified 30-day rolling calculation (not true per-dollar FIFO)
- **F15**: Single responsive breakpoint at 768px (no tablet tier)

### claude.md-ready
- F1: Account Management
- F2: Transaction Entry
- F3: Transaction Inline Editing (Per-Cell)
- F4: Transaction List Display
- F5: Budget Allocation
- F6: Category & Group Management
- F7: Transfers
- F8: Undo/Redo System
- F9: Settings & Account Types
- F16: Offline-First & Sync
- Layer 3 Addendum: Interaction Standards
