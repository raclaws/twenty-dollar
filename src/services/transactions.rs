use rusqlite::Connection;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::transaction::*;
use crate::models::undo::Mutation;
use crate::services::undo::record_undo;
use crate::services::month_lock;

pub fn list_transactions(conn: &Connection, account_id: Option<&str>, from: Option<&str>, to: Option<&str>, category_id: Option<&str>) -> AppResult<Vec<Transaction>> {
    Ok(db::transactions::list_transactions(conn, account_id, from, to, category_id)?)
}

fn txn_to_row_json(txn: &Transaction) -> serde_json::Value {
    serde_json::json!({
        "id": txn.id,
        "account_id": txn.account_id,
        "category_id": txn.category_id,
        "date": txn.date,
        "payee": txn.payee,
        "payee_id": txn.payee_id,
        "amount": txn.amount,
        "memo": txn.memo,
        "cleared": txn.cleared,
        "linked_id": txn.linked_id,
        "source": txn.source,
        "created_at": txn.created_at
    })
}

pub fn create_transaction(conn: &Connection, user_id: &str, input: CreateTransaction) -> AppResult<Transaction> {
    let month = &input.date[..7];
    month_lock::assert_month_unlocked(conn, month)?;

    if !input.splits.is_empty() {
        validate_splits(input.amount, &input.splits)?;
    }

    let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();

    let splits: Vec<SplitEntry> = input.splits.iter().map(|s| {
        SplitEntry {
            id: uuid::Uuid::new_v4().to_string(),
            transaction_id: id.clone(),
            category_id: s.category_id.clone(),
            amount: s.amount,
            memo: s.memo.clone(),
        }
    }).collect();

    let category_id = if splits.is_empty() { input.category_id } else { None };

    let txn = Transaction {
        id: id.clone(),
        account_id: input.account_id,
        category_id,
        date: input.date,
        payee: input.payee,
        payee_id: input.payee_id,
        amount: input.amount,
        memo: input.memo,
        cleared: input.cleared.unwrap_or(false),
        linked_id: input.linked_id,
        source: input.source,
        created_at: now,
        splits,
    };

    db::transactions::insert_transaction(conn, &txn)?;

    record_undo(conn, user_id, &format!("Create transaction {}", txn.payee.as_deref().unwrap_or("(no payee)")), vec![
        Mutation::Insert { table: "transactions".into(), data: txn_to_row_json(&txn) }
    ], vec![
        Mutation::Delete { table: "transactions".into(), id }
    ])?;

    Ok(txn)
}

pub fn update_transaction(conn: &Connection, user_id: &str, id: &str, input: UpdateTransaction) -> AppResult<Transaction> {
    let existing = db::transactions::get_transaction(conn, id)?
        .ok_or_else(|| AppError::NotFound(format!("Transaction {}", id)))?;

    if let Some(ref date) = input.date {
        let month = &date[..7];
        month_lock::assert_month_unlocked(conn, month)?;
    }
    let existing_month = &existing.date[..7];
    month_lock::assert_month_unlocked(conn, existing_month)?;

    if let Some(ref splits) = input.splits {
        let amount = input.amount.unwrap_or(existing.amount);
        let create_splits: Vec<CreateSplitEntry> = splits.iter().map(|s| CreateSplitEntry {
            category_id: s.category_id.clone(),
            amount: s.amount,
            memo: s.memo.clone(),
        }).collect();
        validate_splits(amount, &create_splits)?;
    }

    let prev = txn_to_row_json(&existing);

    db::transactions::update_transaction_fields(
        conn, id,
        input.account_id.as_deref(),
        input.category_id.as_deref(),
        input.date.as_deref(),
        input.payee.as_deref(),
        input.payee_id.as_deref(),
        input.amount,
        input.memo.as_deref(),
        input.cleared,
        input.linked_id.as_deref(),
    )?;

    if let Some(ref splits) = input.splits {
        let new_splits: Vec<SplitEntry> = splits.iter().map(|s| {
            SplitEntry {
                id: uuid::Uuid::new_v4().to_string(),
                transaction_id: id.to_string(),
                category_id: s.category_id.clone(),
                amount: s.amount,
                memo: s.memo.clone(),
            }
        }).collect();
        db::transactions::replace_splits(conn, id, &new_splits)?;
    }

    let updated = db::transactions::get_transaction(conn, id)?.unwrap();
    let fields = txn_to_row_json(&updated);

    record_undo(conn, user_id, &format!("Update transaction {}", id), vec![
        Mutation::Update { table: "transactions".into(), id: id.to_string(), fields: fields.clone(), prev: prev.clone() }
    ], vec![
        Mutation::Update { table: "transactions".into(), id: id.to_string(), fields: prev, prev: fields }
    ])?;

    Ok(updated)
}

pub fn delete_transaction(conn: &Connection, user_id: &str, id: &str) -> AppResult<()> {
    let existing = db::transactions::get_transaction(conn, id)?
        .ok_or_else(|| AppError::NotFound(format!("Transaction {}", id)))?;

    let month = &existing.date[..7];
    month_lock::assert_month_unlocked(conn, month)?;

    db::transactions::delete_transaction(conn, id)?;

    record_undo(conn, user_id, &format!("Delete transaction {}", id), vec![
        Mutation::Delete { table: "transactions".into(), id: id.to_string() }
    ], vec![
        Mutation::Insert { table: "transactions".into(), data: txn_to_row_json(&existing) }
    ])?;

    Ok(())
}

pub fn bulk_operation(conn: &Connection, op: BulkOperation) -> AppResult<usize> {
    match op.action {
        BulkAction::Delete => {
            let count = db::transactions::delete_transactions(conn, &op.ids)?;
            Ok(count)
        }
        BulkAction::Clear => {
            let count = db::transactions::set_cleared(conn, &op.ids, true)?;
            Ok(count)
        }
        BulkAction::Unclear => {
            let count = db::transactions::set_cleared(conn, &op.ids, false)?;
            Ok(count)
        }
        BulkAction::Categorize => {
            let cat_id = op.category_id.ok_or_else(|| AppError::Validation("category_id required for categorize".into()))?;
            let count = db::transactions::set_category(conn, &op.ids, &cat_id)?;
            Ok(count)
        }
    }
}

pub fn list_payees(conn: &Connection, query: Option<&str>) -> AppResult<Vec<String>> {
    Ok(db::transactions::list_payees(conn, query)?)
}

fn validate_splits(amount: i64, splits: &[CreateSplitEntry]) -> AppResult<()> {
    if splits.is_empty() {
        return Ok(());
    }
    let split_sum: i64 = splits.iter().map(|s| s.amount).sum();
    if split_sum != amount {
        return Err(AppError::Validation(format!(
            "Split entries sum ({}) does not equal transaction amount ({})",
            split_sum, amount
        )));
    }
    Ok(())
}
