use rusqlite::{params, Connection};
use rusqlite::OptionalExtension;

pub fn get_assignment(conn: &Connection, category_id: &str, month: &str) -> Result<Option<(String, i64)>, rusqlite::Error> {
    conn.query_row(
        "SELECT id, amount FROM assignments WHERE category_id = ?1 AND month = ?2",
        params![category_id, month],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).optional()
}

pub fn upsert_assignment(conn: &Connection, id: &str, category_id: &str, month: &str, amount: i64) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO assignments (id, category_id, month, amount) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(category_id, month) DO UPDATE SET amount = ?4",
        params![id, category_id, month, amount],
    )?;
    Ok(())
}

pub fn total_assigned_up_to(conn: &Connection, month: &str) -> Result<i64, rusqlite::Error> {
    conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM assignments WHERE month <= ?1",
        params![month],
        |row| row.get(0),
    )
}

pub fn assigned_for_month_batch(conn: &Connection, month: &str) -> Result<Vec<(String, i64)>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT category_id, SUM(amount) FROM assignments WHERE month = ?1 GROUP BY category_id"
    )?;
    let rows = stmt.query_map(params![month], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub fn cumulative_assigned_batch(conn: &Connection, up_to_month: &str) -> Result<Vec<(String, i64)>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT category_id, SUM(amount) FROM assignments WHERE month <= ?1 GROUP BY category_id"
    )?;
    let rows = stmt.query_map(params![up_to_month], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}
