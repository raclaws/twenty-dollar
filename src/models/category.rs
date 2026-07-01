use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetType {
    MonthlySpending,
    MonthlyContribution,
    TargetBalanceByDate,
    TargetBalance,
}

impl TargetType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::MonthlySpending => "monthly_spending",
            Self::MonthlyContribution => "monthly_contribution",
            Self::TargetBalanceByDate => "target_balance_by_date",
            Self::TargetBalance => "target_balance",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "monthly_spending" => Some(Self::MonthlySpending),
            "monthly_contribution" => Some(Self::MonthlyContribution),
            "target_balance_by_date" => Some(Self::TargetBalanceByDate),
            "target_balance" => Some(Self::TargetBalance),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryGroup {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub sort_order: i32,
    #[serde(default)]
    pub categories: Vec<Category>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub group_id: String,
    pub name: String,
    pub icon: Option<String>,
    pub sort_order: i32,
    pub target_type: Option<TargetType>,
    pub target_amount: Option<i64>,
    pub target_date: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateCategoryGroup {
    pub id: Option<String>,
    pub name: String,
    pub icon: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCategoryGroup {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateCategory {
    pub id: Option<String>,
    pub group_id: String,
    pub name: String,
    pub icon: Option<String>,
    pub sort_order: Option<i32>,
    pub target_type: Option<TargetType>,
    pub target_amount: Option<i64>,
    pub target_date: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCategory {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub group_id: Option<String>,
    pub sort_order: Option<i32>,
    pub target_type: Option<TargetType>,
    pub target_amount: Option<i64>,
    pub target_date: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReorderItem {
    pub id: String,
    pub sort_order: i32,
}
