use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetMonth {
    pub month: String,
    pub ready_to_assign: i64,
    pub groups: Vec<BudgetGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetGroup {
    pub group_id: String,
    pub group_name: String,
    pub categories: Vec<CategoryBudget>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryBudget {
    pub category_id: String,
    pub category_name: String,
    pub group_id: String,
    pub assigned: i64,
    pub activity: i64,
    pub available: i64,
}
