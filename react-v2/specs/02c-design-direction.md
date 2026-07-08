# Design Direction: Twenty-Dollar React v2

**Version**: 2.0  
**Date**: 2026-07-08  
**Depends on**: 01-prd.md (stack, constraints), 02a/02b (components, screens)

---

<!-- @design:direction -->
## 1. Aesthetic Direction

**Concept: "Neon Ledger"**

A dark-mode-native financial tool that feels like a hacker's personal spreadsheet — precise, information-dense, and visually quiet until something demands attention. The dark canvas makes numbers pop. Neon accents (cyan, magenta, green) serve as functional signals, never decoration. The overall feel is: **calm competence** — a tool that trusts you to know what you're doing, surfaces exactly what matters, and never wastes a pixel on ornamentation.

**Principles:**
1. **Data density over whitespace** — This is a spreadsheet app. Rows are tight, columns are aligned, information is scannable. No card-heavy layouts or excessive padding.
2. **Dark canvas, bright signals** — The base is near-black; interactable and important values use high-contrast neon tones.
3. **Motion is information** — Animation only occurs when it communicates state change (number rolling up, row sliding in). Never decorative.
4. **Keyboard-first, mouse-friendly** — Visual affordances for click targets exist, but the power-user path is always keyboard.
5. **Progressive disclosure** — Settings, targets, and advanced features are reachable but never in the way. The budget grid and ledger are uncluttered by default.

**Reference mood:** Terminal UIs (lazygit, btop), Bloomberg Terminal data density, Linear's polish level, but warmer and more approachable through rounded corners and soft shadows.

---

<!-- @design:typography -->
## 2. Typography + Color

### Typography

| Role | Font | Weight | Size | Usage |
|------|------|--------|------|-------|
| UI Text | Figtree | 400 | 14px / 0.875rem | Body text, labels, descriptions |
| UI Text Bold | Figtree | 600 | 14px | Column headers, nav items, emphasis |
| Headings | Figtree | 700 | 18–24px | Page titles, section headers |
| Numbers / Money | JetBrains Mono | 400 | 14px | All monetary values, dates, IDs |
| Numbers Emphasis | JetBrains Mono | 700 | 16–20px | RTA banner, account balance totals |
| Small | Figtree | 400 | 12px / 0.75rem | Timestamps, helper text, badges |

**Line heights:** Body 1.5, headings 1.2, monospace numbers 1.4.  
**Tabular figures:** JetBrains Mono for all numbers ensures columns align without fixed-width hacks.

### Color System

Base palette derived from Catppuccin Mocha, extended with custom neon accents for the budget domain.

**Surfaces:**
| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-base` | `#1e1e2e` | App background |
| `--surface-raised` | `#262637` | Cards, sidebar, modals |
| `--surface-overlay` | `#313244` | Dropdowns, popovers, hover states |
| `--surface-sunken` | `#181825` | Input backgrounds, inset areas |

**Text:**
| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#cdd6f4` | Main text (Catppuccin "text") |
| `--text-secondary` | `#a6adc8` | Secondary labels (Catppuccin "subtext0") |
| `--text-muted` | `#6c7086` | Disabled, placeholder (Catppuccin "overlay0") |

**Functional neons:**
| Token | Hex | Meaning |
|-------|-----|---------|
| `--accent-cyan` | `#89dceb` | Interactive focus, primary actions, links |
| `--accent-green` | `#a6e3a1` | Positive: funded, income, available > 0 |
| `--accent-red` | `#f38ba8` | Negative: overspent, error, destructive |
| `--accent-yellow` | `#f9e2af` | Warning: underfunded, due soon |
| `--accent-magenta` | `#cba6f7` | Informational: transfers, schedule badges |
| `--accent-peach` | `#fab387` | Overdue, offline indicator |

**Borders:**
| Token | Hex | Usage |
|-------|-----|-------|
| `--border-subtle` | `#313244` | Grid lines, separators |
| `--border-focus` | `#89dceb` | Focus rings (2px solid) |

**Semantic mapping (Tailwind v4 theme):**
```
positive = accent-green
negative = accent-red
warning = accent-yellow
info = accent-magenta
interactive = accent-cyan
```

---

<!-- @design:components -->
## 3. Component Visual Inventory

