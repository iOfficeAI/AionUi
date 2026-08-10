-- Migration 036: Backfill team_id marker for formal team leader conversations
--
-- Before the provisioning fix, formal Teams created a new leader conversation
-- with `teamId` (session binding) but omitted `team_id` (sidebar ownership
-- marker). As a result the leader conversation appeared in the ordinary
-- history list instead of being grouped/filtered under its Team.
--
-- This migration copies the owning team id into `conversations.extra.team_id`
-- for every formal-team leader conversation that is missing the marker.
-- Ad-hoc Team origin conversations (origin_conversation_id IS NOT NULL) are
-- intentionally left untouched so the original solo conversation stays visible.

UPDATE conversations
SET extra = json_set(extra, '$.team_id', t.team_id)
FROM (
    SELECT
        teams.id AS team_id,
        json_extract(agent.value, '$.conversation_id') AS conversation_id
    FROM teams
    JOIN json_each(teams.agents) AS agent
    WHERE teams.origin_conversation_id IS NULL
      AND json_extract(agent.value, '$.role') = 'lead'
) AS t
WHERE conversations.id = t.conversation_id
  AND (
      json_extract(conversations.extra, '$.team_id') IS NULL
      OR json_type(conversations.extra, '$.team_id') = 'null'
  );
