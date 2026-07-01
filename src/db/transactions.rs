use rusqlite::{params, Connection, OptionalExtension};
use crate::models::transaction::{Transaction, SplitEntry};

pub fn list_transactions(conn: &Connection, account_id: Option<&str>, from: Option<&str>, to: Option<&str>, category_id: Option<&str>) -> Result<Vec<Transaction>, rusqlite::Error> {
    let mut sql = String::from(
        "SELECT id, account_id, category_id, date, payee, payee_id, amount, memo, cleared, linked_id, created_at FROM transactions WHERE 1=1"
    );
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(aid) = account_id {
        sql.push_str(" AND account_id = ?");
        param_values.push(Box::new(aid.to_string()));
    }
    if let Some(f) = from {
        sql.push_str(" AND date >= ?");
        param_values.push(Box::new(f.to_string()));
    }
    if let Some(t) = to {
        sql.push_str(" AND date <= ?");
        param_values.push(Box::new(t.to_string()));
    }
    if let Some(cid) = category_id {
        sql.push_str(" AND (category_id = ? OR id IN (SELECT transaction_id FROM split_entries WHERE category_id = ?))");
        param_values.push(Box::new(cid.to_string()));
        param_values.push(Box::new(cid.to_string()));
    }

    sql.push_str(" ORDER BY date DESC, created_at DESC");

    let mut stmt = conn.prepare(&sql)?;
    let params: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|v| v.as_ref()).collect();
    let rows = stmt.query_map(params.as_slice(), |row| {
        Ok(Transaction {
            id: row.get(0)?,
            account_id: row.get(1)?,
            category_id: row.get(2)?,
            date: row.get(3)?,
            payee: row.get(4)?,
            payee_id: row.get(5)?,
            amount: row.get(6)?,
            memo: row.get(7)?,
            cleared: row.get::<_, i32>(8)? != 0,
            linked_id: row.get(9)?,
            created_at: row.get(10)?,
            splits: Vec::new(),
        })
    })?;

    let mut txns = Vec::new();
    for row in rows {
        txns.push(row?);
    }

    load_splits_batch(conn, &mut txns)?;

    Ok(txns)
}

pub fn get_transaction(conn: &Connection, id: &str) -> Result<Option<Transaction>, rusqlite::Error> {
    let txn = conn.query_row(
        "SELECT id, account_id, category_id, date, payee, payee_id, amount, memo, cleared, linked_id, created_at FROM transactions WHERE id = ?1",
        params![id],
        |row| Ok(Transaction {
            id: row.get(0)?,
            account_id: row.get(1)?,
            category_id: row.get(2)?,
            date: row.get(3)?,
            payee: row.get(4)?,
            payee_id: row.get(5)?,
            amount: row.get(6)?,
            memo: row.get(7)?,
            cleared: row.get::<_, i32>(8)? != 0,
            linked_id: row.get(9)?,
            created_at: row.get(10)?,
            splits: Vec::new(),
        }),
    ).optional()?;

    if let Some(mut t) = txn {
        t.splits = get_splits(conn, &t.id)?;
        Ok(Some(t))
    } else {
        Ok(None)
    }
}

pub fn insert_transaction(conn: &Connection, txn: &Transaction) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO transactions (id, account_id, category_id, date, payee, payee_id, amount, memo, cleared, linked_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            txn.id, txn.account_id, txn.category_id, txn.date,
            txn.payee, txn.payee_id, txn.amount, txn.memo, txn.cleared as i32, txn.linked_id, txn.created_at
        ],
    )?;
    for split in &txn.splits {
        insert_split(conn, split)?;
    }
    Ok(())
}

