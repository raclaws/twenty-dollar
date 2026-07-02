use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportRule {
    pub id: String,
    pub tokens: String,
    pub payee_id: Option<String>,
    pub category_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateImportRule {
    pub id: Option<String>,
    pub tokens: String,
    pub payee_id: Option<String>,
    pub category_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateImportRule {
    pub payee_id: Option<String>,
    pub category_id: Option<String>,
}
