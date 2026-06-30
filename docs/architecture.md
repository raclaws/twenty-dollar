# Architecture

## Design Principles

1. **Offline-first**: All writes go to IndexedDB immediately. API calls are fire-and-forget with `.catch(() => {})`. The sync engine handles reconciliation.
2. **First-principle logic**: Budget engine is a pure function of inputs. No hidden state, no side effects in computation.
3. **Centralized design**: Column types, cell interactions, sort behavior, and context menus follow consistent patterns across all views.

## Data Flow

```
User Action → Local Store (IndexedDB) → Reactive Signal → UI Update
                    ↓
              API Call (fire-and-forget)
                    ↓
              Server (SQLite) — source of truth for multi-device
```

## Budget Engine

`computeBudget()` takes raw records and produces `BudgetMonth`:
- Groups → Categories → each with assigned, activity, available, target
- Pure function, no side effects, recomputes on any signal change

`computeTargetStatus()` evaluates target progress:
- `monthly`: progress = assigned / targetAmount
- `by_date`: progress = available / targetAmount, pace = remaining / months left
- `savings`: progress = available / targetAmount (no deadline)

## Sync Indicator States

| State | Color | Sidebar Label | Trigger |
|-------|-------|---------------|---------|
| offline | red | Offline \| Local only | Network error / no server |
| reconnecting | blue (slow pulse) | Connecting \| Local only | Retry loop every 8s |
| syncing | blue (fast pulse) | Online \| Saving... | API call in flight |
| error | red (flash 2s) | Online \| Save failed | HTTP 4xx/5xx response |
| connected | green | Online \| Saved | Successful API response |

## Target Types

| Type | Progress Source | Label | Icon |
|------|----------------|-------|------|
| monthly | assigned / target | "monthly target" | Repeat ↻ |
| by_date | available / target | "save by [date]" | Calendar 📅 |
| savings | available / target | "saving goal" | PiggyBank 🐷 |
| none | — | "Set target" | Target ◎ |

## Component Patterns

### Health Ring
SVG donut (20px) showing `available / |activity|` ratio:
- Green (≥0.75): healthy buffer
- Yellow (0.25–0.75): moderate
- Red (<0.25 or negative): danger

### Column Sort
3-state cycle: click → desc → asc → clear. Lucide icons: `ChevronsUpDown` (idle), `ChevronDown` (desc), `ChevronUp` (asc). Applies to both budget grid and transaction table.

### Context Menus
Right-click on any row. Category rows: View transactions, Move budget, Set target, Change group, Rename, Delete. Group rows: Add category, Rename, Delete.

### Status Labels
Mandatory for all categories:
- Overspent (red, AlertTriangle) → opens Move Budget as "to"
- Underfunded (yellow, TrendingDown) → opens Move Budget as "to"
- Unfunded (grey, CircleDot) → opens Move Budget as "to"
- Healthy (green, CheckCircle) → opens Move Budget as "from"