pub fn update_transaction_fields(conn: &Connection, id: &str, account_id: Option<&str>, category_id: Option<&str>, date: Option<&str>, payee: Option<&str>, payee_id: Option<&str>, amount: Option<i64>, memo: Option<&str>, cleared: Option<bool>, linked_id: Option<&str>) -> Result<bool, rusqlite::Error> {
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = account_id {
        sets.push("account_id = ?");
        values.push(Box::new(v.to_string()));
    }
    if let Some(v) = category_id {
        sets.push("category_id = ?");
        values.push(Box::new(v.to_string()));
    }
    if let Some(v) = date {
        sets.push("date = ?");
        values.push(Box::new(v.to_string()));
    }
    if let Some(v) = payee {
        sets.push("payee = ?");
        values.push(Box::new(v.to_string()));
    }
    if let Some(v) = payee_id {
        sets.push("payee_id = ?");
        values.push(Box::new(v.to_string()));
    }
    if let Some(v) = amount {
        sets.push("amount = ?");
        values.push(Box::new(v));
    }
    if let Some(v) = memo {
        sets.push("memo = ?");
        values.push(Box::new(v.to_string()));
    }
    if let Some(v) = cleared {
        sets.push("cleared = ?");
        values.push(Box::new(v as i32));
    }
    if let Some(v) = linked_id {
        sets.push("linked_id = ?");
        values.push(Box::new(v.to_string()));
    }
    if sets.is_empty() {
        return Ok(false);
    }

    values.push(Box::new(id.to_string()));
    let sql = format!("UPDATE transactions SET {} WHERE id = ?", sets.join(", "));
    let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    let changed = conn.execute(&sql, params.as_slice())?;
    Ok(changed > 0)
}

pub fn delete_transaction(conn: &Connection, id: &str) -> Result<bool, rusqlite::Error> {
    let changed = conn.execute("DELETE FROM transactions WHERE id = ?1", params![id])?;
    Ok(changed > 0)
}

pub fn delete_transactions(conn: &Connection, ids: &[String]) -> Result<usize, rusqlite::Error> {
    let mut count = 0;
    for id in ids {
        count += conn.execute("DELETE FROM transactions WHERE id = ?1", params![id])?;
    }
    Ok(count)
}

pub fn set_cleared(conn: &Connection, ids: &[String], cleared: bool) -> Result<usize, rusqlite::Error> {
    let mut count = 0;
    for id in ids {
        count += conn.execute(
            "UPDATE transactions SET cleared = ?1 WHERE id = ?2",
            params![cleared as i32, id],
        )?;
    }
    Ok(count)
}

pub fn set_category(conn: &Connection, ids: &[String], category_id: &str) -> Result<usize, rusqlite::Error> {
    let mut count = 0;
    for id in ids {
        count += conn.execute(
            "UPDATE transactions SET category_id = ?1 WHERE id = ?2",
            params![category_id, id],
        )?;
    }
    Ok(count)
}

fn get_splits(conn: &Connection, transaction_id: &str) -> Result<Vec<SplitEntry>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, transaction_id, category_id, amount, memo FROM split_entries WHERE transaction_id = ?1"
    )?;
    let rows = stmt.query_map(params![transaction_id], |row| {
        Ok(SplitEntry {
            id: row.get(0)?,
            transaction_id: row.get(1)?,
            category_id: row.get(2)?,
            amount: row.get(3)?,
            memo: row.get(4)?,
        })
    })?;
    let mut splits = Vec::new();
    for row in rows {
        splits.push(row?);
    }
    Ok(splits)
}

fn load_splits_batch(conn: &Connection, txns: &mut [Transaction]) -> Result<(), rusqlite::Error> {
    if txns.is_empty() {
        return Ok(());
    }
    let ids: Vec<&str> = txns.iter().map(|t| t.id.as_str()).collect();
    let placeholders: String = ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, transaction_id, category_id, amount, memo FROM split_entries WHERE transaction_id IN ({})",
        placeholders
    );
    let mut stmt = conn.prepare(&sql)?;
    let params: Vec<&dyn rusqlite::types::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
    let rows = stmt.query_map(params.as_slice(), |row| {
        Ok(SplitEntry {
            id: row.get(0)?,
            transaction_id: row.get(1)?,
            category_id: row.get(2)?,
            amount: row.get(3)?,
            memo: row.get(4)?,
        })
    })?;

    let mut splits_map: std::collections::HashMap<String, Vec<SplitEntry>> = std::collections::HashMap::new();
    for row in rows {
        let split = row?;
        splits_map.entry(split.transaction_id.clone()).or_default().push(split);
    }
    for txn in txns.iter_mut() {
        if let Some(splits) = splits_map.remove(&txn.id) {
            txn.splits = splits;
        }
    }
    Ok(())
}

