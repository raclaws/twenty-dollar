use std::collections::HashMap;
use chrono::{Datelike, NaiveDate};
use rusqlite::Connection;
use crate::db;
use crate::error::AppResult;
use crate::models::budget::{BudgetMonth, BudgetGroup, CategoryBudget};

pub fn compute_budget(conn: &Connection, user_id: &str, month: &str) -> AppResult<BudgetMonth> {
    let month_start = format!("{}-01", month);
    let month_end = last_day_of_month(month);

    let ready_to_assign = compute_rta(conn, month, &month_end)?;

    let groups = db::categories::list_groups_with_categories(conn, user_id)?;

    let activity_this_month = db::transactions::activity_by_category_for_month(conn, &month_start, &month_end)?;
    let mut activity_map: HashMap<String, i64> = HashMap::new();
    for (cat_id, amount) in activity_this_month {
        *activity_map.entry(cat_id).or_insert(0) += amount;
    }

    let cumulative_activity = db::transactions::cumulative_activity_by_category(conn, &month_end)?;
    let mut cum_activity_map: HashMap<String, i64> = HashMap::new();
    for (cat_id, amount) in cumulative_activity {
        *cum_activity_map.entry(cat_id).or_insert(0) += amount;
    }

    let assigned_this_month = db::assignments::assigned_for_month_batch(conn, month)?;
    let mut assigned_map: HashMap<String, i64> = HashMap::new();
    for (cat_id, amount) in assigned_this_month {
        assigned_map.insert(cat_id, amount);
    }

    let cum_assigned = db::assignments::cumulative_assigned_batch(conn, month)?;
    let mut cum_assigned_map: HashMap<String, i64> = HashMap::new();
    for (cat_id, amount) in cum_assigned {
        cum_assigned_map.insert(cat_id, amount);
    }

    let mut budget_groups = Vec::new();
    for group in &groups {
        let mut cat_budgets = Vec::new();
        for cat in &group.categories {
            let assigned = assigned_map.get(&cat.id).copied().unwrap_or(0);
            let activity = activity_map.get(&cat.id).copied().unwrap_or(0);
            let cum_a = cum_assigned_map.get(&cat.id).copied().unwrap_or(0);
            let cum_act = cum_activity_map.get(&cat.id).copied().unwrap_or(0);
            let available = cum_a + cum_act;

            cat_budgets.push(CategoryBudget {
                category_id: cat.id.clone(),
                category_name: cat.name.clone(),
                group_id: group.id.clone(),
                assigned,
                activity,
                available,
            });
        }
        budget_groups.push(BudgetGroup {
            group_id: group.id.clone(),
            group_name: group.name.clone(),
            categories: cat_budgets,
        });
    }

    Ok(BudgetMonth {
        month: month.to_string(),
        ready_to_assign,
        groups: budget_groups,
    })
}

pub fn compute_rta(conn: &Connection, month: &str, month_end: &str) -> AppResult<i64> {
    let total_income = db::transactions::total_income_up_to(conn, month_end)?;
    let total_assigned = db::assignments::total_assigned_up_to(conn, month)?;
    Ok(total_income - total_assigned)
}

fn last_day_of_month(month: &str) -> String {
    let parts: Vec<&str> = month.split('-').collect();
    let year: i32 = parts[0].parse().unwrap_or(2026);
    let m: u32 = parts[1].parse().unwrap_or(1);

    let last_day = if m == 12 {
        31
    } else {
        let next_month_first = NaiveDate::from_ymd_opt(year, m + 1, 1).unwrap();
        next_month_first.pred_opt().unwrap().day()
    };

    format!("{}-{:02}-{:02}", year, m, last_day)
}
