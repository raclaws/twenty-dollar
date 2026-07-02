pub mod accounts;
pub mod assignments;
pub mod auth;
pub mod categories;
pub mod import_rules;
pub mod payees;
pub mod schedules;
pub mod schema;
pub mod transactions;
pub mod transfers;
pub mod undo;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

pub type DbPool = Pool<SqliteConnectionManager>;

pub fn init_pool(path: &str) -> Result<DbPool, r2d2::Error> {
    let manager = SqliteConnectionManager::file(path)
        .with_init(|conn| {
            conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
        });
    Pool::builder().max_size(4).build(manager)
}

pub fn init_memory_pool() -> Result<DbPool, r2d2::Error> {
    let manager = SqliteConnectionManager::memory()
        .with_init(|conn| {
            conn.execute_batch("PRAGMA foreign_keys = ON;")
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
        });
    Pool::builder().max_size(1).build(manager)
}
