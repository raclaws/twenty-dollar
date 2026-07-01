use axum::{extract::{State, Query}, Json, Extension};
use serde::Deserialize;
use crate::app::AppState;
use crate::error::{AppError, AppResult};
use crate::models::budget::BudgetMonth;
use crate::models::assignment::{AssignRequest, MoveRequest};
use crate::services;

#[derive(Deserialize)]
pub struct BudgetQuery {
    pub month: String,
}

pub async fn get_budget(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Query(params): Query<BudgetQuery>,
) -> AppResult<Json<BudgetMonth>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::budget::compute_budget(&conn, &user_id, &params.month)
    }).await.map_err(|e| AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn assign(
    State(state): State<AppState>,
    Extension(_user_id): Extension<String>,
    Json(input): Json<AssignRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    let rta = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::month_lock::assert_month_unlocked(&conn, &input.month)?;

        let id = uuid::Uuid::new_v4().to_string();
        let prev = crate::db::assignments::get_assignment(&conn, &input.category_id, &input.month)?;

        crate::db::assignments::upsert_assignment(&conn, &id, &input.category_id, &input.month, input.amount)?;

        let prev_amount = prev.map(|(_, a)| a).unwrap_or(0);
        services::undo::record_undo(
            &conn,
            &format!("Assign {} to category", input.amount),
            vec![crate::models::undo::Mutation::Update {
                table: "assignments".into(),
                id: id.clone(),
                fields: serde_json::json!({"amount": input.amount}),
                prev: serde_json::json!({"amount": prev_amount}),
            }],
            vec![crate::models::undo::Mutation::Update {
                table: "assignments".into(),
                id,
                fields: serde_json::json!({"amount": prev_amount}),
                prev: serde_json::json!({"amount": input.amount}),
            }],
        )?;

        let month_end = format!("{}-31", input.month);
        services::budget::compute_rta(&conn, &input.month, &month_end)
    }).await.map_err(|e| AppError::Internal(e.to_string()))??;

    Ok(Json(serde_json::json!({
        "ready_to_assign": rta,
    })))
}

pub async fn move_money(
    State(state): State<AppState>,
    Extension(_user_id): Extension<String>,
    Json(input): Json<MoveRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    let rta = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::month_lock::assert_month_unlocked(&conn, &input.month)?;

        if input.amount <= 0 {
            return Err(AppError::Validation("Amount must be positive".into()));
        }

        let from_prev = crate::db::assignments::get_assignment(&conn, &input.from_category_id, &input.month)?;
        let to_prev = crate::db::assignments::get_assignment(&conn, &input.to_category_id, &input.month)?;

        let from_amount = from_prev.as_ref().map(|(_, a)| *a).unwrap_or(0) - input.amount;
        let to_amount = to_prev.as_ref().map(|(_, a)| *a).unwrap_or(0) + input.amount;

        let from_id = from_prev.map(|(id, _)| id).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let to_id = to_prev.map(|(id, _)| id).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        crate::db::assignments::upsert_assignment(&conn, &from_id, &input.from_category_id, &input.month, from_amount)?;
        crate::db::assignments::upsert_assignment(&conn, &to_id, &input.to_category_id, &input.month, to_amount)?;

        services::undo::record_undo(
            &conn,
            &format!("Move {} between categories", input.amount),
            vec![
                crate::models::undo::Mutation::Update {
                    table: "assignments".into(), id: from_id.clone(),
                    fields: serde_json::json!({"amount": from_amount}),
                    prev: serde_json::json!({"amount": from_amount + input.amount}),
                },
                crate::models::undo::Mutation::Update {
                    table: "assignments".into(), id: to_id.clone(),
                    fields: serde_json::json!({"amount": to_amount}),
                    prev: serde_json::json!({"amount": to_amount - input.amount}),
                },
            ],
            vec![
                crate::models::undo::Mutation::Update {
                    table: "assignments".into(), id: from_id,
                    fields: serde_json::json!({"amount": from_amount + input.amount}),
                    prev: serde_json::json!({"amount": from_amount}),
                },
                crate::models::undo::Mutation::Update {
                    table: "assignments".into(), id: to_id,
                    fields: serde_json::json!({"amount": to_amount - input.amount}),
                    prev: serde_json::json!({"amount": to_amount}),
                },
            ],
        )?;

        let month_end = format!("{}-31", input.month);
        services::budget::compute_rta(&conn, &input.month, &month_end)
    }).await.map_err(|e| AppError::Internal(e.to_string()))??;

    Ok(Json(serde_json::json!({
        "ready_to_assign": rta,
    })))
}

#[derive(Deserialize)]
pub struct MonthLockRequest {
    pub month: String,
    pub locked: bool,
}

pub async fn set_month_lock(
    State(state): State<AppState>,
    Extension(_user_id): Extension<String>,
    Json(input): Json<MonthLockRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        services::month_lock::set_month_lock(&conn, &input.month, input.locked)
    }).await.map_err(|e| AppError::Internal(e.to_string()))??;
    Ok(Json(serde_json::json!({"ok": true})))
}
