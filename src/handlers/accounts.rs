use axum::{extract::{State, Path}, Json, Extension};
use crate::app::AppState;
use crate::error::AppResult;
use crate::models::account::*;
use crate::services;

pub async fn list(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
) -> AppResult<Json<Vec<Account>>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::accounts::list_accounts(&conn, &user_id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(input): Json<CreateAccount>,
) -> AppResult<Json<Account>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::accounts::create_account(&conn, &user_id, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Path(id): Path<String>,
    Json(input): Json<UpdateAccount>,
) -> AppResult<Json<Account>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::accounts::update_account(&conn, &user_id, &id, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::accounts::delete_account(&conn, &user_id, &id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(serde_json::json!({"ok": true})))
}
