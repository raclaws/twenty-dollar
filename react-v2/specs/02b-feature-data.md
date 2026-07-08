# Feature Spec: Twenty-Dollar React v2 — Components & Data

**Version**: 2.0  
**Date**: 2026-07-08  
**Depends on**: 01-prd.md, 02a-feature-flows.md

---

<!-- @feature:components -->
## 5. Component Decomposition

All components use MobX `observer()` wrapper. Stores are injected via React context. Components are grouped by feature domain.

### Layout Shell

| Component | Props | Responsibility | Reusable |
|-----------|-------|---------------|----------|
| `AppShell` | — | Root layout: sidebar + header + main outlet | No |
| `Sidebar` | — | Account list, nav links, net worth | No |
| `SidebarAccountItem` | `account: Account` | Single account row with computed balance | No |
| `HeaderBar` | `title, actions[]` | Top bar with month nav or account title | Yes |
| `MonthNavigator` | `month, onNavigate` | Left/right arrows + month display | Yes |
| `CommandPalette` | — | Cmd+K overlay, searches accounts/categories/payees | No |
| `ToastProvider` | — | Sonner wrapper with undo integration | No |

### Budget Grid (F2)

| Component | Props | Responsibility | Reusable |
|-----------|-------|---------------|----------|
| `BudgetPage` | — | Route component, orchestrates month fetch | No |
| `RTABanner` | — | Reads `budgetStore.rta`, colored pill | No |
| `BudgetGroupRow` | `groupId: string` | Collapsible group header with totals | No |
| `BudgetCategoryRow` | `categoryId: string, month: string` | Single category: assigned/activity/available cells | No |
| `AssignmentCell` | `categoryId, month` | Inline editable currency input | No |
| `AvailableCell` | `categoryId` | Colored available amount with target indicator | No |
| `MoveMoneyModal` | `fromCategoryId?` | From/to/amount form | No |
| `TargetIndicator` | `category: Category, available: number` | Progress bar or icon for target status | Yes |

### Transaction Ledger (F3)

| Component | Props | Responsibility | Reusable |
|-----------|-------|---------------|----------|
| `AccountPage` | — | Route component, fetches transactions for account | No |
| `TransactionList` | `accountId: string` | Virtual-scrolled list container (10k+ rows) | No |
| `TransactionRow` | `txnId: string` | Display row, click to edit | No |
| `TransactionEditRow` | `txnId?: string` | Inline form: date, payee, category, memo, amount | No |
| `SplitEditor` | `txnId: string` | Expandable split sub-rows with add/remove | No |
| `SplitRow` | `split: SplitEntry, onUpdate, onRemove` | Single split line | No |
| `BulkActionBar` | `selectedIds: string[]` | Delete/clear/unclear/categorize buttons | No |
| `TransactionFilters` | `accountId` | Date range, category, cleared state filters | No |
| `PayeeAutocomplete` | `value, onChange` | Autocomplete input sourcing from payeeStore | Yes |
| `CategoryPicker` | `value, onChange, grouped?` | Dropdown with group headers | Yes |
| `CurrencyInput` | `value, onChange, allowNegative?` | Formatted cents input with +/- toggle | Yes |
| `DateInput` | `value, onChange` | Date picker with keyboard nav | Yes |

### Transfers (F4)

| Component | Props | Responsibility | Reusable |
|-----------|-------|---------------|----------|
| `TransferModal` | `fromAccountId?` | From/to account, date, amount, memo | No |

### Schedules (F5)

| Component | Props | Responsibility | Reusable |
|-----------|-------|---------------|----------|
| `SchedulesPage` | — | Route component, schedule list | No |
| `ScheduleRow` | `scheduleId: string` | Display row with due status badge | No |
| `ScheduleForm` | `scheduleId?: string` | Create/edit form (modal or page section) | No |
| `FrequencyPicker` | `value, onChange` | Weekly/biweekly/monthly/yearly selector | Yes |
| `DueBadge` | `nextDue: string` | Due/overdue/upcoming color badge | Yes |

