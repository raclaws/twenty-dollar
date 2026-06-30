use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndoEntry {
    pub id: i64,
    pub operation: UndoOperation,
    pub undone: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndoOperation {
    pub description: String,
    pub forward: Vec<Mutation>,
    pub inverse: Vec<Mutation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Mutation {
    Insert { table: String, data: serde_json::Value },
    Delete { table: String, id: String },
    Update { table: String, id: String, fields: serde_json::Value, prev: serde_json::Value },
}
