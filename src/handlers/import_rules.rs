use axum::{extract::{State, Path}, Json, Extension};
use crate::app::AppState;
use crate::error::AppResult;
use crate::models::import_rule::*;
use crate::services;

pub async fn list(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
) -> AppResult<Json<Vec<ImportRule>>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::import_rules::list_rules(&conn, &user_id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(input): Json<CreateImportRule>,
) -> AppResult<Json<ImportRule>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::import_rules::create_rule(&conn, &user_id, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Path(id): Path<String>,
    Json(input): Json<UpdateImportRule>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::import_rules::update_rule(&conn, &user_id, &id, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::import_rules::delete_rule(&conn, &user_id, &id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(serde_json::json!({"ok": true})))
}
