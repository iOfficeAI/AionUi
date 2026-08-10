-- Migration 035: Add team_presets table for persisted expert-team presets.
--
-- Presets are user-owned templates that describe an expert team roster,
-- including the leader, members, roles, and descriptive metadata.
-- The leader/members columns store JSON arrays validated in the service layer.

CREATE TABLE IF NOT EXISTS team_presets (
    id              TEXT    PRIMARY KEY NOT NULL,
    user_id         TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    icon            TEXT,
    category        TEXT,
    description     TEXT    NOT NULL,
    expertise_tags  TEXT    NOT NULL DEFAULT '[]',
    example_prompts TEXT    NOT NULL DEFAULT '[]',
    leader          TEXT    NOT NULL,
    members         TEXT    NOT NULL DEFAULT '[]',
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_presets_user_id
    ON team_presets(user_id);

CREATE INDEX IF NOT EXISTS idx_team_presets_user_updated_at
    ON team_presets(user_id, updated_at DESC);
