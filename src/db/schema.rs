use rusqlite::Connection;

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('checking','savings','cash','credit')),
            icon TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS category_groups (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            icon TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL REFERENCES category_groups(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            icon TEXT,
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
            payee_id TEXT,
            amount INTEGER NOT NULL,
            memo TEXT,
            cleared INTEGER NOT NULL DEFAULT 0,
            linked_id TEXT,
            reconciled_at TEXT,
            schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL,
            source TEXT DEFAULT 'manual',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
            payee TEXT,
            amount INTEGER NOT NULL,
            memo TEXT,
            frequency TEXT NOT NULL CHECK(frequency IN ('weekly','biweekly','monthly','yearly')),
            next_due TEXT NOT NULL,
            end_date TEXT,
            auto_clear INTEGER NOT NULL DEFAULT 1,
            paused INTEGER NOT NULL DEFAULT 0,
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
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

        CREATE TABLE IF NOT EXISTS payees (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type TEXT,
            account_id TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS undo_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            operation TEXT NOT NULL,
            undone INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
        CREATE INDEX IF NOT EXISTS idx_category_groups_user ON category_groups(user_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category_id, date);
        CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
        CREATE INDEX IF NOT EXISTS idx_assignments_category_month ON assignments(category_id, month);
        CREATE INDEX IF NOT EXISTS idx_split_entries_transaction ON split_entries(transaction_id);
        CREATE INDEX IF NOT EXISTS idx_split_entries_category ON split_entries(category_id);
        CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_account_id);
        CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_account_id);
        CREATE INDEX IF NOT EXISTS idx_payees_user ON payees(user_id);
        CREATE INDEX IF NOT EXISTS idx_undo_log_user ON undo_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_month_locks_user ON month_locks(user_id);
        CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules(user_id);
        CREATE INDEX IF NOT EXISTS idx_schedules_next_due ON schedules(next_due);
        CREATE INDEX IF NOT EXISTS idx_transactions_schedule ON transactions(schedule_id);

        CREATE TABLE IF NOT EXISTS user_preferences (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            currency TEXT NOT NULL DEFAULT 'USD'
        );

        CREATE TABLE IF NOT EXISTS import_rules (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            tokens TEXT NOT NULL,
            payee_id TEXT,
            category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_import_rules_user ON import_rules(user_id);
        "
    )?;

    // Migrations for existing databases
    let has_source: bool = conn.prepare("SELECT source FROM transactions LIMIT 0")
        .is_ok();
    if !has_source {
        conn.execute_batch("ALTER TABLE transactions ADD COLUMN source TEXT DEFAULT 'manual';")?;
    }

    let has_payee_id: bool = conn.prepare("SELECT payee_id FROM transactions LIMIT 0")
        .is_ok();
    if !has_payee_id {
        conn.execute_batch("ALTER TABLE transactions ADD COLUMN payee_id TEXT;")?;
    }

    let has_linked_id: bool = conn.prepare("SELECT linked_id FROM transactions LIMIT 0")
        .is_ok();
    if !has_linked_id {
        conn.execute_batch("ALTER TABLE transactions ADD COLUMN linked_id TEXT;")?;
    }

    let has_reconciled_at: bool = conn.prepare("SELECT reconciled_at FROM transactions LIMIT 0")
        .is_ok();
    if !has_reconciled_at {
        conn.execute_batch("ALTER TABLE transactions ADD COLUMN reconciled_at TEXT;")?;
    }

    let has_schedule_id: bool = conn.prepare("SELECT schedule_id FROM transactions LIMIT 0")
        .is_ok();
    if !has_schedule_id {
        conn.execute_batch("ALTER TABLE transactions ADD COLUMN schedule_id TEXT;")?;
    }

    Ok(())
}
