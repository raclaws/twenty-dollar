# Transaction Table — Agnostic Interaction Model

Extracted from the Solid.js implementation (1,693 LOC across 3 files). This document describes WHAT the table does, not HOW it's built — framework-agnostic, transferable to any UI stack.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ AddTransactionRow (dialog trigger, not inline)               │
├─────────────────────────────────────────────────────────────┤
│ Column Headers (sortable, shift+click = group)               │
├─────────────────────────────────────────────────────────────┤
│ Group Header (collapsible, aggregate, select-group)          │
│ ├─ TransactionRow (virtual, inline-editable)                 │
│ ├─ TransactionRow                                            │
│ └─ ...                                                       │
├─────────────────────────────────────────────────────────────┤
│ Group Header                                                 │
│ └─ ...                                                       │
└─────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**
- Virtual scrolling (fixed row height, only renders visible range + buffer)
- Add-transaction is a DIALOG (overlay), not an inline row
- Inline editing uses CELL FOCUS model (one cell active at a time, tab advances)
- Grouping + sorting are orthogonal (sort within groups)
- Selection state is independent of edit state

---

## Section 1: Column Model

| Column | Type | Behavior | Width Strategy |
|--------|------|----------|----------------|
| Checkbox | action | Click toggles selection | Fixed 32px |
| Date | editable | Click → DatePicker (custom, not native) | Fixed ~100px |
| Account | read-only | Displayed when viewing all accounts, hidden when filtered | Conditional |
| Payee | editable | Click → EntityPicker (searchable, sectioned, creatable) | Flex |
| Category | editable/locked | Click → CategoryPicker. Locked to "Transfer" label when linked_id exists | Flex, conditional visibility |
| Memo | editable | Click → inline text input (immediate focus, no picker) | Flex |
| Amount | editable | Click → AmountInput (number, auto-focus, commit on Enter) | Fixed ~100px |
| Balance | computed | Running sum, read-only. Dimmed if uncleared. | Fixed ~100px |
| Cleared | action | Click toggles cleared/uncleared. Shows dot (empty/green/locked) | Fixed 32px |

**Conditional columns:**
- Account: shown when `!props.accountId` (all-accounts view)
- Category: hidden in `compact` mode (used inside detail dialogs)
- Balance: hidden in `compact` mode

---

## Section 2: Cell Edit Model

### Activation
- Click on an editable cell → that cell becomes active
- Only ONE cell per row is active at a time
- Only ONE row is in edit mode at a time

### Cell Types
| Cell | Input Widget | Commit | Cancel | Advance |
|------|-------------|--------|--------|---------|
| Date | DatePicker (custom calendar dropdown) | Pick date / Enter | Escape | → next field |
| Payee | EntityPicker (typeahead with sections) | Pick item | Escape | Tab → Category |
| Category | EntityPicker (typeahead with groups) | Pick item | Escape | Tab → Amount |
| Memo | Plain text input | Blur / Enter | Escape | — |
| Amount | Number input (AmountInput) | Enter / Blur | Escape | End → close row |

### Field Advancement (Tab flow)
```
Date → Payee → Category → Amount → (end, close edit)
```
If category is locked (transfer), skip it:
```
Date → Payee → Amount → (end)
```

### Edit Guards
- System payees ("Starting Balance", "Balance Adjustment", "Import Carry") → only Amount editable
- Transfer transactions → Category column locked (shows "Transfer" label, not editable)
- Reconciled transactions → implicitly protected (not enforced in UI, server rejects)

---

## Section 3: Data Mutation Model

### Pattern: `serverFirst` (optimistic with rollback)

```
1. Apply optimistic change locally (update store)
2. Notify reactive system (UI updates immediately)
3. Send request to server (async)
4. On success: done
5. On failure:
   a. If offline → add to outbox for retry, show "offline" indicator
   b. If server error → ROLLBACK local change, show "error" indicator
6. Push undo entry (regardless of server result)
```

### Transfer Mutations (special case)
When payee changes from normal → transfer (or vice versa):
- Normal → Transfer: create mirror transaction, link both via `linked_id`
- Transfer → Normal: delete mirror transaction, clear `linked_id`
- Transfer → different account: update mirror's account_id

