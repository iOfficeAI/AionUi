use aionui_db::{IAgentMetadataRepository, SqliteAgentMetadataRepository, init_database_memory};
use serde_json::json;
use sqlx::migrate::Migrator;
use sqlx::sqlite::SqlitePoolOptions;
use std::borrow::Cow;
use std::path::Path;

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
async fn full_migrate_enables_grok_build_team_policy() {
    let db = init_database_memory().await.unwrap();
    let repo = SqliteAgentMetadataRepository::new(db.pool().clone());

    let grok = repo
        .find_builtin_by_backend("grok")
        .await
        .unwrap()
        .expect("seeded Grok Build row");

    let policy: serde_json::Value =
        serde_json::from_str(grok.behavior_policy.as_deref().expect("behavior_policy")).unwrap();

    assert_eq!(policy["supports_team"], true, "Grok Build must advertise team support");
    assert!(
        policy.get("team_capable_override").is_none()
            || policy["team_capable_override"].is_null(),
        "hard team_capable_override must be cleared so inference/supports_team can apply: {policy}"
    );
}

#[tokio::test]
async fn migration_037_backfills_existing_grok_override_false() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();

    // Apply through 025 which seeds Grok with team_capable_override:false.
    run_migrations_through(&pool, 25).await;

    let before: (String,) = sqlx::query_as(
        "SELECT behavior_policy FROM agent_metadata WHERE backend = 'grok' AND agent_source = 'builtin'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let before_policy: serde_json::Value = serde_json::from_str(&before.0).unwrap();
    assert_eq!(before_policy["team_capable_override"], false);
    assert_eq!(before_policy["supports_team"], false);

    // Run remaining migrations including 037.
    run_migrations_through(&pool, 37).await;

    let after: (String,) = sqlx::query_as(
        "SELECT behavior_policy FROM agent_metadata WHERE backend = 'grok' AND agent_source = 'builtin'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let after_policy: serde_json::Value = serde_json::from_str(&after.0).unwrap();
    assert_eq!(after_policy["supports_team"], true);
    assert!(
        after_policy.get("team_capable_override").is_none()
            || after_policy["team_capable_override"].is_null(),
        "override must be removed: {after_policy}"
    );

    // Other registry agents stay conservative.
    let kilo: (String,) = sqlx::query_as(
        "SELECT behavior_policy FROM agent_metadata WHERE backend = 'kilo' AND agent_source = 'builtin'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let kilo_policy: serde_json::Value = serde_json::from_str(&kilo.0).unwrap();
    assert_eq!(
        kilo_policy,
        json!({
            "supports_side_question": false,
            "supports_team": false,
            "team_capable_override": false
        })
    );
}
