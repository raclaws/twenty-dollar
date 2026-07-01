use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payee {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub payee_type: Option<String>,
    pub account_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePayee {
    pub id: Option<String>,
    pub name: String,
    #[serde(rename = "type")]
    pub payee_type: Option<String>,
    pub account_id: Option<String>,
}
