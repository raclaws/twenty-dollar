use axum::{extract::{State, Path, Query}, Json};
use serde::Deserialize;
use crate::app::AppState;
use crate::error::AppResult;
use crate::models::transaction::*;
use crate::services;

#[derive(Deserialize)]
pub struct TransactionQuery {
    pub account: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub category: Option<String>,
}

pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<TransactionQuery>,
) -> AppResult<Json<Vec<Transaction>>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::transactions::list_transactions(
            &conn,
            params.account.as_deref(),
            params.from.as_deref(),
            params.to.as_deref(),
            params.category.as_deref(),
        )
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn create(
    State(state): State<AppState>,
    Json(input): Json<CreateTransaction>,
) -> AppResult<Json<Transaction>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::transactions::create_transaction(&conn, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdateTransaction>,
) -> AppResult<Json<Transaction>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::transactions::update_transaction(&conn, &id, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::transactions::delete_transaction(&conn, &id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn bulk(
    State(state): State<AppState>,
    Json(input): Json<BulkOperation>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    let count = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::transactions::bulk_operation(&conn, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(serde_json::json!({"affected": count})))
}
