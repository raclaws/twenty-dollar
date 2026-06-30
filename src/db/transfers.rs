use rusqlite::{params, Connection, OptionalExtension};
use crate::models::transfer::Transfer;

pub fn list_transfers(conn: &Connection) -> Result<Vec<Transfer>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, from_account_id, to_account_id, date, amount, memo, cleared, created_at
         FROM transfers ORDER BY date DESC, created_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Transfer {
            id: row.get(0)?,
            from_account_id: row.get(1)?,
            to_account_id: row.get(2)?,
            date: row.get(3)?,
            amount: row.get(4)?,
            memo: row.get(5)?,
            cleared: row.get::<_, i32>(6)? != 0,
            created_at: row.get(7)?,
        })
    })?;
    let mut transfers = Vec::new();
    for row in rows {
        transfers.push(row?);
    }
    Ok(transfers)
}

pub fn get_transfer(conn: &Connection, id: &str) -> Result<Option<Transfer>, rusqlite::Error> {
    conn.query_row(
        "SELECT id, from_account_id, to_account_id, date, amount, memo, cleared, created_at
         FROM transfers WHERE id = ?1",
        params![id],
        |row| Ok(Transfer {
            id: row.get(0)?,
            from_account_id: row.get(1)?,
            to_account_id: row.get(2)?,
            date: row.get(3)?,
            amount: row.get(4)?,
            memo: row.get(5)?,
            cleared: row.get::<_, i32>(6)? != 0,
            created_at: row.get(7)?,
        }),
    ).optional()
}

pub fn insert_transfer(conn: &Connection, t: &Transfer) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO transfers (id, from_account_id, to_account_id, date, amount, memo, cleared, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![t.id, t.from_account_id, t.to_account_id, t.date, t.amount, t.memo, t.cleared as i32, t.created_at],
    )?;
    Ok(())
}

pub fn delete_transfer(conn: &Connection, id: &str) -> Result<bool, rusqlite::Error> {
    let changed = conn.execute("DELETE FROM transfers WHERE id = ?1", params![id])?;
    Ok(changed > 0)
}
