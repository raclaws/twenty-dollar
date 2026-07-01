use rusqlite::{params, Connection};
use rusqlite::OptionalExtension;
use crate::models::undo::{Mutation, UndoOperation};

const ALLOWED_TABLES: &[&str] = &[
    "accounts", "category_groups", "categories", "transactions",
    "split_entries", "assignments", "transfers", "month_locks",
];

fn validate_table(table: &str) -> Result<(), rusqlite::Error> {
    if ALLOWED_TABLES.contains(&table) {
        Ok(())
    } else {
        Err(rusqlite::Error::InvalidParameterName(format!("disallowed table: {}", table)))
    }
}

fn validate_column(col: &str) -> Result<(), rusqlite::Error> {
    if col.chars().all(|c| c.is_alphanumeric() || c == '_') {
        Ok(())
    } else {
        Err(rusqlite::Error::InvalidParameterName(format!("disallowed column: {}", col)))
    }
}

pub fn push_undo(conn: &Connection, op: &UndoOperation, user_id: &str, created_at: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM undo_log WHERE undone = 1 AND user_id = ?1", params![user_id])?;
    let json = serde_json::to_string(op).unwrap();
    conn.execute(
        "INSERT INTO undo_log (user_id, operation, undone, created_at) VALUES (?1, ?2, 0, ?3)",
        params![user_id, json, created_at],
    )?;
    Ok(())
}

pub fn pop_undo(conn: &Connection) -> Result<Option<(i64, UndoOperation)>, rusqlite::Error> {
    let result: Option<(i64, String)> = conn.query_row(
        "SELECT id, operation FROM undo_log WHERE undone = 0 ORDER BY id DESC LIMIT 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).optional()?;

    if let Some((id, json)) = result {
        conn.execute("UPDATE undo_log SET undone = 1 WHERE id = ?1", params![id])?;
        let op: UndoOperation = serde_json::from_str(&json).unwrap();
        Ok(Some((id, op)))
    } else {
        Ok(None)
    }
}

pub fn pop_redo(conn: &Connection) -> Result<Option<(i64, UndoOperation)>, rusqlite::Error> {
    let result: Option<(i64, String)> = conn.query_row(
        "SELECT id, operation FROM undo_log WHERE undone = 1 ORDER BY id DESC LIMIT 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).optional()?;

    if let Some((id, json)) = result {
        conn.execute("UPDATE undo_log SET undone = 0 WHERE id = ?1", params![id])?;
        let op: UndoOperation = serde_json::from_str(&json).unwrap();
        Ok(Some((id, op)))
    } else {
        Ok(None)
    }
}

pub fn apply_mutations(conn: &Connection, mutations: &[Mutation]) -> Result<(), rusqlite::Error> {
    for mutation in mutations {
        match mutation {
            Mutation::Insert { table, data } => {
                validate_table(table)?;
                let obj = data.as_object().unwrap();
                let cols: Vec<&str> = obj.keys().map(|k| k.as_str()).collect();
                for col in &cols {
                    validate_column(col)?;
                }
                let placeholders: Vec<String> = (1..=cols.len()).map(|i| format!("?{}", i)).collect();
                let sql = format!(
                    "INSERT INTO \"{}\" ({}) VALUES ({})",
                    table,
                    cols.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", "),
                    placeholders.join(", ")
                );
                let values: Vec<Box<dyn rusqlite::types::ToSql>> = obj.values().map(json_value_to_sql).collect();
                let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
                conn.execute(&sql, params.as_slice())?;
            }
            Mutation::Delete { table, id } => {
                validate_table(table)?;
                let sql = format!("DELETE FROM \"{}\" WHERE id = ?1", table);
                conn.execute(&sql, params![id])?;
            }
            Mutation::Update { table, id, fields, .. } => {
                validate_table(table)?;
                let obj = fields.as_object().unwrap();
                let cols: Vec<&str> = obj.keys().map(|k| k.as_str()).collect();
                for col in &cols {
                    validate_column(col)?;
                }
                let sets: Vec<String> = cols.iter().map(|k| format!("\"{}\" = ?", k)).collect();
                let sql = format!("UPDATE \"{}\" SET {} WHERE id = ?", table, sets.join(", "));
                let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = obj.values().map(json_value_to_sql).collect();
                values.push(Box::new(id.clone()));
                let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
                conn.execute(&sql, params.as_slice())?;
            }
        }
    }
    Ok(())
}

fn json_value_to_sql(v: &serde_json::Value) -> Box<dyn rusqlite::types::ToSql> {
    match v {
        serde_json::Value::Null => Box::new(Option::<String>::None),
        serde_json::Value::Bool(b) => Box::new(*b as i32),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else if let Some(f) = n.as_f64() {
                Box::new(f)
            } else {
                Box::new(n.to_string())
            }
        }
        serde_json::Value::String(s) => Box::new(s.clone()),
        _ => Box::new(v.to_string()),
    }
}
