use rusqlite::Connection;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::account::{Account, CreateAccount, UpdateAccount};
use crate::models::undo::Mutation;
use crate::services::undo::record_undo;

pub fn list_accounts(conn: &Connection, user_id: &str) -> AppResult<Vec<Account>> {
    Ok(db::accounts::list_accounts(conn, user_id)?)
}

pub fn create_account(conn: &Connection, user_id: &str, input: CreateAccount) -> AppResult<Account> {
    let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let acc = Account {
        id: id.clone(),
        name: input.name,
        account_type: input.account_type,
        sort_order: input.sort_order.unwrap_or(0),
        created_at: now,
    };
    db::accounts::insert_account(conn, &acc, user_id)?;

    record_undo(conn, user_id, &format!("Create account '{}'", acc.name), vec![
        Mutation::Insert { table: "accounts".into(), data: serde_json::to_value(&acc).unwrap() }
    ], vec![
        Mutation::Delete { table: "accounts".into(), id }
    ])?;

    Ok(acc)
}

pub fn update_account(conn: &Connection, user_id: &str, id: &str, input: UpdateAccount) -> AppResult<Account> {
    let existing = db::accounts::get_account(conn, id, user_id)?
        .ok_or_else(|| AppError::NotFound(format!("Account {}", id)))?;

    let prev = serde_json::to_value(&existing).unwrap();
    db::accounts::update_account(
        conn, id, user_id,
        input.name.as_deref(),
        input.account_type.as_ref(),
        input.sort_order,
    )?;

    let updated = db::accounts::get_account(conn, id, user_id)?.unwrap();
    let fields = serde_json::to_value(&updated).unwrap();

    record_undo(conn, user_id, &format!("Update account '{}'", updated.name), vec![
        Mutation::Update { table: "accounts".into(), id: id.to_string(), fields: fields.clone(), prev: prev.clone() }
    ], vec![
        Mutation::Update { table: "accounts".into(), id: id.to_string(), fields: prev, prev: fields }
    ])?;

    Ok(updated)
}

pub fn delete_account(conn: &Connection, user_id: &str, id: &str) -> AppResult<()> {
    let existing = db::accounts::get_account(conn, id, user_id)?
        .ok_or_else(|| AppError::NotFound(format!("Account {}", id)))?;

    db::accounts::delete_account(conn, id, user_id)?;

    record_undo(conn, user_id, &format!("Delete account '{}'", existing.name), vec![
        Mutation::Delete { table: "accounts".into(), id: id.to_string() }
    ], vec![
        Mutation::Insert { table: "accounts".into(), data: serde_json::to_value(&existing).unwrap() }
    ])?;

    Ok(())
}
