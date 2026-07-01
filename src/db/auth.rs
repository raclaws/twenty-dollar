use rusqlite::{params, Connection, OptionalExtension};

use crate::models::user::{Session, User};

pub fn create_user(conn: &Connection, user: &User) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![user.id, user.email, user.name, user.password_hash, user.created_at, user.updated_at],
    )?;
    Ok(())
}

pub fn find_user_by_email(conn: &Connection, email: &str) -> Result<Option<User>, rusqlite::Error> {
    conn.query_row(
        "SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE email = ?1",
        params![email],
        |row| {
            Ok(User {
                id: row.get(0)?,
                email: row.get(1)?,
                name: row.get(2)?,
                password_hash: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )
    .optional()
}

pub fn find_user_by_id(conn: &Connection, id: &str) -> Result<Option<User>, rusqlite::Error> {
    conn.query_row(
        "SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE id = ?1",
        params![id],
        |row| {
            Ok(User {
                id: row.get(0)?,
                email: row.get(1)?,
                name: row.get(2)?,
                password_hash: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )
    .optional()
}

pub fn user_count(conn: &Connection) -> Result<i64, rusqlite::Error> {
    conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
}

pub fn create_session(conn: &Connection, session: &Session) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![session.id, session.user_id, session.expires_at, session.created_at],
    )?;
    Ok(())
}

pub fn find_session(conn: &Connection, session_id: &str) -> Result<Option<Session>, rusqlite::Error> {
    conn.query_row(
        "SELECT id, user_id, expires_at, created_at FROM sessions WHERE id = ?1",
        params![session_id],
        |row| {
            Ok(Session {
                id: row.get(0)?,
                user_id: row.get(1)?,
                expires_at: row.get(2)?,
                created_at: row.get(3)?,
            })
        },
    )
    .optional()
}

pub fn delete_session(conn: &Connection, session_id: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![session_id])?;
    Ok(())
}

pub fn delete_expired_sessions(conn: &Connection, now: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM sessions WHERE expires_at < ?1", params![now])?;
    Ok(())
}

pub fn refresh_session(conn: &Connection, session_id: &str, new_expires: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE sessions SET expires_at = ?1 WHERE id = ?2",
        params![new_expires, session_id],
    )?;
    Ok(())
}
