use rusqlite::{params, Connection, OptionalExtension};
use crate::models::account::{Account, AccountType};

pub fn list_accounts(conn: &Connection, user_id: &str) -> Result<Vec<Account>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, type, sort_order, created_at FROM accounts WHERE user_id = ?1 AND deleted_at IS NULL ORDER BY sort_order, name"
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        let t: String = row.get(2)?;
        Ok(Account {
            id: row.get(0)?,
            name: row.get(1)?,
            account_type: AccountType::from_str(&t).unwrap_or(AccountType::Checking),
            sort_order: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    let mut accounts = Vec::new();
    for row in rows {
        accounts.push(row?);
    }
    Ok(accounts)
}

pub fn get_account(conn: &Connection, id: &str, user_id: &str) -> Result<Option<Account>, rusqlite::Error> {
    conn.query_row(
        "SELECT id, name, type, sort_order, created_at FROM accounts WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
        |row| {
            let t: String = row.get(2)?;
            Ok(Account {
                id: row.get(0)?,
                name: row.get(1)?,
                account_type: AccountType::from_str(&t).unwrap_or(AccountType::Checking),
                sort_order: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    ).optional()
}

pub fn insert_account(conn: &Connection, acc: &Account, user_id: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO accounts (id, user_id, name, type, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![acc.id, user_id, acc.name, acc.account_type.as_str(), acc.sort_order, acc.created_at],
    )?;
    Ok(())
}

pub fn update_account(conn: &Connection, id: &str, user_id: &str, name: Option<&str>, account_type: Option<&AccountType>, sort_order: Option<i32>) -> Result<bool, rusqlite::Error> {
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(n) = name {
        sets.push("name = ?");
        values.push(Box::new(n.to_string()));
    }
    if let Some(t) = account_type {
        sets.push("type = ?");
        values.push(Box::new(t.as_str().to_string()));
    }
    if let Some(s) = sort_order {
        sets.push("sort_order = ?");
        values.push(Box::new(s));
    }
    if sets.is_empty() {
        return Ok(false);
    }

    values.push(Box::new(id.to_string()));
    values.push(Box::new(user_id.to_string()));
    let sql = format!("UPDATE accounts SET {} WHERE id = ? AND user_id = ?", sets.join(", "));
    let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    let changed = conn.execute(&sql, params.as_slice())?;
    Ok(changed > 0)
}

pub fn delete_account(conn: &Connection, id: &str, user_id: &str) -> Result<bool, rusqlite::Error> {
    let changed = conn.execute("DELETE FROM accounts WHERE id = ?1 AND user_id = ?2", params![id, user_id])?;
    Ok(changed > 0)
}
