use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Month {0} is locked")]
    MonthLocked(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Pool error: {0}")]
    Pool(#[from] r2d2::Error),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            AppError::Validation(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::MonthLocked(m) => (StatusCode::CONFLICT, format!("Month {} is locked", m)),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg.clone()),
            AppError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error".into()),
            AppError::Pool(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Service unavailable".into()),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Internal error".into()),
        };

        let body = json!({ "error": message });
        (status, Json(body)).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
