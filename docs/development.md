# Development Guide

## Setup

### Prerequisites
- Rust (latest stable)
- Node.js 18+
- npm

### Backend
```bash
cd twenty-dollar
cargo run
```
Starts on `localhost:3001`. Creates `twenty_dollar.db` on first run with seed data.

### Frontend
```bash
cd twenty-dollar/frontend
npm install
npm run dev
```
Starts on `localhost:5173`. Proxies `/api/*` to backend.

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/lib/budget-engine.ts` | Pure budget computation (targets, assigned, available) |
| `frontend/src/lib/store.ts` | IndexedDB store + schema + seed data |
| `frontend/src/lib/sync-engine/` | Offline-first sync primitives |
| `frontend/src/lib/api.ts` | REST client with sync status integration |
| `frontend/src/components/SyncIndicator.tsx` | Connection state + retry loop |
| `frontend/src/components/HealthRing.tsx` | SVG donut indicator |
| `frontend/src/views/budget/BudgetGrid.tsx` | Budget table with sort |
| `frontend/src/views/budget/CategoryRow.tsx` | Category row (target bar, status, health ring) |
| `frontend/src/views/budget/CoverDialog.tsx` | Move Budget dialog |
| `frontend/src/views/budget/TargetDialog.tsx` | Set/edit target popup |
| `src/app.rs` | Axum router + all API routes |
| `src/db/schema.rs` | SQLite migrations |

## Conventions

- **Offline-first**: Never revert local state on API failure. `.catch(() => {})` on all fire-and-forget calls.
- **No comments unless WHY is non-obvious**: Code is self-documenting.
- **Tokens over hardcoded values**: Use `var(--sp-*)`, `var(--fs-*)`, `var(--c-*)` from `tokens.css`.
- **Flex column alignment**: Fixed columns use `flex-shrink: 0` + `min-width` + `max-width`. Flexible columns use `flex: N`.
- **Keyboard**: Enter submits, Escape dismisses (layered — innermost first), Ctrl+Enter for multi-field forms.
- **Lucide icons**: All icons from `lucide-solid`. 14-16px for UI, 11-12px for inline indicators.

## Testing

```bash
# Backend
cargo test

# Frontend build check
cd frontend && npx vite build
```

No frontend test framework yet — verify via browser QA.
