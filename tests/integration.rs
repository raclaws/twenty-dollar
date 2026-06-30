use axum::http::StatusCode;
use axum::body::Body;
use http_body_util::BodyExt;
use tower::ServiceExt;
use serde_json::{json, Value};

fn build_test_app() -> axum::Router {
    let pool = twenty_dollar::db::init_memory_pool().unwrap();
    {
        let conn = pool.get().unwrap();
        twenty_dollar::db::schema::run_migrations(&conn).unwrap();
    }
    twenty_dollar::app::build_router(pool)
}

async fn request(app: axum::Router, method: &str, path: &str, body: Option<Value>) -> (StatusCode, Value) {
    let req = match method {
        "GET" => axum::http::Request::builder()
            .method("GET")
            .uri(path)
            .body(Body::empty())
            .unwrap(),
        "POST" => axum::http::Request::builder()
            .method("POST")
            .uri(path)
            .header("content-type", "application/json")
            .body(Body::from(serde_json::to_string(&body.unwrap_or(json!({}))).unwrap()))
            .unwrap(),
        "PATCH" => axum::http::Request::builder()
            .method("PATCH")
            .uri(path)
            .header("content-type", "application/json")
            .body(Body::from(serde_json::to_string(&body.unwrap_or(json!({}))).unwrap()))
            .unwrap(),
        "DELETE" => axum::http::Request::builder()
            .method("DELETE")
            .uri(path)
            .body(Body::empty())
            .unwrap(),
        _ => panic!("unsupported method"),
    };

    let response = app.oneshot(req).await.unwrap();
    let status = response.status();
    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let value: Value = serde_json::from_slice(&body_bytes).unwrap_or(json!(null));
    (status, value)
}

