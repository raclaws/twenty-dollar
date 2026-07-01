use axum::{extract::State, Json, Extension};
use crate::app::AppState;
use crate::error::AppResult;
use crate::models::transfer::CreateTransfer;
use crate::models::transfer::Transfer;
use crate::services;

pub async fn list(
    State(state): State<AppState>,
    Extension(_user_id): Extension<String>,
) -> AppResult<Json<Vec<Transfer>>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::transfers::list_transfers(&conn)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(_user_id): Extension<String>,
    Json(input): Json<CreateTransfer>,
) -> AppResult<Json<Transfer>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::transfers::create_transfer(&conn, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(_user_id): Extension<String>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::transfers::delete_transfer(&conn, &id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(serde_json::json!({"ok": true})))
}
