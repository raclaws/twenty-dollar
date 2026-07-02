use rusqlite::Connection;
use crate::db;
use crate::error::AppResult;
use crate::models::import_rule::{ImportRule, CreateImportRule, UpdateImportRule};

pub fn list_rules(conn: &Connection, user_id: &str) -> AppResult<Vec<ImportRule>> {
    Ok(db::import_rules::list_rules(conn, user_id)?)
}

pub fn create_rule(conn: &Connection, user_id: &str, input: CreateImportRule) -> AppResult<ImportRule> {
    let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let rule = ImportRule {
        id,
        tokens: input.tokens,
        payee_id: input.payee_id,
        category_id: input.category_id,
        created_at: now,
    };
    db::import_rules::insert_rule(conn, &rule, user_id)?;
    Ok(rule)
}

pub fn update_rule(conn: &Connection, user_id: &str, id: &str, input: UpdateImportRule) -> AppResult<()> {
    db::import_rules::update_rule(conn, id, user_id, input.payee_id.as_deref(), input.category_id.as_deref())?;
    Ok(())
}

pub fn delete_rule(conn: &Connection, user_id: &str, id: &str) -> AppResult<()> {
    db::import_rules::delete_rule(conn, id, user_id)?;
    Ok(())
}
