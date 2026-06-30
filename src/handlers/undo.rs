use axum::{extract::State, Json};
use crate::app::AppState;
use crate::error::AppResult;
use crate::services;

pub async fn undo(
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    let description = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::undo::undo(&conn)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;

    match description {
        Some(desc) => Ok(Json(serde_json::json!({"undone": desc}))),
        None => Ok(Json(serde_json::json!({"undone": null, "message": "Nothing to undo"}))),
    }
}

pub async fn redo(
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    let description = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::undo::redo(&conn)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;

    match description {
        Some(desc) => Ok(Json(serde_json::json!({"redone": desc}))),
        None => Ok(Json(serde_json::json!({"redone": null, "message": "Nothing to redo"}))),
    }
}