Mirror transactions always have:
- Same date, same absolute amount (negated sign), same memo
- `linked_id` pointing to each other
- `category_id = null` (transfers are uncategorized)

### Undo Integration
Every mutation pushes an undo entry with:
- `description` (human-readable)
- `undo()` — restores previous state
- `redo()` — re-applies the change

Undo/redo functions operate on the local store only (revert local + fire API). They do NOT reverse the server call — they issue a new correction.

---

## Section 4: Selection Model

### Selection Modes

| Input | Behavior |
|-------|----------|
| Ctrl/Cmd + Click row | Toggle that row's selection |
| Click checkbox | Toggle that row's selection |
| Shift + Arrow (↑/↓) | Extend selection one row in direction |
| Ctrl + Shift + Arrow | Extend selection to group boundary |
| Ctrl/Cmd + A | Select all visible rows |
| Escape | Clear selection |
| Click group header checkbox | Toggle all rows in that group |

### Selection State
- `selectedIds: Set<string>` — currently selected transaction IDs
- `focusedIdx: number` — keyboard cursor position (for arrow nav)
- `selectionAnchor: number` — start point for range operations
- `lastSelectedId: string` — most recently selected (for shift-range)

### Keyboard Navigation (non-selection)
| Key | Behavior |
|-----|----------|
| Arrow ↑/↓ (no modifiers) | Move focus, select single row |
| Delete / Backspace | Delete selected (with confirm dialog) |
| Escape | Clear selection OR close edit |

### Selection vs Edit Interaction
- Selection and editing are mutually exclusive states
- Ctrl+Click while editing → ignored (editing takes priority)
- Clicking a cell while selection exists → clears selection, enters edit
- Arrow keys while editing → handled by the active input, not by selection

---

## Section 5: Sorting Model

### Sort State
- `sortField: 'date' | 'payee' | 'category' | 'amount' | null`
- `sortDir: 'asc' | 'desc'`

### Sort Interaction
- Click column header → sort by that field (toggles direction)
- Shift + Click column header → GROUP by that field (not sort)
- Visual indicator: ChevronUp (asc), ChevronDown (desc), ChevronsUpDown (neutral)

### Sort Behavior
- Default: date descending (newest first)
- Sort applies WITHIN groups (when grouped)
- Clicking an already-active sort field toggles asc ↔ desc
- Third click on same field removes sort (returns to default)

---

## Section 6: Grouping Model

### Group State
- `groupBy: 'none' | 'month' | 'date' | 'payee' | 'category' | 'account'`
- `collapsed: Set<string>` — collapsed group keys

### Group Configuration
Each group mode defines:
- `key(tx)` — extract group key from transaction
- `label(key)` — human-readable group label
- `sort(a, b)` — sort order between groups

### Group Headers
Each header shows:
- Label (e.g., "July 2026", "Groceries", "Checking")
- Count (number of transactions in group)
- Aggregate (sum of amounts)
- Cleared count (X/Y cleared)
- Collapse toggle (click to expand/collapse)
- Select-group (checkbox selects all rows in group)

### Collapse Behavior
- Click group header → toggle collapse
- Collapsed group shows only the header row
- Virtual scroll accounts for collapsed groups (reduces total height)

---

## Section 7: Virtual Scroll Model

### Constants
- `ROW_HEIGHT = 36px` (fixed, every row same height)
- `BUFFER = 5` (render 5 extra rows above/below viewport)

### Computation
```
visibleRange = {
  start: max(0, floor(scrollTop / ROW_HEIGHT) - BUFFER)
  end: min(totalItems, ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER)
}
totalHeight = virtualItems.length * ROW_HEIGHT
```

### Virtual Item Types
```
type VirtualItem =
  | { type: 'header'; key; label; count; aggregate; cleared }
  | { type: 'row'; tx; balance; txId }
```

### Render Strategy
- Container has `height: totalHeight` (creates scrollbar)
- Visible rows are absolutely positioned via `translateY(start * ROW_HEIGHT)`
- On scroll → recalculate visible range → re-render only visible items

---

## Section 8: Add Transaction (Dialog Model)

### Trigger
- Click "+ Add transaction..." trigger row
- Keyboard shortcut: Ctrl/Cmd + N

