use rusqlite::Connection;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::account::Account;
use crate::models::category::CategoryGroup;
use crate::models::transaction::{Transaction, SplitEntry};
use crate::models::transfer::Transfer;
use crate::models::payee::Payee;
use crate::models::schedule::Schedule;
use crate::models::import_rule::ImportRule;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportData {
    pub accounts: Vec<Account>,
    pub category_groups: Vec<CategoryGroup>,
    pub transactions: Vec<Transaction>,
    pub transfers: Vec<Transfer>,
    pub assignments: Vec<AssignmentExport>,
    pub payees: Vec<Payee>,
    pub schedules: Vec<Schedule>,
    pub split_entries: Vec<SplitEntry>,
    pub import_rules: Vec<ImportRule>,
    pub preferences: UserPreferences,
    pub month_locks: Vec<MonthLock>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AssignmentExport {
    pub id: String,
    pub category_id: String,
    pub month: String,
    pub amount: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserPreferences {
    pub currency: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MonthLock {
    pub month: String,
    pub locked: bool,
}

pub fn export_all(conn: &Connection, user_id: &str) -> AppResult<ExportData> {
    let accounts = db::accounts::list_accounts(conn, user_id)?;
    let category_groups = db::categories::list_groups_with_categories(conn, user_id)?;

    // Scope transactions to user's accounts
    let mut transactions = Vec::new();
    for acc in &accounts {
        let mut acc_txns = db::transactions::list_transactions(conn, Some(&acc.id), None, None, None)?;
        transactions.append(&mut acc_txns);
    }
    transactions.sort_by(|a, b| b.date.cmp(&a.date));

    // Scope transfers to user's accounts
    let all_transfers = db::transfers::list_transfers(conn)?;
    let account_ids: std::collections::HashSet<&str> = accounts.iter().map(|a| a.id.as_str()).collect();
    let transfers: Vec<_> = all_transfers.into_iter()
        .filter(|t| account_ids.contains(t.from_account_id.as_str()) || account_ids.contains(t.to_account_id.as_str()))
        .collect();
    let payees = db::payees::list_payees(conn, user_id)?;
    let schedules = db::schedules::list_schedules(conn, user_id)?;
    let import_rules = db::import_rules::list_rules(conn, user_id)?;

    let mut stmt = conn.prepare(
        "SELECT id, category_id, month, amount FROM assignments WHERE category_id IN (SELECT id FROM categories WHERE group_id IN (SELECT id FROM category_groups WHERE user_id = ?1)) ORDER BY month, category_id"
    )?;
    let assignments: Vec<AssignmentExport> = stmt.query_map(rusqlite::params![user_id], |row| {
        Ok(AssignmentExport {
            id: row.get(0)?,
            category_id: row.get(1)?,
            month: row.get(2)?,
            amount: row.get(3)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare(
        "SELECT id, transaction_id, category_id, amount, memo FROM split_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE user_id = ?1))"
    )?;
    let split_entries: Vec<SplitEntry> = stmt.query_map(rusqlite::params![user_id], |row| {
        Ok(SplitEntry {
            id: row.get(0)?,
            transaction_id: row.get(1)?,
            category_id: row.get(2)?,
            amount: row.get(3)?,
            memo: row.get(4)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    let currency: String = conn.query_row(
        "SELECT currency FROM user_preferences WHERE user_id = ?1",
        rusqlite::params![user_id],
        |row| row.get(0),
    ).unwrap_or_else(|_| "USD".to_string());

    let mut stmt = conn.prepare("SELECT month, locked FROM month_locks WHERE user_id = ?1")?;
    let month_locks: Vec<MonthLock> = stmt.query_map(rusqlite::params![user_id], |row| {
        Ok(MonthLock {
            month: row.get(0)?,
            locked: row.get::<_, i32>(1)? != 0,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(ExportData {
        accounts,
        category_groups,
        transactions,
        transfers,
        assignments,
        payees,
        schedules,
        split_entries,
        import_rules,
        preferences: UserPreferences { currency },
        month_locks,
    })
}

pub fn export_csv(conn: &Connection, user_id: &str) -> AppResult<String> {
    let accounts = db::accounts::list_accounts(conn, user_id)?;
    let groups = db::categories::list_groups_with_categories(conn, user_id)?;

    // Scope transactions to user's accounts
    let mut transactions = Vec::new();
    for acc in &accounts {
        let mut acc_txns = db::transactions::list_transactions(conn, Some(&acc.id), None, None, None)?;
        transactions.append(&mut acc_txns);
    }
    transactions.sort_by(|a, b| b.date.cmp(&a.date));

    let acc_map: std::collections::HashMap<&str, &str> = accounts.iter()
        .map(|a| (a.id.as_str(), a.name.as_str())).collect();

    let cat_map: std::collections::HashMap<String, String> = groups.iter()
        .flat_map(|g| g.categories.iter().map(move |c| {
            (c.id.clone(), format!("{}: {}", g.name, c.name))
        })).collect();

    let mut wtr = csv::Writer::from_writer(Vec::new());
    wtr.write_record(["date", "account", "payee", "category", "amount", "memo", "cleared", "source"])
        .map_err(|e| AppError::Internal(e.to_string()))?;
    for tx in &transactions {
        let sign = if tx.amount < 0 { "-" } else { "" };
        let abs = (tx.amount as i128).unsigned_abs() as i64;
        let amount_str = format!("{}{}.{:02}", sign, abs / 100, abs % 100);
        let account_name = acc_map.get(tx.account_id.as_str()).copied().unwrap_or("");
        let category_name = tx.category_id.as_ref()
            .and_then(|id| cat_map.get(id))
            .map(|s| s.as_str())
            .unwrap_or("");
        wtr.write_record([
            tx.date.as_str(),
            account_name,
            tx.payee.as_deref().unwrap_or(""),
            category_name,
            amount_str.as_str(),
            tx.memo.as_deref().unwrap_or(""),
            if tx.cleared { "true" } else { "false" },
            tx.source.as_deref().unwrap_or(""),
        ]).map_err(|e| AppError::Internal(e.to_string()))?;
    }
    let data = wtr.into_inner().map_err(|e| AppError::Internal(e.to_string()))?;
    String::from_utf8(data).map_err(|e| AppError::Internal(e.to_string()))
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

pub fn import_csv(conn: &Connection, user_id: &str, csv_data: &str, default_account_id: &str) -> AppResult<usize> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(csv_data.as_bytes());

    let accounts = db::accounts::list_accounts(conn, user_id)?;
    let groups = db::categories::list_groups_with_categories(conn, user_id)?;
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
            payee_id: None,
            amount,
            memo: row.memo,
            cleared: false,
            linked_id: None,
            source: Some("import".to_string()),
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
            user_id,
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
