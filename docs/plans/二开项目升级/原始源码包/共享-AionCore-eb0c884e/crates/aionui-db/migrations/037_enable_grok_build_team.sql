-- Migration 037: Enable Team mode for builtin Grok Build.
--
-- Migration 025 seeded registry ACP agents with a conservative
-- `team_capable_override: false` policy. Grok Build actually supports Team
-- (ACP MCP via nested agentCapabilities.mcpCapabilities, plus CLI fallback),
-- but the hard override short-circuits capability inference and forces
-- `team_capable = false` → assistants stay non-selectable for Team.
--
-- Drop the hard override and mark supports_team so projection yields
-- team_selectable once the agent is online/unchecked.

UPDATE agent_metadata
SET behavior_policy = json_remove(
        json_set(
            COALESCE(behavior_policy, '{}'),
            '$.supports_team',
            json('true')
        ),
        '$.team_capable_override'
    ),
    updated_at = unixepoch('now', 'subsec') * 1000
WHERE agent_source = 'builtin'
  AND agent_type = 'acp'
  AND backend = 'grok';
