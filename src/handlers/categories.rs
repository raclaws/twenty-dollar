use axum::{extract::{State, Path}, Json};
use crate::app::AppState;
use crate::error::AppResult;
use crate::models::category::*;
use crate::services;

pub async fn list(
    State(state): State<AppState>,
) -> AppResult<Json<Vec<CategoryGroup>>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::categories::list_categories(&conn)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn create_group(
    State(state): State<AppState>,
    Json(input): Json<CreateCategoryGroup>,
) -> AppResult<Json<CategoryGroup>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::categories::create_group(&conn, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn update_group(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdateCategoryGroup>,
) -> AppResult<Json<CategoryGroup>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::categories::update_group(&conn, &id, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn delete_group(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::categories::delete_group(&conn, &id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn create_category(
    State(state): State<AppState>,
    Json(input): Json<CreateCategory>,
) -> AppResult<Json<Category>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::categories::create_category(&conn, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn update_category(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdateCategory>,
) -> AppResult<Json<Category>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::categories::update_category(&conn, &id, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn delete_category(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::categories::delete_category(&conn, &id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn reorder(
    State(state): State<AppState>,
    Json(items): Json<Vec<ReorderItem>>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::categories::reorder_categories(&conn, items)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(serde_json::json!({"ok": true})))
}
