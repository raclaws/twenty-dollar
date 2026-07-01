use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub account_id: String,
    pub category_id: Option<String>,
    pub date: String,
    pub payee: Option<String>,
    pub payee_id: Option<String>,
    pub amount: i64,
    pub memo: Option<String>,
    pub cleared: bool,
    pub linked_id: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub splits: Vec<SplitEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitEntry {
    pub id: String,
    pub transaction_id: String,
    pub category_id: Option<String>,
    pub amount: i64,
    pub memo: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTransaction {
    pub id: Option<String>,
    pub account_id: String,
    pub category_id: Option<String>,
    pub date: String,
    pub payee: Option<String>,
    pub payee_id: Option<String>,
    pub amount: i64,
    pub memo: Option<String>,
    pub cleared: Option<bool>,
    pub linked_id: Option<String>,
    #[serde(default)]
    pub splits: Vec<CreateSplitEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSplitEntry {
    pub category_id: Option<String>,
    pub amount: i64,
    pub memo: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTransaction {
    pub account_id: Option<String>,
    pub category_id: Option<String>,
    pub date: Option<String>,
    pub payee: Option<String>,
    pub payee_id: Option<String>,
    pub amount: Option<i64>,
    pub memo: Option<String>,
    pub cleared: Option<bool>,
    pub linked_id: Option<String>,
    pub splits: Option<Vec<CreateSplitEntry>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BulkAction {
    Delete,
    Clear,
    Unclear,
    Categorize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BulkOperation {
    pub action: BulkAction,
    pub ids: Vec<String>,
    pub category_id: Option<String>,
}
