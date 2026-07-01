use axum::{extract::State, Json, Extension};
use crate::app::AppState;
use crate::error::AppResult;
use crate::models::payee::{Payee, CreatePayee};
use crate::services;

pub async fn list(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
) -> AppResult<Json<Vec<Payee>>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::payees::list_payees(&conn, &user_id)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(input): Json<CreatePayee>,
) -> AppResult<Json<Payee>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::payees::create_payee(&conn, &user_id, input)
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}
