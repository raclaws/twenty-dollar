use rusqlite::{params, Connection};
use crate::models::import_rule::ImportRule;

pub fn list_rules(conn: &Connection, user_id: &str) -> Result<Vec<ImportRule>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, tokens, payee_id, category_id, created_at FROM import_rules WHERE user_id = ?1 ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        Ok(ImportRule {
            id: row.get(0)?,
            tokens: row.get(1)?,
            payee_id: row.get(2)?,
            category_id: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    let mut rules = Vec::new();
    for row in rows {
        rules.push(row?);
    }
    Ok(rules)
}

pub fn insert_rule(conn: &Connection, rule: &ImportRule, user_id: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO import_rules (id, user_id, tokens, payee_id, category_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![rule.id, user_id, rule.tokens, rule.payee_id, rule.category_id, rule.created_at],
    )?;
    Ok(())
}

pub fn update_rule(conn: &Connection, id: &str, user_id: &str, payee_id: Option<&str>, category_id: Option<&str>) -> Result<bool, rusqlite::Error> {
    let changed = conn.execute(
        "UPDATE import_rules SET payee_id = ?1, category_id = ?2 WHERE id = ?3 AND user_id = ?4",
        params![payee_id, category_id, id, user_id],
    )?;
    Ok(changed > 0)
}

pub fn delete_rule(conn: &Connection, id: &str, user_id: &str) -> Result<bool, rusqlite::Error> {
    let changed = conn.execute(
        "DELETE FROM import_rules WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
    )?;
    Ok(changed > 0)
}