Dimensions in px. All spacing follows 4px base grid.

### Budget Grid Row
- Height: 36px
- Padding: 0 12px
- Font: Figtree 14px (category name), JetBrains Mono 14px (numbers)
- Columns: Category name (flex-1, min 160px) | Assigned (100px) | Activity (100px) | Available (100px)
- Hover: `surface-overlay` background
- Active edit: `surface-sunken` with `border-focus` ring on input
- Group header: 40px height, Figtree 600 14px, `surface-raised` background, 8px left-padding indent

### RTA Banner
- Height: 48px
- Padding: 12px 16px
- Font: JetBrains Mono 700 20px (amount), Figtree 400 14px (label)
- Border-radius: 8px
- Background: `surface-raised`
- Amount color: green (positive), red (negative), `text-primary` (zero)
- Layout: flex row, label left, amount right

### Transaction Row
- Height: 40px
- Padding: 0 12px
- Font: Figtree 14px (payee, memo), JetBrains Mono 14px (amount, date)
- Columns: Checkbox (32px) | Date (80px) | Payee (flex-1, min 120px) | Category (140px) | Memo (flex-1) | Amount (100px) | Cleared (32px)
- Hover: `surface-overlay`
- Selected: cyan tint at 8% opacity background
- Uncleared: text at 60% opacity
- Edit mode row height: 56px (expanded for input padding)

### Sidebar
- Width: 240px (collapsible to 56px on mobile)
- Background: `surface-raised`
- Account item height: 36px
- Padding: 8px 12px
- Active item: left border 3px `accent-cyan`, background `surface-overlay`
- Balance font: JetBrains Mono 400 13px, right-aligned
- Section headers: Figtree 600 12px uppercase, `text-muted`, 24px top margin

### Modal
- Max-width: 480px
- Border-radius: 12px
- Background: `surface-raised`
- Backdrop: black at 60% opacity
- Padding: 24px
- Header: Figtree 700 18px, 16px bottom margin
- Footer buttons: 36px height, 12px horizontal padding

### Toast (Sonner)
- Width: 360px
- Border-radius: 8px
- Background: `surface-overlay`
- Border: 1px `border-subtle`
- Padding: 12px 16px
- Font: Figtree 14px
- Undo link: `accent-cyan`, Figtree 600
- Duration: 5000ms (undo actions), 3000ms (info)

### Currency Input
- Height: 32px
- Border-radius: 6px
- Background: `surface-sunken`
- Border: 1px `border-subtle`, 2px `border-focus` on focus
- Font: JetBrains Mono 14px
- Padding: 4px 8px
- Dollar sign prefix: `text-muted`

### Category Picker Dropdown
- Max-height: 320px (scrollable)
- Border-radius: 8px
- Background: `surface-overlay`
- Item height: 32px
- Group header: Figtree 600 12px, `text-muted`, non-clickable
- Selected item: `accent-cyan` left border, `surface-raised` background
- Search input at top: sticky, 40px

### Badge
- Height: 20px
- Border-radius: 10px (pill)
- Padding: 0 8px
- Font: Figtree 600 11px uppercase
- Variants: green/red/yellow/magenta/cyan backgrounds at 15% opacity, text in full color

### Empty State
- Centered in parent, max-width 320px
- Icon: 48px Lucide icon, `text-muted`
- Title: Figtree 600 16px, `text-primary`
- Description: Figtree 400 14px, `text-secondary`
- CTA button: 36px height, `accent-cyan` background, white text

---

<!-- @design:motion -->
## 4. Motion Spec

All durations respect `prefers-reduced-motion: reduce` → instant (0ms).

