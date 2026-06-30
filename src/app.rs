use axum::{routing::{get, post, patch, delete}, Router, Json};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::db::DbPool;
use crate::handlers;

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

pub fn build_router(pool: DbPool) -> Router {
    let state = AppState { db: pool };

    Router::new()
        // Health
        .route("/api/health", get(health))
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
        // Middleware
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
