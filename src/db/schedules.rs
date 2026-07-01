use rusqlite::{params, Connection, OptionalExtension};
use crate::models::schedule::Schedule;

pub fn list_schedules(conn: &Connection, user_id: &str) -> Result<Vec<Schedule>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, account_id, category_id, payee, amount, memo, frequency, next_due, end_date, auto_clear, paused, created_at
         FROM schedules WHERE user_id = ?1 ORDER BY next_due"
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        Ok(Schedule {
            id: row.get(0)?,
            account_id: row.get(1)?,
            category_id: row.get(2)?,
            payee: row.get(3)?,
            amount: row.get(4)?,
            memo: row.get(5)?,
            frequency: row.get(6)?,
            next_due: row.get(7)?,
            end_date: row.get(8)?,
            auto_clear: row.get::<_, i32>(9)? != 0,
            paused: row.get::<_, i32>(10)? != 0,
            created_at: row.get(11)?,
        })
    })?;
    let mut schedules = Vec::new();
    for row in rows {
        schedules.push(row?);
    }
    Ok(schedules)
}

pub fn get_schedule(conn: &Connection, id: &str, user_id: &str) -> Result<Option<Schedule>, rusqlite::Error> {
    conn.query_row(
        "SELECT id, account_id, category_id, payee, amount, memo, frequency, next_due, end_date, auto_clear, paused, created_at
         FROM schedules WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
        |row| Ok(Schedule {
            id: row.get(0)?,
            account_id: row.get(1)?,
            category_id: row.get(2)?,
            payee: row.get(3)?,
            amount: row.get(4)?,
            memo: row.get(5)?,
            frequency: row.get(6)?,
            next_due: row.get(7)?,
            end_date: row.get(8)?,
            auto_clear: row.get::<_, i32>(9)? != 0,
            paused: row.get::<_, i32>(10)? != 0,
            created_at: row.get(11)?,
        }),
    ).optional()
}

pub fn insert_schedule(conn: &Connection, s: &Schedule, user_id: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO schedules (id, user_id, account_id, category_id, payee, amount, memo, frequency, next_due, end_date, auto_clear, paused, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            s.id, user_id, s.account_id, s.category_id, s.payee, s.amount, s.memo,
            s.frequency, s.next_due, s.end_date, s.auto_clear as i32, s.paused as i32, s.created_at
        ],
    )?;
    Ok(())
}

pub fn update_schedule_fields(conn: &Connection, id: &str, user_id: &str, fields: &[(&str, Box<dyn rusqlite::types::ToSql>)]) -> Result<bool, rusqlite::Error> {
    if fields.is_empty() {
        return Ok(false);
    }
    let sets: Vec<String> = fields.iter().enumerate().map(|(i, (col, _))| format!("{} = ?{}", col, i + 1)).collect();
    let sql = format!("UPDATE schedules SET {} WHERE id = ?{} AND user_id = ?{}", sets.join(", "), fields.len() + 1, fields.len() + 2);

    let mut param_values: Vec<&dyn rusqlite::types::ToSql> = fields.iter().map(|(_, v)| v.as_ref()).collect();
    let id_owned = id.to_string();
    let uid_owned = user_id.to_string();
    param_values.push(&id_owned);
    param_values.push(&uid_owned);

    let changed = conn.execute(&sql, param_values.as_slice())?;
    Ok(changed > 0)
}

pub fn delete_schedule(conn: &Connection, id: &str, user_id: &str) -> Result<bool, rusqlite::Error> {
    let changed = conn.execute("DELETE FROM schedules WHERE id = ?1 AND user_id = ?2", params![id, user_id])?;
    Ok(changed > 0)
}

pub fn due_schedules(conn: &Connection, user_id: &str, today: &str) -> Result<Vec<Schedule>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, account_id, category_id, payee, amount, memo, frequency, next_due, end_date, auto_clear, paused, created_at
         FROM schedules WHERE user_id = ?1 AND paused = 0 AND next_due <= ?2
         AND (end_date IS NULL OR end_date >= ?2)"
    )?;
    let rows = stmt.query_map(params![user_id, today], |row| {
        Ok(Schedule {
            id: row.get(0)?,
            account_id: row.get(1)?,
            category_id: row.get(2)?,
            payee: row.get(3)?,
            amount: row.get(4)?,
            memo: row.get(5)?,
            frequency: row.get(6)?,
            next_due: row.get(7)?,
            end_date: row.get(8)?,
            auto_clear: row.get::<_, i32>(9)? != 0,
            paused: row.get::<_, i32>(10)? != 0,
            created_at: row.get(11)?,
        })
    })?;
    let mut schedules = Vec::new();
    for row in rows {
        schedules.push(row?);
    }
    Ok(schedules)
}

pub fn advance_next_due(conn: &Connection, id: &str, new_next_due: &str) -> Result<(), rusqlite::Error> {
    conn.execute("UPDATE schedules SET next_due = ?1 WHERE id = ?2", params![new_next_due, id])?;
    Ok(())
}
