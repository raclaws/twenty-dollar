use rusqlite::Connection;
use crate::error::{AppError, AppResult};

pub fn assert_month_unlocked(conn: &Connection, month: &str) -> AppResult<()> {
    let locked: bool = conn.query_row(
        "SELECT locked FROM month_locks WHERE month = ?1",
        rusqlite::params![month],
        |row| row.get(0),
    ).unwrap_or(false);

    if locked {
        return Err(AppError::MonthLocked(month.to_string()));
    }
    Ok(())
}

pub fn set_month_lock(conn: &Connection, month: &str, locked: bool) -> AppResult<()> {
    conn.execute(
        "INSERT INTO month_locks (month, locked) VALUES (?1, ?2)
         ON CONFLICT(month) DO UPDATE SET locked = ?2",
        rusqlite::params![month, locked as i32],
    )?;
    Ok(())
}
