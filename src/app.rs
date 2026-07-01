use axum::{routing::{get, post, patch, delete}, Router, Json, middleware};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tower_http::services::{ServeDir, ServeFile};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::db::DbPool;
use crate::handlers;
use crate::middleware::auth::require_auth;

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    pub rate_limiter: Arc<Mutex<RateLimiter>>,
}

pub struct RateLimiter {
    attempts: HashMap<String, Vec<Instant>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self { attempts: HashMap::new() }
    }

    pub fn check(&mut self, key: &str, max: usize, window_secs: u64) -> bool {
        let now = Instant::now();
        let window = std::time::Duration::from_secs(window_secs);
        let entries = self.attempts.entry(key.to_string()).or_default();
        entries.retain(|t| now.duration_since(*t) < window);
        if entries.len() >= max {
            return false;
        }
        entries.push(now);
        true
    }

    pub fn reset(&mut self, key: &str) {
        self.attempts.remove(key);
    }
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

pub fn build_router(pool: DbPool) -> Router {
    let state = AppState {
        db: pool,
        rate_limiter: Arc::new(Mutex::new(RateLimiter::new())),
    };

    let public = Router::new()
        .route("/api/health", get(health))
        .route("/api/auth/status", get(handlers::auth::status))
        .route("/api/auth/setup", post(handlers::auth::setup))
        .route("/api/auth/signup", post(handlers::auth::signup))
        .route("/api/auth/login", post(handlers::auth::login))
        .route("/api/auth/logout", post(handlers::auth::logout));

    let protected = Router::new()
        .route("/api/auth/me", get(handlers::auth::me))
        // Budget
        .route("/api/budget", get(handlers::budget::get_budget))
        .route("/api/budget/assign", post(handlers::budget::assign))
        .route("/api/budget/move", post(handlers::budget::move_money))
        .route("/api/months/lock", post(handlers::budget::set_month_lock))
        // Categories
        .route("/api/categories", get(handlers::categories::list))
        .route("/api/category-groups", post(handlers::categories::create_group))
        .route("/api/category-groups/{id}", patch(handlers::categories::update_group))
        .route("/api/category-groups/{id}", delete(handlers::categories::delete_group))
        .route("/api/categories", post(handlers::categories::create_category))
        .route("/api/categories/{id}", patch(handlers::categories::update_category))
        .route("/api/categories/{id}", delete(handlers::categories::delete_category))
        .route("/api/categories/reorder", post(handlers::categories::reorder))
        // Accounts
        .route("/api/accounts", get(handlers::accounts::list))
        .route("/api/accounts", post(handlers::accounts::create))
        .route("/api/accounts/{id}", patch(handlers::accounts::update))
        .route("/api/accounts/{id}", delete(handlers::accounts::delete))
        // Transactions
        .route("/api/transactions", get(handlers::transactions::list))
        .route("/api/transactions", post(handlers::transactions::create))
        .route("/api/transactions/{id}", patch(handlers::transactions::update))
        .route("/api/transactions/{id}", delete(handlers::transactions::delete))
        .route("/api/transactions/bulk", post(handlers::transactions::bulk))
        // Transfers
        .route("/api/transfers", get(handlers::transfers::list))
        .route("/api/transfers", post(handlers::transfers::create))
        .route("/api/transfers/{id}", delete(handlers::transfers::delete))
        // Payees
        .route("/api/payees", get(handlers::payees::list))
        // Undo/Redo
        .route("/api/undo", post(handlers::undo::undo))
        .route("/api/redo", post(handlers::undo::redo))
        // Import/Export
        .route("/api/import", post(handlers::import_export::import_csv))
        .route("/api/export", get(handlers::import_export::export_json))
        // Schedules
        .route("/api/schedules", get(handlers::schedules::list))
        .route("/api/schedules", post(handlers::schedules::create))
        .route("/api/schedules/{id}", patch(handlers::schedules::update))
        .route("/api/schedules/{id}", delete(handlers::schedules::delete))
        .route("/api/schedules/generate", post(handlers::schedules::generate))
        // Reset
        .route("/api/reset", post(handlers::reset::reset_data))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "./frontend/dist".to_string());
    let serve_spa = ServeDir::new(&static_dir)
        .not_found_service(ServeFile::new(format!("{}/index.html", static_dir)));

    public
        .merge(protected)
        .fallback_service(serve_spa)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