### Import (F6)

| Component | Props | Responsibility | Reusable |
|-----------|-------|---------------|----------|
| `ImportWizard` | `accountId: string` | Multi-step: upload → preview → confirm | No |
| `CSVPreviewTable` | `rows: ParsedRow[]` | Column mapping + row preview | No |
| `ImportProgressBar` | `imported, total` | Progress during batch insert | Yes |

### Settings (F7, F8, F9)

| Component | Props | Responsibility | Reusable |
|-----------|-------|---------------|----------|
| `SettingsLayout` | — | Settings sidebar + outlet | No |
| `CategoryManager` | — | Groups + categories with drag-and-drop reorder | No |
| `CategoryGroupCard` | `groupId: string` | Draggable group with nested category list | No |
| `CategoryTargetEditor` | `categoryId: string` | Target type/amount/date form | No |
| `PayeeManager` | — | Searchable payee list with CRUD | No |
| `ImportRuleManager` | — | Rule list with token/payee/category editors | No |
| `ImportRuleRow` | `ruleId: string` | Single rule with inline edit | No |
| `ExportPanel` | — | Export button + last export timestamp | No |

### Shared / Primitive

| Component | Props | Responsibility | Reusable |
|-----------|-------|---------------|----------|
| `CurrencyDisplay` | `cents: number, colored?` | Formats cents → $X.XX with optional red/green | Yes |
| `EmptyState` | `icon, title, description, action?` | Empty state placeholder with CTA | Yes |
| `ConfirmDialog` | `title, message, onConfirm, onCancel` | Destructive action confirmation | Yes |
| `InlineEdit` | `value, onSave, onCancel, type` | Generic inline-editable text/number | Yes |
| `ContextMenu` | `items[], position` | Right-click context menu | Yes |
| `SearchInput` | `value, onChange, placeholder` | Debounced search with clear button | Yes |
| `Kbd` | `keys: string` | Keyboard shortcut hint display | Yes |
| `SkeletonRow` | `columns: number` | Loading placeholder row | Yes |
| `Badge` | `variant, children` | Colored status badge | Yes |

---

<!-- @feature:data-requirements -->
## 6. Data Requirements

MobX stores expose computed values and actions consumed by observer() components. Data lives in IndexedDB; stores hydrate on app launch and write-through on mutations.

### AccountStore

**Observable state:**
- `accounts: Map<id, Account>`
- `activeAccountId: string | null`

**Computed:**
- `sortedAccounts` — accounts sorted by sort_order
- `accountBalance(id)` — sum of all transactions in account (income positive, expenses negative)
- `netWorth` — sum of all account balances
- `checkingAccounts`, `savingsAccounts`, `creditAccounts`, `cashAccounts` — filtered by type

**Actions:**
- `createAccount(name, type)` → writes IDB + queues sync
- `updateAccount(id, patch)` → optimistic update
- `deleteAccount(id)` → confirms no transactions, removes
- `reorderAccounts(orderedIds)` → batch sort_order update

---

### BudgetStore

**Observable state:**
- `assignments: Map<compositeKey(categoryId, month), Assignment>`
- `currentMonth: string` (YYYY-MM format)
- `lockedMonths: Set<string>`

**Computed:**
- `rtaForMonth(month)` — total income up to month end minus total assignments up to month
- `categoryBudget(categoryId, month)` — `{ assigned, activity, available }` where:
  - `assigned` = assignment amount for this category+month
  - `activity` = sum of transactions in this category for this month
  - `available` = cumulative assigned + cumulative activity (all months up to this one)
- `groupTotals(groupId, month)` — summed assigned/activity/available for group
- `isOverspent(categoryId, month)` — available < 0
- `targetStatus(categoryId, month)` — { needed, funded, percentage } based on Category.target_type
- `isMonthLocked(month)` — checks lockedMonths set

