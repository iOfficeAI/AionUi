use aionui_db::{IAgentMetadataRepository, SqliteAgentMetadataRepository, init_database_memory};

#[tokio::test]
async fn verified_registry_npx_agents_use_stable_packages_and_conservative_team_policy() {
    let db = init_database_memory().await.unwrap();
    let repo = SqliteAgentMetadataRepository::new(db.pool().clone());

    let cases = [
        (
            "autohand",
            "autohand",
            r#"["-y","@autohandai/autohand-acp"]"#,
            None,
            None,
        ),
        (
            "deepagents",
            "deepagents",
            r#"["-y","deepagents-acp"]"#,
            Some(r#"[".deepagents/skills","skills"]"#),
            None,
        ),
        ("dimcode", "dim", r#"["-y","dimcode","acp"]"#, None, None),
        (
            "dirac",
            "dirac",
            r#"["-y","dirac-cli","--acp"]"#,
            Some(r#"[".dirac/skills"]"#),
            Some("yolo"),
        ),
        (
            "glm-acp-agent",
            "glm-acp-agent",
            r#"["-y","glm-acp-agent"]"#,
            None,
            Some("bypass_permissions"),
        ),
        (
            "grok",
            "grok",
            r#"["-y","@xai-official/grok","agent","stdio"]"#,
            None,
            None,
        ),
        ("kilo", "kilo", r#"["-y","@kilocode/cli","acp"]"#, None, None),
        (
            "nova",
            "nova",
            r#"["-y","@compass-ai/nova","acp"]"#,
            Some(r#"[".compass/skills"]"#),
            None,
        ),
        ("sigit", "sigit", r#"["-y","@smbcloud/sigit"]"#, None, None),
    ];

    for (backend, binary_name, args, skills, yolo_id) in cases {
        let row = repo.find_builtin_by_backend(backend).await.unwrap().unwrap();
        assert_eq!(row.description, None, "{backend} builtin description");
        assert_eq!(row.command.as_deref(), Some("npx"), "{backend} command");
        let expected_icon = format!("/api/assets/logos/acp-registry/{backend}.svg");
        assert_eq!(row.icon.as_deref(), Some(expected_icon.as_str()), "{backend} icon");
        assert_eq!(row.args.as_deref(), Some(args), "{backend} args");
        assert_eq!(row.native_skills_dirs.as_deref(), skills, "{backend} skills");
        assert_eq!(row.yolo_id.as_deref(), yolo_id, "{backend} yolo_id");
        let source: serde_json::Value = serde_json::from_str(row.agent_source_info.as_deref().unwrap()).unwrap();
        assert_eq!(source["binary_name"], binary_name, "{backend} binary_name");
        assert_eq!(source["bridge_binary"], "npx", "{backend} bridge_binary");
        let policy: serde_json::Value = serde_json::from_str(row.behavior_policy.as_deref().unwrap()).unwrap();
        if backend == "grok" {
            // Migration 037 enables Grok Build for Team; other registry agents
            // remain on the conservative hard-disable policy from 025.
            assert_eq!(policy["supports_team"], true, "{backend} team policy");
            assert!(
                policy.get("team_capable_override").is_none() || policy["team_capable_override"].is_null(),
                "{backend} must not hard-disable team: {policy}"
            );
        } else {
            assert_eq!(policy["team_capable_override"], false, "{backend} team policy");
        }
    }
}
