use rusqlite::Connection;
use crate::db;
use crate::error::AppResult;
use crate::models::category::Category;

pub fn seed_starter_categories(conn: &Connection, user_id: &str) -> AppResult<()> {
    let groups: Vec<(&str, &str, Vec<(&str, &str, &str, i64)>)> = vec![
        ("Housing", "home", vec![
            ("Rent/Mortgage", "key", "monthly_spending", 0),
            ("Electricity", "zap", "monthly_spending", 0),
            ("Water", "droplets", "monthly_spending", 0),
            ("Internet", "wifi", "monthly_spending", 0),
        ]),
        ("Transportation", "car", vec![
            ("Gas", "fuel", "monthly_spending", 0),
            ("Car Insurance", "shield", "monthly_spending", 0),
            ("Ride Share", "car", "monthly_spending", 0),
        ]),
        ("Food", "utensils-crossed", vec![
            ("Groceries", "shopping-cart", "monthly_spending", 0),
            ("Dining Out", "utensils-crossed", "monthly_spending", 0),
            ("Coffee", "coffee", "monthly_spending", 0),
        ]),
        ("Subscriptions", "tv", vec![
            ("Streaming", "tv", "monthly_spending", 0),
            ("Music", "music", "monthly_spending", 0),
            ("Gym", "dumbbell", "monthly_spending", 0),
        ]),
        ("Health", "heart", vec![
            ("Insurance", "shield", "monthly_spending", 0),
            ("Doctor/Pharmacy", "pill", "monthly_spending", 0),
        ]),
        ("Personal", "shopping-bag", vec![
            ("Clothing", "shirt", "monthly_spending", 0),
            ("Phone", "phone", "monthly_spending", 0),
            ("Shopping", "shopping-bag", "monthly_spending", 0),
            ("Pet Care", "heart", "monthly_spending", 0),
        ]),
        ("Savings Goals", "piggy-bank", vec![
            ("Emergency Fund", "piggy-bank", "target_balance", 0),
            ("Vacation", "plane", "target_balance_by_date", 0),
        ]),
    ];

    let mut group_order = 0;
    for (group_name, group_icon, categories) in &groups {
        let group_id = uuid::Uuid::new_v4().to_string();
        db::categories::insert_group(conn, &group_id, group_name, Some(group_icon), group_order, user_id)?;
        group_order += 1;

        let mut cat_order = 0;
        for (cat_name, cat_icon, _target_type, _target_amount) in categories {
            let cat = Category {
                id: uuid::Uuid::new_v4().to_string(),
                group_id: group_id.clone(),
                name: cat_name.to_string(),
                icon: Some(cat_icon.to_string()),
                sort_order: cat_order,
                target_type: None,
                target_amount: None,
                target_date: None,
            };
            db::categories::insert_category(conn, &cat)?;
            cat_order += 1;
        }
    }

    Ok(())
}
