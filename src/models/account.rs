use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountType {
    Checking,
    Savings,
    Cash,
    Credit,
}

impl AccountType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Checking => "checking",
            Self::Savings => "savings",
            Self::Cash => "cash",
            Self::Credit => "credit",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "checking" => Some(Self::Checking),
            "savings" => Some(Self::Savings),
            "cash" => Some(Self::Cash),
            "credit" => Some(Self::Credit),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub account_type: AccountType,
    pub sort_order: i32,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateAccount {
    pub name: String,
    #[serde(rename = "type")]
    pub account_type: AccountType,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAccount {
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub account_type: Option<AccountType>,
    pub sort_order: Option<i32>,
}
