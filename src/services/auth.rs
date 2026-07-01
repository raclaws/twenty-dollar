use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{Duration, Utc};
use uuid::Uuid;

use crate::db::{self, DbPool};
use crate::error::{AppError, AppResult};
use crate::models::user::{AuthResponse, LoginRequest, Session, SetupRequest, User, UserInfo};

pub fn setup(pool: &DbPool, req: SetupRequest) -> AppResult<(AuthResponse, Session)> {
    let conn = pool.get()?;

    let count = db::auth::user_count(&conn)?;
    if count > 0 {
        return Err(AppError::Validation("Setup already completed. Use login instead.".into()));
    }

    validate_signup(&req)?;

    let now = Utc::now().to_rfc3339();
    let user = User {
        id: Uuid::new_v4().to_string(),
        email: req.email.trim().to_lowercase(),
        name: req.name.trim().to_string(),
        password_hash: hash_password(&req.password)?,
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    db::auth::create_user(&conn, &user)?;
    crate::services::seed::seed_starter_categories(&conn, &user.id)?;
    let session = create_session_for(&conn, &user.id, &now)?;

    Ok((
        AuthResponse { user: UserInfo::from(user) },
        session,
    ))
}

pub fn signup(pool: &DbPool, req: SetupRequest) -> AppResult<(AuthResponse, Session)> {
    let conn = pool.get()?;

    validate_signup(&req)?;

    let existing = db::auth::find_user_by_email(&conn, &req.email.trim().to_lowercase())?;
    if existing.is_some() {
        return Err(AppError::Conflict("Email already registered".into()));
    }

    let now = Utc::now().to_rfc3339();
    let user = User {
        id: Uuid::new_v4().to_string(),
        email: req.email.trim().to_lowercase(),
        name: req.name.trim().to_string(),
        password_hash: hash_password(&req.password)?,
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    db::auth::create_user(&conn, &user)?;
    crate::services::seed::seed_starter_categories(&conn, &user.id)?;
    let session = create_session_for(&conn, &user.id, &now)?;

    Ok((
        AuthResponse { user: UserInfo::from(user) },
        session,
    ))
}

pub fn login(pool: &DbPool, req: LoginRequest) -> AppResult<(AuthResponse, Session)> {
    let conn = pool.get()?;

    let email = req.email.trim().to_lowercase();
    let user = db::auth::find_user_by_email(&conn, &email)?
        .ok_or_else(|| AppError::Validation("Invalid email or password".into()))?;

    verify_password(&req.password, &user.password_hash)?;

    let now = Utc::now().to_rfc3339();
    let session = create_session_for(&conn, &user.id, &now)?;

    Ok((
        AuthResponse { user: UserInfo::from(user) },
        session,
    ))
}

pub fn logout(pool: &DbPool, session_id: &str) -> AppResult<()> {
    let conn = pool.get()?;
    db::auth::delete_session(&conn, session_id)?;
    Ok(())
}

pub fn get_me(pool: &DbPool, user_id: &str) -> AppResult<AuthResponse> {
    let conn = pool.get()?;
    let user = db::auth::find_user_by_id(&conn, user_id)?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;
    Ok(AuthResponse { user: UserInfo::from(user) })
}

pub fn validate_session(pool: &DbPool, session_id: &str) -> AppResult<String> {
    let conn = pool.get()?;

    let session = db::auth::find_session(&conn, session_id)?
        .ok_or_else(|| AppError::NotFound("Session not found".into()))?;

    // Refresh if less than 6 days remaining
    let expires = chrono::DateTime::parse_from_rfc3339(&session.expires_at)
        .map_err(|_| AppError::Internal("Invalid session expiry".into()))?;

    if Utc::now() > expires.with_timezone(&Utc) {
        db::auth::delete_session(&conn, session_id)?;
        return Err(AppError::NotFound("Session expired".into()));
    }

    let remaining = expires.with_timezone(&Utc) - Utc::now();
    if remaining < Duration::days(6) {
        let new_expires = (Utc::now() + Duration::days(7)).to_rfc3339();
        db::auth::refresh_session(&conn, session_id, &new_expires)?;
    }

    // Probabilistic cleanup: ~1% of requests purge expired sessions
    if rand::random::<u8>() < 3 {
        let now = Utc::now().to_rfc3339();
        let _ = db::auth::delete_expired_sessions(&conn, &now);
    }

    Ok(session.user_id)
}

pub fn needs_setup(pool: &DbPool) -> AppResult<bool> {
    let conn = pool.get()?;
    let count = db::auth::user_count(&conn)?;
    Ok(count == 0)
}

fn validate_signup(req: &SetupRequest) -> AppResult<()> {
    if req.email.trim().is_empty() {
        return Err(AppError::Validation("Email is required".into()));
    }
    if !req.email.contains('@') {
        return Err(AppError::Validation("Invalid email format".into()));
    }
    if req.name.trim().is_empty() {
        return Err(AppError::Validation("Name is required".into()));
    }
    if req.password.len() < 6 {
        return Err(AppError::Validation("Password must be at least 6 characters".into()));
    }
    Ok(())
}

fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(format!("Password hash error: {}", e)))
}

fn verify_password(password: &str, hash: &str) -> AppResult<()> {
    let parsed = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(format!("Invalid hash: {}", e)))?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .map_err(|_| AppError::Validation("Invalid email or password".into()))
}

fn create_session_for(conn: &rusqlite::Connection, user_id: &str, now: &str) -> AppResult<Session> {
    let session = Session {
        id: Uuid::new_v4().to_string(),
        user_id: user_id.to_string(),
        expires_at: (Utc::now() + Duration::days(7)).to_rfc3339(),
        created_at: now.to_string(),
    };
    db::auth::create_session(conn, &session)?;
    Ok(session)
}
