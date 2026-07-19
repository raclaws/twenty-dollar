use axum::{extract::{State, Query}, Json, Extension};
use serde::Deserialize;
use crate::app::AppState;
use crate::error::AppResult;
use crate::services;

#[derive(Deserialize)]
pub struct ImportQuery {
    pub account_id: String,
}

pub async fn import_csv(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Query(params): Query<ImportQuery>,
    body: String,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    let count = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::import_export::import_csv(&conn, &user_id, &body, &params.account_id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(serde_json::json!({"imported": count})))
}

pub async fn export_json(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
) -> AppResult<Json<services::import_export::ExportData>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::import_export::export_all(&conn, &user_id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn export_csv(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
) -> AppResult<([(axum::http::header::HeaderName, &'static str); 2], String)> {
    let pool = state.db.clone();
    let csv_data = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::import_export::export_csv(&conn, &user_id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(([
        (axum::http::header::CONTENT_TYPE, "text/csv; charset=utf-8"),
        (axum::http::header::CONTENT_DISPOSITION, "attachment; filename=\"twenty-dollar-transactions.csv\""),
    ], csv_data))
}
