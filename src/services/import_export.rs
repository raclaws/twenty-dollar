use rusqlite::Connection;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::account::Account;
use crate::models::category::CategoryGroup;
use crate::models::transaction::Transaction;
use crate::models::transfer::Transfer;
use crate::models::assignment::Assignment;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportData {
    pub accounts: Vec<Account>,
    pub category_groups: Vec<CategoryGroup>,
    pub transactions: Vec<Transaction>,
    pub transfers: Vec<Transfer>,
    pub assignments: Vec<AssignmentExport>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AssignmentExport {
    pub id: String,
    pub category_id: String,
    pub month: String,
    pub amount: i64,
}

pub fn export_all(conn: &Connection) -> AppResult<ExportData> {
    let accounts = db::accounts::list_accounts(conn)?;
    let category_groups = db::categories::list_groups_with_categories(conn)?;
    let transactions = db::transactions::list_transactions(conn, None, None, None, None)?;
    let transfers = db::transfers::list_transfers(conn)?;

    let mut stmt = conn.prepare("SELECT id, category_id, month, amount FROM assignments ORDER BY month, category_id")?;
    let rows = stmt.query_map([], |row| {
        Ok(AssignmentExport {
            id: row.get(0)?,
            category_id: row.get(1)?,
            month: row.get(2)?,
            amount: row.get(3)?,
        })
    })?;
    let mut assignments = Vec::new();
    for row in rows {
        assignments.push(row?);
    }

    Ok(ExportData {
        accounts,
        category_groups,
        transactions,
        transfers,
        assignments,
    })
}

#[derive(Debug, Deserialize)]
pub struct CsvRow {
    pub date: String,
    pub payee: Option<String>,
    pub amount: String,
    pub category: Option<String>,
    pub memo: Option<String>,
    pub account: Option<String>,
}

pub fn import_csv(conn: &Connection, csv_data: &str, default_account_id: &str) -> AppResult<usize> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(csv_data.as_bytes());

    let accounts = db::accounts::list_accounts(conn)?;
    let groups = db::categories::list_groups_with_categories(conn)?;
    let all_categories: Vec<_> = groups.iter().flat_map(|g| g.categories.iter()).collect();

    let mut imported_ids: Vec<String> = Vec::new();

    for result in reader.deserialize::<CsvRow>() {
        let row = result.map_err(|e| AppError::Validation(format!("CSV parse error: {}", e)))?;

        let account_id = if let Some(ref acc_name) = row.account {
            accounts.iter().find(|a| a.name.eq_ignore_ascii_case(acc_name))
                .map(|a| a.id.clone())
                .unwrap_or_else(|| default_account_id.to_string())
        } else {
            default_account_id.to_string()
        };

        let category_id = row.category.as_ref().and_then(|cat_name| {
            all_categories.iter().find(|c| c.name.eq_ignore_ascii_case(cat_name))
                .map(|c| c.id.clone())
        });

        let amount = parse_amount(&row.amount)?;

        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let txn = Transaction {
            id: id.clone(),
            account_id,
            category_id,
            date: row.date,
            payee: row.payee,
            amount,
            memo: row.memo,
            cleared: false,
            created_at: now,
            splits: Vec::new(),
        };
        db::transactions::insert_transaction(conn, &txn)?;
        imported_ids.push(id);
    }

    let count = imported_ids.len();

    if count > 0 {
        let inverse: Vec<crate::models::undo::Mutation> = imported_ids.iter()
            .map(|id| crate::models::undo::Mutation::Delete {
                table: "transactions".into(),
                id: id.clone(),
            })
            .collect();

        crate::services::undo::record_undo(
            conn,
            &format!("Import {} transactions", count),
            vec![],
            inverse,
        )?;
    }

    Ok(count)
}

fn parse_amount(s: &str) -> AppResult<i64> {
    let cleaned = s.replace(',', "").replace(' ', "");
    if let Some(dot_pos) = cleaned.find('.') {
        let int_part = &cleaned[..dot_pos];
        let frac_part = &cleaned[dot_pos + 1..];
        let int_val: i64 = int_part.parse()
            .map_err(|_| AppError::Validation(format!("Invalid amount: {}", s)))?;
        let cents: i64 = match frac_part.len() {
            0 => 0,
            1 => frac_part.parse::<i64>()
                .map_err(|_| AppError::Validation(format!("Invalid amount: {}", s)))? * 10,
            2 => frac_part.parse::<i64>()
                .map_err(|_| AppError::Validation(format!("Invalid amount: {}", s)))?,
            _ => frac_part[..2].parse::<i64>()
                .map_err(|_| AppError::Validation(format!("Invalid amount: {}", s)))?,
        };
        let sign = if int_val < 0 || cleaned.starts_with('-') { -1 } else { 1 };
        Ok(int_val * 100 + sign * cents)
    } else {
        let int_val: i64 = cleaned.parse()
            .map_err(|_| AppError::Validation(format!("Invalid amount: {}", s)))?;
        Ok(int_val * 100)
    }
}
