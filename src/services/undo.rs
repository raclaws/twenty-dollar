use rusqlite::Connection;
use crate::db;
use crate::error::AppResult;
use crate::models::undo::{Mutation, UndoOperation};

pub fn record_undo(conn: &Connection, user_id: &str, description: &str, forward: Vec<Mutation>, inverse: Vec<Mutation>) -> AppResult<()> {
    let op = UndoOperation {
        description: description.to_string(),
        forward,
        inverse,
    };
    let now = chrono::Utc::now().to_rfc3339();
    db::undo::push_undo(conn, &op, user_id, &now)?;
    Ok(())
}

pub fn undo(conn: &Connection) -> AppResult<Option<String>> {
    let entry = db::undo::pop_undo(conn)?;
    if let Some((_id, op)) = entry {
        db::undo::apply_mutations(conn, &op.inverse)?;
        Ok(Some(op.description))
    } else {
        Ok(None)
    }
}

pub fn redo(conn: &Connection) -> AppResult<Option<String>> {
    let entry = db::undo::pop_redo(conn)?;
    if let Some((_id, op)) = entry {
        db::undo::apply_mutations(conn, &op.forward)?;
        Ok(Some(op.description))
    } else {
        Ok(None)
    }
}