### Dialog Structure
Not an inline row. A floating dialog (overlay) with fields:
1. Date (click → DatePicker)
2. Payee (focus/click → PayeePicker)
3. Category (click → CategoryPicker, locked if transfer)
4. Amount (input + sign toggle: outflow −  / inflow +)
5. Memo (text input)
6. Footer: Cleared toggle, "Add more" checkbox, Split button, Submit

### Sign Model
- Explicit toggle: − (outflow, default) or + (inflow)
- Internally: always store positive number, negate on outflow
- Display: user types "150", stored as -15000 (outflow) or +15000 (inflow)

### Split Mode
- Toggle "Split" button → shows split lines
- Each split: category picker + amount + memo
- Validation: split amounts must sum to main amount
- When split: main category field locked to "Split" label

### Transfer Mode
- Selecting a transfer payee (account-type) → auto-locks category to "Transfer"
- Creates mirror transaction in destination account
- Mirror has: negated amount, linked_id, same date/memo

### Add More
- Checkbox "Add more" → on submit, reset form but keep date, reopen dialog
- Without it: submit closes dialog

### Keyboard
- Ctrl/Cmd + Enter → submit from any field
- Escape → close dialog (unless a picker is open — picker closes first)

### Layering (Escape priority)
```
Escape pressed:
  1. If picker is open → close picker only
  2. If dialog is open (no picker) → close dialog
  3. If selection exists → clear selection
```

---

## Section 9: Context Menu Model

### Trigger
- Right-click on any transaction row

### Items
- Mark cleared / Mark uncleared
- Make recurring... (opens schedule dialog)
- Duplicate
- Delete

### Bulk Context Menu (when selection > 0)
- Mark N cleared
- Mark N uncleared
- Delete N transactions

### Position
- Fixed position at cursor coordinates
- Viewport-clamped (never renders offscreen)
- Closes on: click outside, Escape, or action selection

---

## Section 10: Performance Model

### Expensive Operations
| Operation | Strategy |
|-----------|----------|
| Sort 1000+ transactions | Memoized computed (only recalculates when data/sort state changes) |
| Running balance | Computed once per render cycle (cumulative sum from oldest) |
| Group aggregation | Computed per group inside grouping memo |
| Virtual scroll | Only renders ~20 rows regardless of total count |
| Selection operations | Set-based (O(1) add/remove/has) |

### Reactive Boundaries
- `allTransactions` — reactive query on the 'transactions' table
- `sorted` — derived memo (depends on transactions + sortField + sortDir + filters)
- `virtualItems` — derived memo (depends on sorted + groupBy + collapsed)
- `visibleRange` — derived memo (depends on scrollTop + containerHeight)
- Each row is its own reactive scope (only re-renders if its specific transaction changes)

---

## Section 11: Accessibility

### ARIA Roles
- Table: `role="grid"` (or native `<table>`)
- Column headers: sortable headers have `aria-sort`
- Rows: selectable rows have `aria-selected`
- Cells: editable cells have appropriate role announcements

### Keyboard Contract
- All interactive elements reachable via keyboard
- Tab order: header → add row → table body → pagination
- Within table: arrow keys move focus between rows
- Enter: activates edit on focused row
- Space: toggles selection on focused row

### Focus Management
- When edit activates: focus moves to input widget
- When edit ends: focus returns to the cell that was clicked
- When picker opens: focus moves to search input
- When picker closes: focus returns to trigger cell

---

## Summary: What Makes This Table "Custom"

1. **Cell-level editing** — not row-level forms, each cell is independently activatable
2. **Entity pickers as cell editors** — not plain inputs, full typeahead with create
3. **Virtual scroll** — handles 10K+ rows without DOM bloat
4. **Compound keyboard model** — selection, navigation, editing, shortcuts all coexist
5. **Transfer semantics** — payee choice changes transaction structure (creates/destroys mirrors)
6. **Undo at mutation level** — every field change is independently undoable
7. **Grouping + sorting orthogonal** — sort within groups, collapse groups, aggregate headers
8. **Layered escape** — picker > dialog > selection > nothing, in priority order
9. **serverFirst pattern** — optimistic then verify, rollback on failure, outbox on offline
10. **Focus trap discipline** — focus always has a predictable home after any interaction