fn insert_split(conn: &Connection, split: &SplitEntry) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO split_entries (id, transaction_id, category_id, amount, memo) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![split.id, split.transaction_id, split.category_id, split.amount, split.memo],
    )?;
    Ok(())
}

pub fn delete_splits(conn: &Connection, transaction_id: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM split_entries WHERE transaction_id = ?1", params![transaction_id])?;
    Ok(())
}

pub fn replace_splits(conn: &Connection, transaction_id: &str, splits: &[SplitEntry]) -> Result<(), rusqlite::Error> {
    delete_splits(conn, transaction_id)?;
    for split in splits {
        insert_split(conn, split)?;
    }
    Ok(())
}

pub fn list_payees(conn: &Connection, query: Option<&str>) -> Result<Vec<String>, rusqlite::Error> {
    let mut payees = Vec::new();

    if let Some(q) = query {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT payee FROM transactions WHERE payee IS NOT NULL AND payee LIKE ?1 ORDER BY payee LIMIT 50"
        )?;
        let rows = stmt.query_map(params![format!("{}%", q)], |row| row.get::<_, String>(0))?;
        for row in rows {
            payees.push(row?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT payee FROM transactions WHERE payee IS NOT NULL ORDER BY payee LIMIT 50"
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            payees.push(row?);
        }
    }

    Ok(payees)
}

pub fn total_income_up_to(conn: &Connection, end_date: &str) -> Result<i64, rusqlite::Error> {
    conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE category_id IS NULL AND amount > 0 AND date <= ?1",
        params![end_date],
        |row| row.get(0),
    )
}

pub fn activity_by_category_for_month(conn: &Connection, month_start: &str, month_end: &str) -> Result<Vec<(String, i64)>, rusqlite::Error> {
    let mut results = Vec::new();

    let mut stmt = conn.prepare(
        "SELECT category_id, SUM(amount) FROM transactions
         WHERE category_id IS NOT NULL AND date >= ?1 AND date <= ?2
         GROUP BY category_id"
    )?;
    let rows = stmt.query_map(params![month_start, month_end], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    for row in rows {
        results.push(row?);
    }

    let mut split_stmt = conn.prepare(
        "SELECT se.category_id, SUM(se.amount) FROM split_entries se
         JOIN transactions t ON t.id = se.transaction_id
         WHERE se.category_id IS NOT NULL AND t.date >= ?1 AND t.date <= ?2
         GROUP BY se.category_id"
    )?;
    let split_rows = split_stmt.query_map(params![month_start, month_end], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    for row in split_rows {
        results.push(row?);
    }

    Ok(results)
}

pub fn cumulative_activity_by_category(conn: &Connection, end_date: &str) -> Result<Vec<(String, i64)>, rusqlite::Error> {
    let mut results = Vec::new();

    let mut stmt = conn.prepare(
        "SELECT category_id, SUM(amount) FROM transactions
         WHERE category_id IS NOT NULL AND date <= ?1
         GROUP BY category_id"
    )?;
    let rows = stmt.query_map(params![end_date], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    for row in rows {
        results.push(row?);
    }

    let mut split_stmt = conn.prepare(
        "SELECT se.category_id, SUM(se.amount) FROM split_entries se
         JOIN transactions t ON t.id = se.transaction_id
         WHERE se.category_id IS NOT NULL AND t.date <= ?1
         GROUP BY se.category_id"
    )?;
    let split_rows = split_stmt.query_map(params![end_date], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    for row in split_rows {
        results.push(row?);
    }

    Ok(results)
}