#[tokio::test]
async fn test_categories_crud() {
    let app = build_test_app();

    // Create group
    let (status, body) = request(app.clone(), "POST", "/api/category-groups", Some(json!({
        "name": "Essential"
    }))).await;
    assert_eq!(status, StatusCode::OK);
    let group_id = body["id"].as_str().unwrap().to_string();
    assert_eq!(body["name"], "Essential");

    // Create category
    let (status, body) = request(app.clone(), "POST", "/api/categories", Some(json!({
        "group_id": group_id,
        "name": "Rent"
    }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], "Rent");

    // List
    let (status, body) = request(app.clone(), "GET", "/api/categories", None).await;
    assert_eq!(status, StatusCode::OK);
    let groups = body.as_array().unwrap();
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0]["categories"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn test_budget_engine() {
    let app = build_test_app();

    // Setup: account, group, category
    let (_, acc) = request(app.clone(), "POST", "/api/accounts", Some(json!({
        "name": "Checking",
        "type": "checking"
    }))).await;
    let account_id = acc["id"].as_str().unwrap().to_string();

    let (_, group) = request(app.clone(), "POST", "/api/category-groups", Some(json!({
        "name": "Bills"
    }))).await;
    let group_id = group["id"].as_str().unwrap().to_string();

    let (_, cat) = request(app.clone(), "POST", "/api/categories", Some(json!({
        "group_id": group_id,
        "name": "Rent"
    }))).await;
    let cat_id = cat["id"].as_str().unwrap().to_string();

    // Income transaction (positive, no category = inflow)
    let (status, _) = request(app.clone(), "POST", "/api/transactions", Some(json!({
        "account_id": account_id,
        "date": "2026-06-15",
        "payee": "Employer",
        "amount": 500000
    }))).await;
    assert_eq!(status, StatusCode::OK);

    // Check budget before assignment
    let (status, budget) = request(app.clone(), "GET", "/api/budget?month=2026-06", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(budget["ready_to_assign"], 500000);

    // Assign 200000 to Rent
    let (status, result) = request(app.clone(), "POST", "/api/budget/assign", Some(json!({
        "category_id": cat_id,
        "month": "2026-06",
        "amount": 200000
    }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(result["ready_to_assign"], 300000);

    // Check budget after assignment
    let (_, budget) = request(app.clone(), "GET", "/api/budget?month=2026-06", None).await;
    assert_eq!(budget["ready_to_assign"], 300000);
    let cat_budget = &budget["groups"][0]["categories"][0];
    assert_eq!(cat_budget["assigned"], 200000);
    assert_eq!(cat_budget["available"], 200000);
    assert_eq!(cat_budget["activity"], 0);

    // Spend from Rent category
    let (status, _) = request(app.clone(), "POST", "/api/transactions", Some(json!({
        "account_id": account_id,
        "category_id": cat_id,
        "date": "2026-06-20",
        "payee": "Landlord",
        "amount": -150000
    }))).await;
    assert_eq!(status, StatusCode::OK);

    // Check budget after spending
    let (_, budget) = request(app.clone(), "GET", "/api/budget?month=2026-06", None).await;
    let cat_budget = &budget["groups"][0]["categories"][0];
    assert_eq!(cat_budget["assigned"], 200000);
    assert_eq!(cat_budget["activity"], -150000);
    assert_eq!(cat_budget["available"], 50000); // 200000 - 150000
}

#[tokio::test]
async fn test_move_money() {
    let app = build_test_app();

    // Setup
    let (_, acc) = request(app.clone(), "POST", "/api/accounts", Some(json!({
        "name": "Checking", "type": "checking"
    }))).await;
    let account_id = acc["id"].as_str().unwrap().to_string();

    let (_, group) = request(app.clone(), "POST", "/api/category-groups", Some(json!({
        "name": "Bills"
    }))).await;
    let group_id = group["id"].as_str().unwrap().to_string();

    let (_, cat_a) = request(app.clone(), "POST", "/api/categories", Some(json!({
        "group_id": group_id, "name": "Rent"
    }))).await;
    let (_, cat_b) = request(app.clone(), "POST", "/api/categories", Some(json!({
        "group_id": group_id, "name": "Groceries"
    }))).await;
    let cat_a_id = cat_a["id"].as_str().unwrap().to_string();
    let cat_b_id = cat_b["id"].as_str().unwrap().to_string();

    // Income
    request(app.clone(), "POST", "/api/transactions", Some(json!({
        "account_id": account_id, "date": "2026-06-01", "amount": 1000000
    }))).await;

    // Assign 600000 to Rent, 400000 to Groceries
    request(app.clone(), "POST", "/api/budget/assign", Some(json!({
        "category_id": cat_a_id, "month": "2026-06", "amount": 600000
    }))).await;
    request(app.clone(), "POST", "/api/budget/assign", Some(json!({
        "category_id": cat_b_id, "month": "2026-06", "amount": 400000
    }))).await;

    // Move 100000 from Rent to Groceries
    let (status, result) = request(app.clone(), "POST", "/api/budget/move", Some(json!({
        "from_category_id": cat_a_id,
        "to_category_id": cat_b_id,
        "month": "2026-06",
        "amount": 100000
    }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(result["ready_to_assign"], 0); // RTA unchanged

    // Verify balances
    let (_, budget) = request(app.clone(), "GET", "/api/budget?month=2026-06", None).await;
    let cats = &budget["groups"][0]["categories"];
    let rent = cats.as_array().unwrap().iter().find(|c| c["category_name"] == "Rent").unwrap();
    let groc = cats.as_array().unwrap().iter().find(|c| c["category_name"] == "Groceries").unwrap();
    assert_eq!(rent["available"], 500000);    // 600000 - 100000
    assert_eq!(groc["available"], 500000);    // 400000 + 100000
}

#[tokio::test]
async fn test_month_lock() {
    let app = build_test_app();

    // Setup
    let (_, acc) = request(app.clone(), "POST", "/api/accounts", Some(json!({
        "name": "Checking", "type": "checking"
    }))).await;
    let account_id = acc["id"].as_str().unwrap().to_string();

    let (_, group) = request(app.clone(), "POST", "/api/category-groups", Some(json!({
        "name": "Bills"
    }))).await;
    let (_, cat) = request(app.clone(), "POST", "/api/categories", Some(json!({
        "group_id": group["id"].as_str().unwrap(), "name": "Rent"
    }))).await;
    let cat_id = cat["id"].as_str().unwrap().to_string();

    // Lock June
    let (status, _) = request(app.clone(), "POST", "/api/months/lock", Some(json!({
        "month": "2026-06",
        "locked": true
    }))).await;
    assert_eq!(status, StatusCode::OK);

    // Try to assign — should fail with 409
    let (status, _) = request(app.clone(), "POST", "/api/budget/assign", Some(json!({
        "category_id": cat_id, "month": "2026-06", "amount": 100000
    }))).await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Try to add transaction in locked month — should fail
    let (status, _) = request(app.clone(), "POST", "/api/transactions", Some(json!({
        "account_id": account_id, "category_id": cat_id, "date": "2026-06-15", "amount": -5000
    }))).await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Unlock
    request(app.clone(), "POST", "/api/months/lock", Some(json!({
        "month": "2026-06", "locked": false
    }))).await;

    // Now should work
    let (status, _) = request(app.clone(), "POST", "/api/budget/assign", Some(json!({
        "category_id": cat_id, "month": "2026-06", "amount": 100000
    }))).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn test_undo_redo() {
    let app = build_test_app();

    // Setup
    let (_, acc) = request(app.clone(), "POST", "/api/accounts", Some(json!({
        "name": "Checking", "type": "checking"
    }))).await;
    let account_id = acc["id"].as_str().unwrap().to_string();

    let (_, group) = request(app.clone(), "POST", "/api/category-groups", Some(json!({
        "name": "Bills"
    }))).await;
    let (_, cat) = request(app.clone(), "POST", "/api/categories", Some(json!({
        "group_id": group["id"].as_str().unwrap(), "name": "Rent"
    }))).await;
    let cat_id = cat["id"].as_str().unwrap().to_string();

    // Income
    request(app.clone(), "POST", "/api/transactions", Some(json!({
        "account_id": account_id, "date": "2026-06-01", "amount": 500000
    }))).await;

    // Assign
    request(app.clone(), "POST", "/api/budget/assign", Some(json!({
        "category_id": cat_id, "month": "2026-06", "amount": 200000
    }))).await;

    // Verify assigned
    let (_, budget) = request(app.clone(), "GET", "/api/budget?month=2026-06", None).await;
    assert_eq!(budget["ready_to_assign"], 300000);

    // Undo
    let (status, result) = request(app.clone(), "POST", "/api/undo", None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(result["undone"].is_string());

    // Redo
    let (status, result) = request(app.clone(), "POST", "/api/redo", None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(result["redone"].is_string());
}

#[tokio::test]
async fn test_split_transactions() {
    let app = build_test_app();

    let (_, acc) = request(app.clone(), "POST", "/api/accounts", Some(json!({
        "name": "Checking", "type": "checking"
    }))).await;
    let account_id = acc["id"].as_str().unwrap().to_string();

    let (_, group) = request(app.clone(), "POST", "/api/category-groups", Some(json!({
        "name": "Bills"
    }))).await;
    let group_id = group["id"].as_str().unwrap().to_string();

    let (_, cat_a) = request(app.clone(), "POST", "/api/categories", Some(json!({
        "group_id": group_id, "name": "Groceries"
    }))).await;
    let (_, cat_b) = request(app.clone(), "POST", "/api/categories", Some(json!({
        "group_id": group_id, "name": "Household"
    }))).await;

    // Create split transaction
    let (status, txn) = request(app.clone(), "POST", "/api/transactions", Some(json!({
        "account_id": account_id,
        "date": "2026-06-10",
        "payee": "Walmart",
        "amount": -10000,
        "splits": [
            {"category_id": cat_a["id"], "amount": -7000},
            {"category_id": cat_b["id"], "amount": -3000}
        ]
    }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(txn["splits"].as_array().unwrap().len(), 2);
    assert!(txn["category_id"].is_null());

    // Invalid split (sum mismatch) should fail
    let (status, _) = request(app.clone(), "POST", "/api/transactions", Some(json!({
        "account_id": account_id,
        "date": "2026-06-10",
        "payee": "Bad Split",
        "amount": -10000,
        "splits": [
            {"category_id": cat_a["id"], "amount": -5000},
            {"category_id": cat_b["id"], "amount": -3000}
        ]
    }))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_carry_forward() {
    let app = build_test_app();

    // Setup
    let (_, acc) = request(app.clone(), "POST", "/api/accounts", Some(json!({
        "name": "Checking", "type": "checking"
    }))).await;
    let account_id = acc["id"].as_str().unwrap().to_string();

    let (_, group) = request(app.clone(), "POST", "/api/category-groups", Some(json!({
        "name": "Savings"
    }))).await;
    let (_, cat) = request(app.clone(), "POST", "/api/categories", Some(json!({
        "group_id": group["id"].as_str().unwrap(), "name": "Emergency Fund"
    }))).await;
    let cat_id = cat["id"].as_str().unwrap().to_string();

    // Income in May
    request(app.clone(), "POST", "/api/transactions", Some(json!({
        "account_id": account_id, "date": "2026-05-01", "amount": 1000000
    }))).await;

    // Assign in May
    request(app.clone(), "POST", "/api/budget/assign", Some(json!({
        "category_id": cat_id, "month": "2026-05", "amount": 300000
    }))).await;

    // Check June — available should carry forward
    let (_, budget) = request(app.clone(), "GET", "/api/budget?month=2026-06", None).await;
    let cat_budget = &budget["groups"][0]["categories"][0];
    assert_eq!(cat_budget["assigned"], 0);      // nothing assigned in June
    assert_eq!(cat_budget["available"], 300000); // carried from May

    // Assign more in June
    request(app.clone(), "POST", "/api/budget/assign", Some(json!({
        "category_id": cat_id, "month": "2026-06", "amount": 100000
    }))).await;

    let (_, budget) = request(app.clone(), "GET", "/api/budget?month=2026-06", None).await;
    let cat_budget = &budget["groups"][0]["categories"][0];
    assert_eq!(cat_budget["assigned"], 100000);
    assert_eq!(cat_budget["available"], 400000); // 300000 + 100000
}
