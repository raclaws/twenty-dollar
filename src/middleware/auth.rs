use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
    http::StatusCode,
    Json,
};
use serde_json::json;

use crate::app::AppState;
use crate::handlers::auth::extract_session_id;
use crate::services;

pub async fn require_auth(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let headers = req.headers();
    let session_id = extract_session_id(headers)
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(json!({"error": "Not authenticated"}))))?;

    let user_id = services::auth::validate_session(&state.db, &session_id)
        .map_err(|_| (StatusCode::UNAUTHORIZED, Json(json!({"error": "Session expired"}))))?;

    req.extensions_mut().insert(user_id);
    Ok(next.run(req).await)
}