**Actions:**
- `assign(categoryId, month, amount)` → upsert assignment, recompute RTA
- `moveMoney(fromCategoryId, toCategoryId, month, amount)` → adjust both assignments
- `lockMonth(month)` / `unlockMonth(month)` → toggle lock state
- `navigateMonth(direction: -1 | 1)` → update currentMonth

---

### TransactionStore

**Observable state:**
- `transactions: Map<id, Transaction>`
- `splits: Map<txnId, SplitEntry[]>`
- `selectedIds: Set<string>`
- `editingId: string | null`
- `filters: { dateFrom?, dateTo?, categoryId?, cleared? }`

**Computed:**
- `transactionsForAccount(accountId)` — filtered + sorted by date desc
- `filteredTransactions(accountId)` — applies active filters
- `selectedCount` — selectedIds.size
- `activityForCategory(categoryId, month)` — sum of transactions in category for month range
- `incomeUpTo(endDate)` — sum of all transactions without a category (income = uncategorized inflow)
- `transactionsByPayee(payeeId)` — for payee detail views

**Actions:**
- `createTransaction(data)` → insert IDB, update account balance
- `updateTransaction(id, patch)` → optimistic update
- `deleteTransaction(id)` → remove + recompute
- `bulkAction(action, ids, categoryId?)` → batch operation
- `setSplits(txnId, splits[])` → validate sum, persist
- `toggleSelection(id)` / `selectRange(fromId, toId)` / `clearSelection()`
- `setFilters(filters)` / `clearFilters()`

---

### TransferStore

**Observable state:**
- `transfers: Map<id, Transfer>`

**Computed:**
- `transfersForAccount(accountId)` — transfers involving this account
- `sortedTransfers` — all transfers sorted by date desc

**Actions:**
- `createTransfer(from, to, date, amount, memo)` → creates Transfer + linked transactions in both accounts
- `deleteTransfer(id)` → removes transfer + linked transactions

---

### ScheduleStore

**Observable state:**
- `schedules: Map<id, Schedule>`

**Computed:**
- `sortedSchedules` — sorted by next_due asc
- `dueSchedules` — schedules where next_due ≤ today and not paused
- `overdueSchedules` — next_due < today by >1 day
- `schedulesForAccount(accountId)` — filtered

**Actions:**
- `createSchedule(data)` → insert
- `updateSchedule(id, patch)` → optimistic
- `deleteSchedule(id)` → remove
- `togglePause(id)` → flip paused flag
- `generateDue()` → iterate due schedules, create transactions, advance next_due

---

### CategoryStore

**Observable state:**
- `groups: Map<id, CategoryGroup>`
- `categories: Map<id, Category>`

**Computed:**
- `sortedGroups` — groups sorted by sort_order, each with sorted categories
- `flatCategories` — all categories in group-order (for dropdowns)
- `categoryById(id)` — direct lookup
- `groupForCategory(categoryId)` — parent group

**Actions:**
- `createGroup(name, icon?)` → insert
- `updateGroup(id, patch)` → update
- `deleteGroup(id)` → must be empty
- `createCategory(groupId, name, icon?)` → insert
- `updateCategory(id, patch)` → update (including target fields)
- `deleteCategory(id)` → must have no transactions
- `reorderCategories(groupId, orderedIds)` → batch sort_order
- `reorderGroups(orderedIds)` → batch sort_order
- `moveCategory(categoryId, toGroupId)` → update group_id

---

### PayeeStore

**Observable state:**
- `payees: Map<id, Payee>`

**Computed:**
- `sortedPayees` — alphabetical
- `payeesByName` — Map<normalizedName, Payee> for autocomplete
- `transferPayees` — payees with type="transfer"

