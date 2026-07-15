use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;

use crate::app::AppState;
use crate::error::{AppError, AppResult};
use crate::models::user::{LoginRequest, SetupRequest};
use crate::services;

const SESSION_COOKIE: &str = "session_id";
const MAX_AGE: i64 = 604800; // 7 days
const RATE_LIMIT_MAX: usize = 5;
const RATE_LIMIT_WINDOW: u64 = 60;

pub async fn setup(
    State(state): State<AppState>,
    Json(req): Json<SetupRequest>,
) -> AppResult<impl IntoResponse> {
    let (auth_resp, session) = services::auth::setup(&state.db, req)?;
    Ok((StatusCode::CREATED, set_cookie_headers(&session.id), Json(auth_resp)))
}

pub async fn signup(
    State(state): State<AppState>,
    Json(req): Json<SetupRequest>,
) -> AppResult<impl IntoResponse> {
    let (auth_resp, session) = services::auth::signup(&state.db, req)?;
    Ok((StatusCode::CREATED, set_cookie_headers(&session.id), Json(auth_resp)))
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> AppResult<impl IntoResponse> {
    let key = req.email.trim().to_lowercase();
    {
        let mut limiter = state.rate_limiter.lock().unwrap();
        if !limiter.check(&key, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW) {
            return Err(AppError::RateLimited);
        }
    }

    let result = services::auth::login(&state.db, req);
    match result {
        Ok((auth_resp, session)) => {
            let mut limiter = state.rate_limiter.lock().unwrap();
            limiter.reset(&key);
            Ok((StatusCode::OK, set_cookie_headers(&session.id), Json(auth_resp)))
        }
        Err(e) => Err(e),
    }
}

pub async fn logout(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    if let Some(session_id) = extract_session_id(&headers) {
        services::auth::logout(&state.db, &session_id)?;
    }
    Ok((StatusCode::OK, clear_cookie_headers(), Json(json!({"ok": true}))))
}

pub async fn me(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> AppResult<impl IntoResponse> {
    let resp = services::auth::get_me(&state.db, &user_id)?;
    Ok(Json(resp))
}

pub async fn status(
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let needs_setup = services::auth::needs_setup(&state.db)?;
    Ok(Json(json!({ "needs_setup": needs_setup })))
}

pub fn extract_session_id(headers: &HeaderMap) -> Option<String> {
    let cookie_header = headers.get("cookie")?.to_str().ok()?;
    cookie_header
        .split(';')
        .filter_map(|c| {
            let mut parts = c.trim().splitn(2, '=');
            let key = parts.next()?;
            let val = parts.next()?;
            if key == SESSION_COOKIE { Some(val.to_string()) } else { None }
        })
        .next()
}

fn secure_flag() -> &'static str {
    if std::env::var("INSECURE_COOKIES").unwrap_or_default() == "1" { "" } else { "; Secure" }
}

fn set_cookie_headers(session_id: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    let cookie = format!(
        "{}={}; HttpOnly; SameSite=Strict{}; Path=/; Max-Age={}",
        SESSION_COOKIE, session_id, secure_flag(), MAX_AGE
    );
    headers.insert("set-cookie", cookie.parse().unwrap());
    headers
}

fn clear_cookie_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    let cookie = format!(
        "{}=; HttpOnly; SameSite=Strict{}; Path=/; Max-Age=0",
        SESSION_COOKIE, secure_flag()
    );
    headers.insert("set-cookie", cookie.parse().unwrap());
    headers
}
