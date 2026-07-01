use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schedule {
    pub id: String,
    pub account_id: String,
    pub category_id: Option<String>,
    pub payee: Option<String>,
    pub amount: i64,
    pub memo: Option<String>,
    pub frequency: String,
    pub next_due: String,
    pub end_date: Option<String>,
    pub auto_clear: bool,
    pub paused: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSchedule {
    pub account_id: String,
    pub category_id: Option<String>,
    pub payee: Option<String>,
    pub amount: i64,
    pub memo: Option<String>,
    pub frequency: String,
    pub next_due: String,
    pub end_date: Option<String>,
    pub auto_clear: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSchedule {
    pub account_id: Option<String>,
    pub category_id: Option<String>,
    pub payee: Option<String>,
    pub amount: Option<i64>,
    pub memo: Option<String>,
    pub frequency: Option<String>,
    pub next_due: Option<String>,
    pub end_date: Option<String>,
    pub auto_clear: Option<bool>,
    pub paused: Option<bool>,
}
