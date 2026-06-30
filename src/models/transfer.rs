use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transfer {
    pub id: String,
    pub from_account_id: String,
    pub to_account_id: String,
    pub date: String,
    pub amount: i64,
    pub memo: Option<String>,
    pub cleared: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTransfer {
    pub from_account_id: String,
    pub to_account_id: String,
    pub date: String,
    pub amount: i64,
    pub memo: Option<String>,
    pub cleared: Option<bool>,
}
