use rusqlite::Connection;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::category::*;
use crate::models::undo::Mutation;
use crate::services::undo::record_undo;

pub fn list_categories(conn: &Connection) -> AppResult<Vec<CategoryGroup>> {
    Ok(db::categories::list_groups_with_categories(conn)?)
}

pub fn create_group(conn: &Connection, input: CreateCategoryGroup) -> AppResult<CategoryGroup> {
    let id = uuid::Uuid::new_v4().to_string();
    let sort_order = input.sort_order.unwrap_or(0);
    db::categories::insert_group(conn, &id, &input.name, sort_order)?;

    let group = CategoryGroup { id: id.clone(), name: input.name, sort_order, categories: Vec::new() };

    record_undo(conn, &format!("Create group '{}'", group.name), vec![
        Mutation::Insert { table: "category_groups".into(), data: serde_json::json!({"id": id, "name": &group.name, "sort_order": sort_order}) }
    ], vec![
        Mutation::Delete { table: "category_groups".into(), id: group.id.clone() }
    ])?;

    Ok(group)
}

pub fn update_group(conn: &Connection, id: &str, input: UpdateCategoryGroup) -> AppResult<CategoryGroup> {
    let existing = db::categories::get_group(conn, id)?
        .ok_or_else(|| AppError::NotFound(format!("Group {}", id)))?;

    db::categories::update_group(conn, id, input.name.as_deref(), input.sort_order)?;
    let updated = db::categories::get_group(conn, id)?.unwrap();

    let prev = serde_json::json!({"name": existing.name, "sort_order": existing.sort_order});
    let fields = serde_json::json!({"name": updated.name, "sort_order": updated.sort_order});

    record_undo(conn, &format!("Update group '{}'", updated.name), vec![
        Mutation::Update { table: "category_groups".into(), id: id.to_string(), fields: fields.clone(), prev: prev.clone() }
    ], vec![
        Mutation::Update { table: "category_groups".into(), id: id.to_string(), fields: prev, prev: fields }
    ])?;

    Ok(updated)
}

pub fn delete_group(conn: &Connection, id: &str) -> AppResult<()> {
    let existing = db::categories::get_group(conn, id)?
        .ok_or_else(|| AppError::NotFound(format!("Group {}", id)))?;

    db::categories::delete_group(conn, id)?;

    record_undo(conn, &format!("Delete group '{}'", existing.name), vec![
        Mutation::Delete { table: "category_groups".into(), id: id.to_string() }
    ], vec![
        Mutation::Insert { table: "category_groups".into(), data: serde_json::json!({"id": existing.id, "name": existing.name, "sort_order": existing.sort_order}) }
    ])?;

    Ok(())
}

pub fn create_category(conn: &Connection, input: CreateCategory) -> AppResult<Category> {
    let id = uuid::Uuid::new_v4().to_string();
    let cat = Category {
        id: id.clone(),
        group_id: input.group_id,
        name: input.name,
        sort_order: input.sort_order.unwrap_or(0),
        target_type: input.target_type,
        target_amount: input.target_amount,
        target_date: input.target_date,
    };
    db::categories::insert_category(conn, &cat)?;

    record_undo(conn, &format!("Create category '{}'", cat.name), vec![
        Mutation::Insert { table: "categories".into(), data: serde_json::to_value(&cat).unwrap() }
    ], vec![
        Mutation::Delete { table: "categories".into(), id }
    ])?;

    Ok(cat)
}

pub fn update_category(conn: &Connection, id: &str, input: UpdateCategory) -> AppResult<Category> {
    let existing = db::categories::get_category(conn, id)?
        .ok_or_else(|| AppError::NotFound(format!("Category {}", id)))?;

    db::categories::update_category(
        conn, id,
        input.name.as_deref(),
        input.group_id.as_deref(),
        input.sort_order,
        input.target_type.as_ref(),
        input.target_amount,
        input.target_date.as_deref(),
    )?;
    let updated = db::categories::get_category(conn, id)?.unwrap();

    let prev = serde_json::to_value(&existing).unwrap();
    let fields = serde_json::to_value(&updated).unwrap();

    record_undo(conn, &format!("Update category '{}'", updated.name), vec![
        Mutation::Update { table: "categories".into(), id: id.to_string(), fields: fields.clone(), prev: prev.clone() }
    ], vec![
        Mutation::Update { table: "categories".into(), id: id.to_string(), fields: prev, prev: fields }
    ])?;

    Ok(updated)
}

pub fn delete_category(conn: &Connection, id: &str) -> AppResult<()> {
    let existing = db::categories::get_category(conn, id)?
        .ok_or_else(|| AppError::NotFound(format!("Category {}", id)))?;

    db::categories::delete_category(conn, id)?;

    record_undo(conn, &format!("Delete category '{}'", existing.name), vec![
        Mutation::Delete { table: "categories".into(), id: id.to_string() }
    ], vec![
        Mutation::Insert { table: "categories".into(), data: serde_json::to_value(&existing).unwrap() }
    ])?;

    Ok(())
}

pub fn reorder_categories(conn: &Connection, items: Vec<ReorderItem>) -> AppResult<()> {
    let tuples: Vec<(String, i32)> = items.into_iter().map(|i| (i.id, i.sort_order)).collect();
    db::categories::reorder_categories(conn, &tuples)?;
    Ok(())
}