**Actions:**
- `createPayee(name, type?, accountId?)` → insert
- `updatePayee(id, patch)` → update
- `deletePayee(id)` → remove (orphans transactions' payee_id)
- `searchPayees(query)` → prefix match

---

### ImportRuleStore

**Observable state:**
- `rules: Map<id, ImportRule>`

**Computed:**
- `sortedRules` — alphabetical by tokens
- `matchRule(description)` — finds first rule where tokens match description

**Actions:**
- `createRule(tokens, payeeId?, categoryId?)` → insert
- `updateRule(id, patch)` → update
- `deleteRule(id)` → remove

---

### SyncStore (cross-cutting)

**Observable state:**
- `status: 'online' | 'offline' | 'syncing' | 'error'`
- `pendingWrites: number`
- `lastSyncAt: Date | null`
- `errors: SyncError[]`

**Computed:**
- `isOnline` — status !== 'offline'
- `hasPendingWrites` — pendingWrites > 0

**Actions:**
- `enqueueWrite(mutation)` → add to outbox
- `processOutbox()` → drain pending writes to backend
- `handleSSEEvent(event)` → reconcile inbound changes
- `goOffline()` / `goOnline()` → status transitions

---

### UndoStore

**Observable state:**
- `stack: UndoEntry[]` (max 50)
- `activeToastId: string | null`

**Computed:**
- `canUndo` — stack.length > 0
- `lastAction` — stack[stack.length - 1]?.description

**Actions:**
- `push(description, redo, undo)` → add to stack
- `undo()` → pop + execute undo mutations
- `clear()` → reset stack

---

<!-- @feature:edge-cases -->
## 7. Edge Cases & Constraints

### Empty States
- **No accounts**: Full-screen onboarding — "Add your first account to get started"
- **No categories**: Budget grid shows CTA to set up categories (link to `/settings/categories`)
- **No transactions in account**: Illustration + "Record your first transaction" button
- **No schedules**: "Automate recurring bills" CTA
- **No import rules**: Explanatory text about what rules do

### Boundaries
- **10,000+ transactions**: Virtual scroll with 50-item window; only 50 DOM nodes rendered at any time
- **Assignment = 0**: Valid (explicitly assigning zero); distinct from no assignment
- **Negative available**: Category is overspent; display red, warn but don't block
- **RTA negative**: User over-assigned; red pulsing banner, no blocking
- **Split sum ≠ parent**: Block save with inline validation error
- **Month navigation**: No hard boundaries, but months before first transaction show all zeros
- **Transfer to same account**: Validation error, blocked client-side
- **Duplicate payee names**: Allowed (matched by ID); autocomplete shows recent-first

### Accessibility
- All interactive elements keyboard-navigable (Tab order follows visual order)
- Budget grid cells navigable with arrow keys (spreadsheet-style)
- ARIA labels on all icon-only buttons
- Currency inputs announce formatted value to screen readers
- Color-coded states (red/green/yellow) always paired with icon or text
- Focus trap in modals
- Minimum touch target 44×44px on mobile
- Reduced motion: disable all transitions if `prefers-reduced-motion`

### Performance
- Initial load: hydrate IDB → MobX stores in <200ms for 10k transactions
- Budget computation: memoized via MobX computed (only recomputes on dependency change)
- Virtual scroll: @tanstack/react-virtual with overscan=5
- Debounced assignment input: 300ms before write (immediate visual update)
- Batch IDB writes in transactions (no write-per-field)

### Offline Behavior
- All CRUD operations work offline (write to IDB immediately)
- Pending writes queue in SyncStore outbox
- SSE connection auto-reconnects with exponential backoff
- Conflict resolution: last-write-wins with timestamp (server is authority on sync)
- If offline >24h with pending writes: show warning banner with "pending changes" count
- Export always available offline (reads from IDB)
- Import works offline (writes to IDB, syncs later)

---

<!-- @feature:acceptance-criteria -->
## 8. Acceptance Criteria

### F1: Account Management
- [ ] User can create account with name and type; appears in sidebar within 100ms
- [ ] Account balance equals sum of all transactions + transfers for that account
- [ ] Account can be renamed via inline edit
- [ ] Deleting account with transactions shows confirmation; deleting empty account does not
- [ ] Accounts respect sort_order (drag-reorder persists across reload)

### F2: Budget Grid
- [ ] Budget grid displays all CategoryGroups and Categories for selected month
- [ ] Clicking Assigned cell opens editable input; Enter saves, Escape cancels
- [ ] RTA = total income up to month-end minus total assigned up to month
- [ ] Available = cumulative assigned + cumulative activity for category
- [ ] Move Money redistributes between two categories without changing RTA
- [ ] Locked month: assigned cells are read-only, move money is disabled
- [ ] Month navigation via arrows updates grid content
- [ ] Target progress indicator shows correct % based on target_type
- [ ] Overspent categories show red available value

### F3: Transaction Ledger
- [ ] New transaction row activates in edit mode with today's date pre-filled
- [ ] Payee autocomplete shows matches from PayeeStore after 1 character
- [ ] Category picker shows grouped categories
- [ ] Saving transaction updates account balance and category activity immediately
- [ ] Bulk select (checkbox + Shift range) enables bulk action bar
- [ ] Bulk delete shows confirmation; bulk clear/unclear applies immediately
- [ ] Split editor validates sum = parent amount; blocks save if mismatched
- [ ] 10,000 transactions render without frame drops (virtual scroll)
- [ ] Uncleared transactions visually distinct from cleared

### F4: Transfers
- [ ] Transfer creates linked entries in both accounts
- [ ] Both account balances update correctly (from decreases, to increases)
- [ ] Transfer appears in both account ledgers with "Transfer: [Account]" payee

### F5: Scheduled Transactions
- [ ] Schedule with frequency=monthly and next_due=today generates one transaction on app load
- [ ] next_due advances to next occurrence after generation
- [ ] Paused schedules do not generate
- [ ] end_date prevents generation beyond that date
- [ ] Due/overdue badges show correct status relative to today

### F6: Import / Export
- [ ] CSV upload parses and shows preview table
- [ ] Import rules auto-fill category/payee on matching rows
- [ ] Import creates transactions in target account; count shown in toast
- [ ] JSON export downloads complete data set (all entities)
- [ ] Import works fully offline

### F7: Import Rules
- [ ] Rule with tokens="NETFLIX" matches transaction description containing "NETFLIX"
- [ ] Matched rule auto-assigns payee_id and category_id during import
- [ ] Rules are CRUD-manageable from settings

### F8: Category Management
- [ ] Categories can be created within groups
- [ ] Groups can be reordered via drag-and-drop
- [ ] Categories can be moved between groups
- [ ] Target types (4 variants) configurable per category
- [ ] Deleting a category with transactions shows error/confirmation

### F9: Payee Management
- [ ] Payees searchable by name
- [ ] Transfer payees auto-created when transfer involves new account pair

### F10: Month Lock
- [ ] Locking a month makes all assignment cells read-only for that month
- [ ] Unlocking restores editability
- [ ] Lock state persists across app restart

### F11: Undo
- [ ] Undo toast appears after assignment change with "Undo" button
- [ ] Clicking Undo reverses the last mutation
- [ ] Ctrl+Z triggers undo of most recent action
- [ ] Undo works for: assign, move money, create/edit/delete transaction, bulk ops

### Cross-cutting
- [ ] App loads and functions fully with backend unreachable (offline mode)
- [ ] Pending offline writes sync when connectivity restored
- [ ] All monetary values display as $X.XX (cents → dollars)
- [ ] Entire UI keyboard-navigable; budget grid supports arrow-key cell nav
- [ ] No console errors on initial load
- [ ] PWA installable; service worker caches shell assets
