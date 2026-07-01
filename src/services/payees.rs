use rusqlite::Connection;
use crate::db;
use crate::error::AppResult;
use crate::models::payee::{Payee, CreatePayee};

pub fn list_payees(conn: &Connection, user_id: &str) -> AppResult<Vec<Payee>> {
    Ok(db::payees::list_payees(conn, user_id)?)
}

pub fn create_payee(conn: &Connection, user_id: &str, input: CreatePayee) -> AppResult<Payee> {
    let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let payee = Payee {
        id,
        name: input.name,
        payee_type: input.payee_type,
        account_id: input.account_id,
        created_at: now,
    };
    db::payees::insert_payee(conn, &payee, user_id)?;
    Ok(payee)
}

pub fn delete_payee(conn: &Connection, user_id: &str, id: &str) -> AppResult<()> {
    db::payees::delete_payee(conn, id, user_id)?;
    Ok(())
}
