# 20 Dollar

A YNAB-inspired personal budget app. Offline-first PWA with local-first data and optional server sync.

## Stack

- **Frontend**: Solid.js, Vite, TypeScript, Catppuccin Mocha theme
- **Backend**: Rust, Axum, SQLite (rusqlite + r2d2 pool)
- **Data layer**: Custom sync engine (IndexedDB local, REST push/pull)

## Current Status

### Done
- Full budget management (categories, groups, assign, move budget)
- Category targets/goals (monthly, by-date, savings) with progress bars
- Health ring indicators (available/activity ratio)
- Transaction management (CRUD, inline edit, split entries, transfers)
- Account management (multiple accounts, balances)
- Undo/redo with Ctrl+Z stack
- Soft delete with 30-day purge + Recently Deleted
- Category detail dialog with inline editing
- Move Budget dialog with context cards + smart All button
- Sync indicator (offline/reconnecting/connected states with retry loop)
- Sort columns (budget grid + transaction table)
- Right-click context menus throughout
- Target dialog (set/edit/remove targets with 3 types)
- Cover Overspent (auto-cover from funded categories)

### Architecture
- Offline-first: all writes go to IndexedDB, API calls are fire-and-forget
- Sync indicator tracks connection state (red/blue/green)
- Backend serves REST API on port 3001, frontend proxies via Vite dev server
- Budget engine is a pure computation layer (`computeBudget()`, `computeTargetStatus()`)

## Development

```bash
# Backend
cargo run

# Frontend
cd frontend
npm install
npm run dev
```

Backend runs on `localhost:3001`, frontend on `localhost:5173` (proxies `/api` to backend).

## Project Structure

```
├── src/                    # Rust backend
│   ├── main.rs            # Entry point
│   ├── app.rs             # Router + routes
│   ├── handlers/          # HTTP handlers
│   ├── models/            # Data models
│   ├── db/                # Database layer + migrations
│   └── services/          # Business logic
├── frontend/              # Solid.js PWA
│   ├── src/
│   │   ├── App.tsx        # Shell + sidebar + providers
│   │   ├── lib/           # Engine, store, sync, utils
│   │   ├── views/         # Pages (budget, accounts, transactions, settings)
│   │   ├── components/    # Shared components
│   │   └── styles/        # CSS (tokens, layout, per-view)
│   └── vite.config.ts
├── Cargo.toml
└── .gitignore
```
