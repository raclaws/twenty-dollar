use rusqlite::{params, Connection, OptionalExtension};
use crate::models::category::{Category, CategoryGroup, TargetType};

pub fn list_groups_with_categories(conn: &Connection, user_id: &str) -> Result<Vec<CategoryGroup>, rusqlite::Error> {
    let mut groups = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT id, name, sort_order FROM category_groups WHERE user_id = ?1 ORDER BY sort_order, name"
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        Ok(CategoryGroup {
            id: row.get(0)?,
            name: row.get(1)?,
            sort_order: row.get(2)?,
            categories: Vec::new(),
        })
    })?;
    for row in rows {
        groups.push(row?);
    }

    let group_ids: Vec<String> = groups.iter().map(|g| g.id.clone()).collect();
    if group_ids.is_empty() {
        return Ok(groups);
    }

    let placeholders: String = group_ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, group_id, name, sort_order, target_type, target_amount, target_date
         FROM categories WHERE group_id IN ({}) ORDER BY sort_order, name",
        placeholders
    );
    let mut cat_stmt = conn.prepare(&sql)?;
    let params: Vec<&dyn rusqlite::types::ToSql> = group_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
    let cats = cat_stmt.query_map(params.as_slice(), |row| {
        let tt: Option<String> = row.get(4)?;
        Ok(Category {
            id: row.get(0)?,
            group_id: row.get(1)?,
            name: row.get(2)?,
            sort_order: row.get(3)?,
            target_type: tt.and_then(|s| TargetType::from_str(&s)),
            target_amount: row.get(5)?,
            target_date: row.get(6)?,
        })
    })?;

    let mut cat_list: Vec<Category> = Vec::new();
    for cat in cats {
        cat_list.push(cat?);
    }

    for group in &mut groups {
        group.categories = cat_list.iter()
            .filter(|c| c.group_id == group.id)
            .cloned()
            .collect();
    }

    Ok(groups)
}

pub fn get_group(conn: &Connection, id: &str, user_id: &str) -> Result<Option<CategoryGroup>, rusqlite::Error> {
    conn.query_row(
        "SELECT id, name, sort_order FROM category_groups WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
        |row| Ok(CategoryGroup {
            id: row.get(0)?,
            name: row.get(1)?,
            sort_order: row.get(2)?,
            categories: Vec::new(),
        }),
    ).optional()
}

pub fn insert_group(conn: &Connection, id: &str, name: &str, sort_order: i32, user_id: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO category_groups (id, user_id, name, sort_order) VALUES (?1, ?2, ?3, ?4)",
        params![id, user_id, name, sort_order],
    )?;
    Ok(())
}

pub fn update_group(conn: &Connection, id: &str, user_id: &str, name: Option<&str>, sort_order: Option<i32>) -> Result<bool, rusqlite::Error> {
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(n) = name {
        sets.push("name = ?");
        values.push(Box::new(n.to_string()));
    }
    if let Some(s) = sort_order {
        sets.push("sort_order = ?");
        values.push(Box::new(s));
    }
    if sets.is_empty() {
        return Ok(false);
    }

    values.push(Box::new(id.to_string()));
    values.push(Box::new(user_id.to_string()));
    let sql = format!("UPDATE category_groups SET {} WHERE id = ? AND user_id = ?", sets.join(", "));
    let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    let changed = conn.execute(&sql, params.as_slice())?;
    Ok(changed > 0)
}

pub fn delete_group(conn: &Connection, id: &str, user_id: &str) -> Result<bool, rusqlite::Error> {
    let changed = conn.execute("DELETE FROM category_groups WHERE id = ?1 AND user_id = ?2", params![id, user_id])?;
    Ok(changed > 0)
}

pub fn get_category(conn: &Connection, id: &str) -> Result<Option<Category>, rusqlite::Error> {
    conn.query_row(
        "SELECT id, group_id, name, sort_order, target_type, target_amount, target_date FROM categories WHERE id = ?1",
        params![id],
        |row| {
            let tt: Option<String> = row.get(4)?;
            Ok(Category {
                id: row.get(0)?,
                group_id: row.get(1)?,
                name: row.get(2)?,
                sort_order: row.get(3)?,
                target_type: tt.and_then(|s| TargetType::from_str(&s)),
                target_amount: row.get(5)?,
                target_date: row.get(6)?,
            })
        },
    ).optional()
}

pub fn insert_category(conn: &Connection, cat: &Category) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO categories (id, group_id, name, sort_order, target_type, target_amount, target_date)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            cat.id, cat.group_id, cat.name, cat.sort_order,
            cat.target_type.as_ref().map(|t| t.as_str()),
            cat.target_amount, cat.target_date
        ],
    )?;
    Ok(())
}

pub fn update_category(conn: &Connection, id: &str, name: Option<&str>, group_id: Option<&str>, sort_order: Option<i32>, target_type: Option<&TargetType>, target_amount: Option<i64>, target_date: Option<&str>) -> Result<bool, rusqlite::Error> {
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(n) = name {
        sets.push("name = ?");
        values.push(Box::new(n.to_string()));
    }
    if let Some(g) = group_id {
        sets.push("group_id = ?");
        values.push(Box::new(g.to_string()));
    }
    if let Some(s) = sort_order {
        sets.push("sort_order = ?");
        values.push(Box::new(s));
    }
    if let Some(t) = target_type {
        sets.push("target_type = ?");
        values.push(Box::new(t.as_str().to_string()));
    }
    if let Some(a) = target_amount {
        sets.push("target_amount = ?");
        values.push(Box::new(a));
    }
    if let Some(d) = target_date {
        sets.push("target_date = ?");
        values.push(Box::new(d.to_string()));
    }
    if sets.is_empty() {
        return Ok(false);
    }

    values.push(Box::new(id.to_string()));
    let sql = format!("UPDATE categories SET {} WHERE id = ?", sets.join(", "));
    let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    let changed = conn.execute(&sql, params.as_slice())?;
    Ok(changed > 0)
}

pub fn delete_category(conn: &Connection, id: &str) -> Result<bool, rusqlite::Error> {
    let changed = conn.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
    Ok(changed > 0)
}

pub fn reorder_categories(conn: &Connection, items: &[(String, i32)]) -> Result<(), rusqlite::Error> {
    for (id, sort_order) in items {
        conn.execute(
            "UPDATE categories SET sort_order = ?1 WHERE id = ?2",
            params![sort_order, id],
        )?;
    }
    Ok(())
}
