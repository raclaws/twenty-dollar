use axum::{extract::State, Extension, Json};
use serde::{Deserialize, Serialize};
use crate::app::AppState;
use crate::error::{AppError, AppResult};

#[derive(Serialize)]
pub struct Preferences {
    pub currency: String,
}

#[derive(Deserialize)]
pub struct UpdatePreferences {
    pub currency: Option<String>,
}

pub async fn get_preferences(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
) -> AppResult<Json<Preferences>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, AppError> {
        let conn = pool.get()?;
        let currency: String = conn.query_row(
            "SELECT currency FROM user_preferences WHERE user_id = ?1",
            rusqlite::params![user_id],
            |row| row.get(0),
        ).unwrap_or_else(|_| "USD".to_string());
        Ok(Preferences { currency })
    }).await.map_err(|e| AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}

pub async fn update_preferences(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(input): Json<UpdatePreferences>,
) -> AppResult<Json<Preferences>> {
    let pool = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, AppError> {
        let conn = pool.get()?;
        let currency = input.currency.unwrap_or_else(|| "USD".to_string());
        conn.execute(
            "INSERT INTO user_preferences (user_id, currency) VALUES (?1, ?2)
             ON CONFLICT(user_id) DO UPDATE SET currency = ?2",
            rusqlite::params![user_id, currency],
        )?;
        Ok(Preferences { currency })
    }).await.map_err(|e| AppError::Internal(e.to_string()))??;
    Ok(Json(result))
}
