use rusqlite::{params, Connection};
use crate::models::payee::Payee;

pub fn list_payees(conn: &Connection, user_id: &str) -> Result<Vec<Payee>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, type, account_id, created_at FROM payees WHERE user_id = ?1 ORDER BY name"
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        Ok(Payee {
            id: row.get(0)?,
            name: row.get(1)?,
            payee_type: row.get(2)?,
            account_id: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    let mut payees = Vec::new();
    for row in rows {
        payees.push(row?);
    }
    Ok(payees)
}

pub fn insert_payee(conn: &Connection, payee: &Payee, user_id: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO payees (id, user_id, name, type, account_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![payee.id, user_id, payee.name, payee.payee_type, payee.account_id, payee.created_at],
    )?;
    Ok(())
}

pub fn get_payee(conn: &Connection, id: &str, user_id: &str) -> Result<Option<Payee>, rusqlite::Error> {
    use rusqlite::OptionalExtension;
    conn.query_row(
        "SELECT id, name, type, account_id, created_at FROM payees WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
        |row| Ok(Payee {
            id: row.get(0)?,
            name: row.get(1)?,
            payee_type: row.get(2)?,
            account_id: row.get(3)?,
            created_at: row.get(4)?,
        }),
    ).optional()
}

pub fn delete_payee(conn: &Connection, id: &str, user_id: &str) -> Result<bool, rusqlite::Error> {
    let changed = conn.execute("DELETE FROM payees WHERE id = ?1 AND user_id = ?2", params![id, user_id])?;
    Ok(changed > 0)
}
