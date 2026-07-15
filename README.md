# 20 Dollar

A YNAB-inspired envelope budget app for personal use. Offline-first with local-first data and server sync.

## Features

- Envelope budgeting with Ready to Assign (RTA), category groups, targets (monthly/savings/by-date)
- Transaction management with inline editing, grouping, bulk actions, keyboard nav
- Multiple accounts with transfers, reconciliation, starting balances
- Scheduled/recurring transactions with auto-generation
- Smart Import: paste/CSV/PDF bank statements with auto-categorization and import rules
- YNAB Import: one-click migration from YNAB TSV exports (accounts, categories, transactions, assignments)
- Undo/redo (Ctrl+Z/Y) with 50-entry stack
- Health rings, target progress bars, budget status counters
- Dark theme (Catppuccin Mocha with Figtree + JetBrains Mono fonts)

## Stack

- **Frontend**: Solid.js, Vite, TypeScript
- **Backend**: Rust, Axum, SQLite (rusqlite + r2d2 pool)
- **Data layer**: Custom sync engine (IndexedDB client-side, REST push/pull to server)
- **Auth**: Cookie sessions, Argon2id password hashing, rate-limited login
- **Security**: HSTS, X-Frame-Options, X-Content-Type-Options, Secure cookies, 2MB body limit

## Quick Start (Docker)

```bash
git clone https://github.com/raclaws/twenty-dollar.git
cd twenty-dollar
cp .env.example .env
docker compose up -d
```

App runs at `http://localhost:3001`. First visit shows the setup page.

## Deployment

### Option 1: Docker Compose (recommended)

```bash
cp .env.example .env
# Edit .env if needed (PORT, DATA_DIR)
docker compose up -d
```

Data persists in `./data/` (or whatever `DATA_DIR` is set to).

### Option 2: Build from source

#### Prerequisites

- Rust 1.79+ (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Node.js 20+ (`nvm install 20` or distro package)
- npm

#### Build

```bash
# Frontend
cd frontend
npm ci
npm run build
cd ..

# Backend
cargo build --release
```

#### Run

```bash
export DATABASE_PATH=./data/twenty_dollar.db
export STATIC_DIR=./frontend/dist
export RUST_LOG=twenty_dollar=info

mkdir -p ./data
./target/release/twenty-dollar
```

App serves on `0.0.0.0:3001` — both API and static frontend from one binary.

### Option 3: Systemd service (Linux)

After building from source:

```bash
sudo mkdir -p /opt/twenty-dollar /var/lib/twenty-dollar
sudo cp target/release/twenty-dollar /opt/twenty-dollar/
sudo cp -r frontend/dist /opt/twenty-dollar/static
```

Create `/etc/systemd/system/twenty-dollar.service`:

```ini
[Unit]
Description=Twenty Dollar Budget App
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/twenty-dollar
ExecStart=/opt/twenty-dollar/twenty-dollar
Environment=DATABASE_PATH=/var/lib/twenty-dollar/twenty_dollar.db
Environment=STATIC_DIR=/opt/twenty-dollar/static
Environment=RUST_LOG=twenty_dollar=info
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /var/lib/twenty-dollar
sudo systemctl daemon-reload
sudo systemctl enable --now twenty-dollar
```

### Linux distro notes

| Distro | Rust | Node.js |
|--------|------|---------|
| Ubuntu/Debian | `apt install build-essential pkg-config libssl-dev` + rustup | `apt install nodejs npm` or nvm |
| Fedora/RHEL | `dnf install gcc openssl-devel` + rustup | `dnf install nodejs npm` |
| Arch | `pacman -S base-devel openssl` + rustup | `pacman -S nodejs npm` |
| Alpine | `apk add build-base openssl-dev` + rustup | `apk add nodejs npm` |

SQLite is statically compiled via `rusqlite`'s `bundled` feature — no system SQLite needed.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `twenty_dollar.db` | SQLite file path |
| `STATIC_DIR` | `./frontend/dist` | Built frontend assets |
| `RUST_LOG` | `twenty_dollar=info` | Log level |
| `PORT` | `3001` (hardcoded) | Server port |

### Reverse proxy (recommended for production)

Put nginx in front for TLS termination:

```nginx
server {
    listen 80;
    server_name budget.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name budget.example.com;

    ssl_certificate /etc/letsencrypt/live/budget.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/budget.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 2M;
    }
}
```

The app sets security headers (HSTS, X-Frame-Options, X-Content-Type-Options) at the Axum layer. Session cookies require HTTPS (Secure flag set).

---

## Development

```bash
# Backend
cargo run

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Backend runs on `localhost:3001`, frontend on `localhost:5173` (proxies `/api` to backend).

## Project Structure

```
├── src/                    # Rust backend
│   ├── main.rs            # Entry point
│   ├── app.rs             # Router + static file serving
│   ├── handlers/          # HTTP handlers
│   ├── models/            # Data models
│   ├── db/                # Database layer + migrations
│   ├── middleware/        # Auth middleware
│   └── services/          # Business logic
├── frontend/              # Solid.js PWA
│   ├── src/
│   │   ├── App.tsx        # Shell + sidebar + providers
│   │   ├── lib/           # Engine, store, sync, utils
│   │   ├── views/         # Pages (budget, accounts, transactions, settings)
│   │   ├── components/    # Shared components
│   │   └── styles/        # CSS (tokens, layout, per-view)
│   └── vite.config.ts
├── Dockerfile             # Multi-stage build
├── docker-compose.yml     # One-command deployment
├── .env.example           # Environment template
└── Cargo.toml
```
