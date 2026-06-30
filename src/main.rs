use twenty_dollar::{app, db};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("twenty_dollar=debug,tower_http=debug")
        .init();

    let db_path = std::env::var("DATABASE_PATH")
        .unwrap_or_else(|_| "twenty_dollar.db".to_string());

    let pool = db::init_pool(&db_path).expect("Failed to create database pool");

    {
        let conn = pool.get().expect("Failed to get connection");
        db::schema::run_migrations(&conn).expect("Failed to run migrations");
    }

    let router = app::build_router(pool);

    let addr = "0.0.0.0:3001";
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, router).await.unwrap();
}
