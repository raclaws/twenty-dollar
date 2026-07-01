use rusqlite::Connection;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::transfer::{Transfer, CreateTransfer};
use crate::models::undo::Mutation;
use crate::services::undo::record_undo;

pub fn list_transfers(conn: &Connection) -> AppResult<Vec<Transfer>> {
    Ok(db::transfers::list_transfers(conn)?)
}

pub fn create_transfer(conn: &Connection, user_id: &str, input: CreateTransfer) -> AppResult<Transfer> {
    if input.amount <= 0 {
        return Err(AppError::Validation("Transfer amount must be positive".into()));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let t = Transfer {
        id: id.clone(),
        from_account_id: input.from_account_id,
        to_account_id: input.to_account_id,
        date: input.date,
        amount: input.amount,
        memo: input.memo,
        cleared: input.cleared.unwrap_or(false),
        created_at: now,
    };
    db::transfers::insert_transfer(conn, &t)?;

    record_undo(conn, user_id, "Create transfer", vec![
        Mutation::Insert { table: "transfers".into(), data: serde_json::to_value(&t).unwrap() }
    ], vec![
        Mutation::Delete { table: "transfers".into(), id }
    ])?;

    Ok(t)
}

pub fn delete_transfer(conn: &Connection, user_id: &str, id: &str) -> AppResult<()> {
    let existing = db::transfers::get_transfer(conn, id)?
        .ok_or_else(|| AppError::NotFound(format!("Transfer {}", id)))?;

    db::transfers::delete_transfer(conn, id)?;

    record_undo(conn, user_id, "Delete transfer", vec![
        Mutation::Delete { table: "transfers".into(), id: id.to_string() }
    ], vec![
        Mutation::Insert { table: "transfers".into(), data: serde_json::to_value(&existing).unwrap() }
    ])?;

    Ok(())
}