| Interaction | Property | Duration | Easing | Notes |
|-------------|----------|----------|--------|-------|
| Row hover | background-color | 120ms | ease-out | Subtle, no layout shift |
| Modal open | opacity + transform(scale) | 200ms | ease-out | Scale from 0.95 → 1.0 |
| Modal close | opacity | 150ms | ease-in | Faster out than in |
| Toast enter | transform(translateX) | 250ms | spring(1, 80, 10) | Slide in from right |
| Toast exit | opacity + translateX | 200ms | ease-in | Slide out right |
| Cell edit activate | border-color + background | 100ms | ease-out | Near-instant feedback |
| Number change | — (no animation) | 0ms | — | Numbers update instantly; no counting/rolling |
| Month navigate | opacity(grid content) | 150ms | ease-out | Cross-fade, no slide |
| Sidebar collapse | width | 200ms | ease-in-out | CSS transition |
| Dropdown open | opacity + transform(translateY) | 150ms | ease-out | Shift down 4px |
| Drag reorder | transform(translateY) | during drag | — | Follow cursor; spring settle on drop |
| Page route change | opacity(main content) | 100ms | ease-out | Minimal, just prevents flash |
| Focus ring | box-shadow | 100ms | ease-out | Animates in, never out (instant remove) |

**Constraints:**
- No layout-triggering animations (no width/height animation on content)
- No animations on monetary values (numbers don't "count up" — instant truthful display)
- Maximum total animation time for any interaction: 250ms
- Drag operations use `will-change: transform` during drag only

---

<!-- @design:memorable -->
## 5. What Makes It Memorable

1. **The RTA feels alive** — Ready to Assign responds instantly to every assignment. The number updates before your finger lifts from the key. It pulses subtly red when negative (the only decorative animation in the app) because overspending is the one thing that demands visceral attention.

2. **Keyboard-native budget editing** — Arrow keys navigate the budget grid like a spreadsheet. Type a number to start editing. Tab moves to next category. Enter confirms and moves down. No mouse required for the core budgeting loop. This feels like vim for your money.

3. **Monospace numbers that align** — Every column of numbers uses JetBrains Mono tabular figures. Amounts stack perfectly. This small typographic choice makes the budget grid feel engineered, not designed. It says: "this tool was built by someone who cares about the same details you do."

4. **Dark mode that earns its darkness** — This isn't dark-for-aesthetics. The dark surface makes neon functional colors impossible to miss: green means funded, red means problem, cyan means "you can interact with this." Information hierarchy is enforced by light-on-dark physics.

5. **Undo everything, everywhere** — Every mutation produces an undo toast. Ctrl+Z works. The confidence to move fast comes from knowing nothing is permanent. This removes the anxiety that plagues manual budgeting tools.

6. **Offline without apology** — There's no "you're offline" full-screen blocker. A small chip appears in the header. Everything keeps working. The app treats offline as a normal state, not an error state. For self-hosters running this on a home server, this is the correct posture.

7. **Zero chrome, maximum data** — No splash screens, no onboarding carousels (beyond first-run setup), no gamification. The app loads to your budget grid in <500ms and shows you your money. Respect for the user's time is the design itself.

---

<!-- @design:anti-patterns -->
## 6. Anti-patterns

| Don't | Why | Instead |
|-------|-----|---------|
| Card-heavy layouts with large padding | Budget apps are spreadsheets; cards waste vertical space | Dense rows (36-40px) with hover/focus states |
| Animated number counters | Delayed truth is hostile in finance; users need instant accuracy | Instant numeric updates, no transitions on values |
| Multi-step wizard for simple actions | Adding a transaction should be one-row, one-Enter | Inline editing everywhere; modals only for multi-entity ops |
| Full-width color backgrounds for states | Overwhelms in a dense grid; competes with data | Left-border accents + subtle text color for state |
| Floating action buttons | Covers data, implies single primary action | Contextual actions in rows, headers, keyboard shortcuts |
| Soft pastel colors for financial signals | Ambiguous, accessibility-poor on dark backgrounds | High-saturation neon for signal, muted for chrome |
| Auto-categorization or "smart" suggestions | PRD explicitly requires manual intentional budgeting | User assigns every dollar; autocomplete assists, never decides |
| Confirmation dialogs for non-destructive ops | Creates friction on the happy path | Undo pattern instead — act first, offer reversal |
| Skeleton screens longer than 200ms | If IDB hydration takes >200ms, the real fix is perf, not UI | Show real data fast; skeleton is last resort |
| Tooltip overuse | Clutters UI, slows interaction | Keyboard hints inline (`Kbd` component), discoverable settings |
| Infinite scroll with no position context | Disorienting for 10k transactions | Virtual scroll with sticky date headers + visible scroll position |
| Light mode as primary with dark as afterthought | This is a dark-first app; light mode is not planned | Dark only; consistent, predictable, tested |
