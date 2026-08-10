-- Migration 034: Add origin_conversation_id to teams for ad-hoc teams from conversations

ALTER TABLE teams ADD COLUMN origin_conversation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_origin_conversation_id
    ON teams(origin_conversation_id);

CREATE INDEX IF NOT EXISTS idx_teams_user_origin_conversation
    ON teams(user_id, origin_conversation_id);
