use std::borrow::Cow;
use std::path::Path;

use sqlx::migrate::Migrator;
use sqlx::sqlite::SqlitePoolOptions;

async fn run_migrations_through(pool: &sqlx::SqlitePool, max_version: i64) {
    let full = Migrator::new(Path::new("migrations")).await.unwrap();
    let migrations = full
        .migrations
        .iter()
        .filter(|migration| migration.version <= max_version)
        .cloned()
        .collect::<Vec<_>>();
    Migrator {
        migrations: Cow::Owned(migrations),
        ignore_missing: false,
        locking: true,
        no_tx: false,
    }
    .run(pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn migration_036_backfills_team_id_for_formal_team_leaders() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    run_migrations_through(&pool, 35).await;

    sqlx::query(
        "INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES ('user-1', 'user1', 'hash', 1, 1)",
    )
    .execute(&pool)
    .await
    .unwrap();

    // Formal team leader conversation: has teamId but is missing the sidebar
    // ownership marker team_id.
    sqlx::query(
        "INSERT INTO conversations (id, user_id, name, type, status, extra, created_at, updated_at)
         VALUES ('conv-formal-lead', 'user-1', 'Lead', 'single', 'pending',
                 '{\"teamId\":\"team-formal\",\"role\":\"lead\",\"backend\":\"acp\"}',
                 1, 1)",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO teams (
            id, user_id, name, workspace, workspace_mode, agents,
            lead_agent_id, agents_version, origin_conversation_id, created_at, updated_at
         ) VALUES (
            'team-formal', 'user-1', 'Formal Team', '', 'shared',
            '[{\"id\":\"lead-1\",\"name\":\"Lead\",\"role\":\"lead\",\"backend\":\"acp\",\"conversation_id\":\"conv-formal-lead\"}]',
            'lead-1', '1', NULL, 1, 1
         )",
    )
    .execute(&pool)
    .await
    .unwrap();

    run_migrations_through(&pool, 36).await;

    let row: (String,) = sqlx::query_as("SELECT extra FROM conversations WHERE id = 'conv-formal-lead'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let extra: serde_json::Value = serde_json::from_str(&row.0).unwrap();
    assert_eq!(
        extra["team_id"].as_str(),
        Some("team-formal"),
        "formal team leader conversation must receive team_id marker"
    );
}

#[tokio::test]
async fn migration_036_leaves_ad_hoc_origin_conversation_visible() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    run_migrations_through(&pool, 35).await;

    sqlx::query(
        "INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES ('user-1', 'user1', 'hash', 1, 1)",
    )
    .execute(&pool)
    .await
    .unwrap();

    // Ad-hoc team origin conversation: must keep teamId for session binding
    // but must NOT receive team_id so it stays in ordinary history.
    sqlx::query(
        "INSERT INTO conversations (id, user_id, name, type, status, extra, created_at, updated_at)
         VALUES ('conv-adhoc-origin', 'user-1', 'Origin', 'single', 'pending',
                 '{\"teamId\":\"team-adhoc\",\"role\":\"lead\",\"backend\":\"acp\"}',
                 1, 1)",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO teams (
            id, user_id, name, workspace, workspace_mode, agents,
            lead_agent_id, agents_version, origin_conversation_id, created_at, updated_at
         ) VALUES (
            'team-adhoc', 'user-1', 'Ad-hoc Team', '', 'shared',
            '[{\"id\":\"lead-1\",\"name\":\"Lead\",\"role\":\"lead\",\"backend\":\"acp\",\"conversation_id\":\"conv-adhoc-origin\"}]',
            'lead-1', '1', 'conv-adhoc-origin', 1, 1
         )",
    )
    .execute(&pool)
    .await
    .unwrap();

    run_migrations_through(&pool, 36).await;

    let row: (String,) = sqlx::query_as("SELECT extra FROM conversations WHERE id = 'conv-adhoc-origin'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let extra: serde_json::Value = serde_json::from_str(&row.0).unwrap();
    assert!(
        extra.get("team_id").is_none(),
        "ad-hoc team origin conversation must not receive team_id marker"
    );
    assert_eq!(
        extra["teamId"].as_str(),
        Some("team-adhoc"),
        "ad-hoc team origin conversation must keep teamId for session binding"
    );
}
