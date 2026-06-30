use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assignment {
    pub id: String,
    pub category_id: String,
    pub month: String,
    pub amount: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssignRequest {
    pub category_id: String,
    pub month: String,
    pub amount: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MoveRequest {
    pub from_category_id: String,
    pub to_category_id: String,
    pub month: String,
    pub amount: i64,
}
