use aionui_db::{IAgentMetadataRepository, SqliteAgentMetadataRepository, init_database_memory};

#[tokio::test]
async fn verified_registry_binary_agents_store_stable_registry_identity() {
    let db = init_database_memory().await.unwrap();
    let repo = SqliteAgentMetadataRepository::new(db.pool().clone());
    let cases = [
        ("amp-acp", "amp-acp", r#"[]"#, Some("bypass")),
        ("cortex-code", "cortex", r#"["acp","serve"]"#, Some("bypass")),
        ("corust-agent", "corust-agent-acp", r#"[]"#, None),
        ("devin", "devin", r#"["acp"]"#, Some("bypass")),
        ("harn", "harn", r#"["serve","acp"]"#, None),
        ("junie", "junie", r#"["--acp=true"]"#, None),
        ("poolside", "pool", r#"["acp"]"#, None),
        ("stakpak", "stakpak", r#"["acp"]"#, None),
        ("vtcode", "vtcode", r#"["acp"]"#, None),
    ];
    for (backend, command, args, yolo_id) in cases {
        let row = repo.find_builtin_by_backend(backend).await.unwrap().unwrap();
        assert_eq!(row.description, None, "{backend} builtin description");
        let expected_icon = format!("/api/assets/logos/acp-registry/{backend}.svg");
        assert_eq!(row.icon.as_deref(), Some(expected_icon.as_str()), "{backend} icon");
        assert_eq!(row.command.as_deref(), Some(command), "{backend} command");
        assert_eq!(row.args.as_deref(), Some(args), "{backend} args");
        assert_eq!(row.yolo_id.as_deref(), yolo_id);
        let source: serde_json::Value = serde_json::from_str(row.agent_source_info.as_deref().unwrap()).unwrap();
        assert!(source.get("registry_id").is_none());
        assert!(source.get("distribution").is_none());
        assert!(source.get("version").is_none());
        let policy: serde_json::Value = serde_json::from_str(row.behavior_policy.as_deref().unwrap()).unwrap();
        assert_eq!(policy["team_capable_override"], false);
    }
}
