use axum::{extract::State, Extension, Json};
use axum::http::HeaderMap;
use serde_json::json;
use crate::app::AppState;
use crate::error::AppError;

pub async fn reset_data(
    headers: HeaderMap,
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let confirm = headers.get("x-confirm-destructive")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if confirm != "yes-delete-all-data" {
        return Err(AppError::Validation("Missing X-Confirm-Destructive: yes-delete-all-data header".into()));
    }

    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute("DELETE FROM split_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE user_id = ?1))", rusqlite::params![user_id])?;
        conn.execute("DELETE FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE user_id = ?1)", rusqlite::params![user_id])?;
        conn.execute("DELETE FROM transfers WHERE from_account_id IN (SELECT id FROM accounts WHERE user_id = ?1)", rusqlite::params![user_id])?;
        conn.execute("DELETE FROM schedules WHERE user_id = ?1", rusqlite::params![user_id])?;
        conn.execute("DELETE FROM assignments WHERE category_id IN (SELECT id FROM categories WHERE group_id IN (SELECT id FROM category_groups WHERE user_id = ?1))", rusqlite::params![user_id])?;
        conn.execute("DELETE FROM accounts WHERE user_id = ?1", rusqlite::params![user_id])?;
        conn.execute("DELETE FROM payees WHERE user_id = ?1", rusqlite::params![user_id])?;
        conn.execute("DELETE FROM undo_log WHERE user_id = ?1", rusqlite::params![user_id])?;
        conn.execute("DELETE FROM month_locks WHERE user_id = ?1", rusqlite::params![user_id])?;
        conn.execute("UPDATE categories SET target_type = NULL, target_amount = NULL, target_date = NULL WHERE group_id IN (SELECT id FROM category_groups WHERE user_id = ?1)", rusqlite::params![user_id])?;
        Ok::<_, AppError>(())
    }).await.map_err(|e| AppError::Internal(e.to_string()))??;

    Ok(Json(json!({ "ok": true })))
}
