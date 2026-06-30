use axum::{extract::{State, Query}, Json};
use serde::Deserialize;
use crate::app::AppState;
use crate::error::AppResult;
use crate::services;

#[derive(Deserialize)]
pub struct PayeeQuery {
    pub q: Option<String>,
}

pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<PayeeQuery>,
) -> AppResult<Json<Vec<String>>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::transactions::list_payees(&conn, params.q.as_deref())
    }).await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}
