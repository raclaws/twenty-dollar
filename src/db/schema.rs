use rusqlite::Connection;

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('checking','savings','cash','credit')),
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS category_groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL REFERENCES category_groups(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            target_type TEXT CHECK(target_type IN ('monthly_spending','monthly_contribution','target_balance_by_date','target_balance')),
            target_amount INTEGER,
            target_date TEXT
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
            date TEXT NOT NULL,
            payee TEXT,
            amount INTEGER NOT NULL,
            memo TEXT,
            cleared INTEGER NOT NULL DEFAULT 0,
            reconciled_at TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS split_entries (
            id TEXT PRIMARY KEY,
            transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
            category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
            amount INTEGER NOT NULL,
            memo TEXT
        );

        CREATE TABLE IF NOT EXISTS assignments (
            id TEXT PRIMARY KEY,
            category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            month TEXT NOT NULL,
            amount INTEGER NOT NULL,
            UNIQUE(category_id, month)
        );

        CREATE TABLE IF NOT EXISTS month_locks (
            month TEXT PRIMARY KEY,
            locked INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS transfers (
            id TEXT PRIMARY KEY,
            from_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            to_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            amount INTEGER NOT NULL,
            memo TEXT,
            cleared INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS undo_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation TEXT NOT NULL,
            undone INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category_id, date);
        CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
        CREATE INDEX IF NOT EXISTS idx_assignments_category_month ON assignments(category_id, month);
        CREATE INDEX IF NOT EXISTS idx_split_entries_transaction ON split_entries(transaction_id);
        CREATE INDEX IF NOT EXISTS idx_split_entries_category ON split_entries(category_id);
        CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_account_id);
        CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_account_id);
        "
    )
}
