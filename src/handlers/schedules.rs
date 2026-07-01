use axum::{extract::{State, Path}, Json, Extension};
use crate::app::AppState;
use crate::error::AppResult;
use crate::models::schedule::*;
use crate::models::transaction::Transaction;
use crate::services;

pub async fn list(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
) -> AppResult<Json<Vec<Schedule>>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::schedules::list_schedules(&conn, &user_id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(input): Json<CreateSchedule>,
) -> AppResult<Json<Schedule>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::schedules::create_schedule(&conn, &user_id, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Path(id): Path<String>,
    Json(input): Json<UpdateSchedule>,
) -> AppResult<Json<Schedule>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::schedules::update_schedule(&conn, &user_id, &id, input)
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
        services::schedules::delete_schedule(&conn, &user_id, &id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn generate(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
) -> AppResult<Json<Vec<Transaction>>> {
    let pool = state.db.clone();
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::schedules::generate_due(&conn, &user_id, &today)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}
