use chrono::{Datelike, NaiveDate};
use rusqlite::Connection;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::schedule::{CreateSchedule, Schedule, UpdateSchedule};
use crate::models::transaction::Transaction;

pub fn list_schedules(conn: &Connection, user_id: &str) -> AppResult<Vec<Schedule>> {
    Ok(db::schedules::list_schedules(conn, user_id)?)
}

pub fn create_schedule(conn: &Connection, user_id: &str, input: CreateSchedule) -> AppResult<Schedule> {
    validate_frequency(&input.frequency)?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let schedule = Schedule {
        id: id.clone(),
        account_id: input.account_id,
        category_id: input.category_id,
        payee: input.payee,
        amount: input.amount,
        memo: input.memo,
        frequency: input.frequency,
        next_due: input.next_due,
        end_date: input.end_date,
        auto_clear: input.auto_clear.unwrap_or(true),
        paused: false,
        created_at: now,
    };
    db::schedules::insert_schedule(conn, &schedule, user_id)?;
    Ok(schedule)
}

pub fn update_schedule(conn: &Connection, user_id: &str, id: &str, input: UpdateSchedule) -> AppResult<Schedule> {
    let _existing = db::schedules::get_schedule(conn, id, user_id)?
        .ok_or_else(|| AppError::NotFound(format!("Schedule {}", id)))?;

    let mut fields: Vec<(&str, Box<dyn rusqlite::types::ToSql>)> = Vec::new();

    if let Some(v) = input.account_id { fields.push(("account_id", Box::new(v))); }
    if let Some(v) = input.category_id { fields.push(("category_id", Box::new(v))); }
    if let Some(v) = input.payee { fields.push(("payee", Box::new(v))); }
    if let Some(v) = input.amount { fields.push(("amount", Box::new(v))); }
    if let Some(v) = input.memo { fields.push(("memo", Box::new(v))); }
    if let Some(ref v) = input.frequency {
        validate_frequency(v)?;
        fields.push(("frequency", Box::new(v.clone())));
    }
    if let Some(v) = input.next_due { fields.push(("next_due", Box::new(v))); }
    if let Some(v) = input.end_date { fields.push(("end_date", Box::new(v))); }
    if let Some(v) = input.auto_clear { fields.push(("auto_clear", Box::new(v as i32))); }
    if let Some(v) = input.paused { fields.push(("paused", Box::new(v as i32))); }

    db::schedules::update_schedule_fields(conn, id, user_id, &fields)?;
    let updated = db::schedules::get_schedule(conn, id, user_id)?.unwrap();
    Ok(updated)
}

pub fn delete_schedule(conn: &Connection, user_id: &str, id: &str) -> AppResult<()> {
    let existed = db::schedules::delete_schedule(conn, id, user_id)?;
    if !existed {
        return Err(AppError::NotFound(format!("Schedule {}", id)));
    }
    Ok(())
}

pub fn generate_due(conn: &Connection, user_id: &str, today: &str) -> AppResult<Vec<Transaction>> {
    let due = db::schedules::due_schedules(conn, user_id, today)?;
    let mut generated = Vec::new();

    for schedule in &due {
        let mut current_due = NaiveDate::parse_from_str(&schedule.next_due, "%Y-%m-%d")
            .map_err(|_| AppError::Internal("Invalid next_due date".into()))?;
        let today_date = NaiveDate::parse_from_str(today, "%Y-%m-%d")
            .map_err(|_| AppError::Internal("Invalid today date".into()))?;

        while current_due <= today_date {
            let txn_id = uuid::Uuid::new_v4().to_string();
            let now = chrono::Utc::now().to_rfc3339();
            let txn = Transaction {
                id: txn_id,
                account_id: schedule.account_id.clone(),
                category_id: schedule.category_id.clone(),
                date: current_due.format("%Y-%m-%d").to_string(),
                payee: schedule.payee.clone(),
                amount: schedule.amount,
                memo: schedule.memo.clone(),
                cleared: schedule.auto_clear,
                created_at: now,
                splits: Vec::new(),
            };
            db::transactions::insert_transaction(conn, &txn)?;
            generated.push(txn);

            current_due = advance_date(current_due, &schedule.frequency);

            if let Some(ref end) = schedule.end_date {
                let end_date = NaiveDate::parse_from_str(end, "%Y-%m-%d").unwrap_or(today_date);
                if current_due > end_date {
                    break;
                }
            }
        }

        db::schedules::advance_next_due(conn, &schedule.id, &current_due.format("%Y-%m-%d").to_string())?;
    }

    Ok(generated)
}

fn advance_date(date: NaiveDate, frequency: &str) -> NaiveDate {
    match frequency {
        "weekly" => date + chrono::Duration::weeks(1),
        "biweekly" => date + chrono::Duration::weeks(2),
        "monthly" => {
            let month = date.month();
            let year = date.year();
            let (new_year, new_month) = if month == 12 { (year + 1, 1) } else { (year, month + 1) };
            let day = date.day().min(days_in_month(new_year, new_month));
            NaiveDate::from_ymd_opt(new_year, new_month, day).unwrap_or(date)
        }
        "yearly" => {
            let day = date.day().min(days_in_month(date.year() + 1, date.month()));
            NaiveDate::from_ymd_opt(date.year() + 1, date.month(), day).unwrap_or(date)
        }
        _ => date + chrono::Duration::days(30),
    }
}

fn days_in_month(year: i32, month: u32) -> u32 {
    if month == 12 {
        31
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
            .unwrap()
            .pred_opt()
            .unwrap()
            .day()
    }
}

fn validate_frequency(f: &str) -> AppResult<()> {
    match f {
        "weekly" | "biweekly" | "monthly" | "yearly" => Ok(()),
        _ => Err(AppError::Validation(format!("Invalid frequency: {}. Must be weekly, biweekly, monthly, or yearly.", f))),
    }
}
