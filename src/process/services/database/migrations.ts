/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ISqliteDriver } from './drivers/ISqliteDriver';

/**
 * Migration script definition
 */
export interface IMigration {
  version: number; // Target version after this migration
  name: string; // Migration name for logging
  up: (db: ISqliteDriver) => void; // Upgrade script
  down: (db: ISqliteDriver) => void; // Downgrade script (for rollback)
}

/**
 * Migration v0 -> v1: Initial schema
 * This is handled by initSchema() in schema.ts
 */
const migration_v1: IMigration = {
  version: 1,
  name: 'Initial schema',
  up: (_db) => {
    // Already handled by initSchema()
    console.log('[Migration v1] Initial schema created by initSchema()');
  },
  down: (db) => {
    // Drop all tables (only core tables now)
    db.exec('DROP TABLE IF EXISTS messages');
    db.exec('DROP TABLE IF EXISTS conversations');
    db.exec('DROP TABLE IF EXISTS users');
    console.log('[Migration v1] Rolled back: All tables dropped');
  },
};

/**
 * Migration v1 -> v2: Add indexes for better performance
 * Example of a schema change migration
 */
const migration_v2: IMigration = {
  version: 2,
  name: 'Add performance indexes',
  up: (db) => {
    // Add composite index for conversation messages lookup
    db.exec('CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc ON messages(conversation_id, created_at DESC)');
    // Add index for message search by type
    db.exec('CREATE INDEX IF NOT EXISTS idx_messages_type_created ON messages(type, created_at DESC)');
    // Add index for user conversations lookup
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_type ON conversations(user_id, type)');
    console.log('[Migration v2] Added performance indexes');
  },
  down: (db) => {
    db.exec('DROP INDEX IF EXISTS idx_messages_conv_created_desc');
    db.exec('DROP INDEX IF EXISTS idx_messages_type_created');
    db.exec('DROP INDEX IF EXISTS idx_conversations_user_type');
    console.log('[Migration v2] Rolled back: Removed performance indexes');
  },
};

/**
 * Migration v2 -> v3: Add full-text search support [REMOVED]
 *
 * Note: FTS functionality has been removed as it's not currently needed.
 * Will be re-implemented when search functionality is added to the UI.
 */
const migration_v3: IMigration = {
  version: 3,
  name: 'Add full-text search (skipped)',
  up: (_db) => {
    // FTS removed - will be re-added when search functionality is implemented
    console.log('[Migration v3] FTS support skipped (removed, will be added back later)');
  },
  down: (db) => {
    // Clean up FTS table if it exists from older versions
    db.exec('DROP TABLE IF EXISTS messages_fts');
    console.log('[Migration v3] Rolled back: Removed full-text search');
  },
};

/**
 * Migration v3 -> v4: Removed (user_preferences table no longer needed)
 */
const migration_v4: IMigration = {
  version: 4,
  name: 'Removed user_preferences table',
  up: (_db) => {
    // user_preferences table removed from schema
    console.log('[Migration v4] Skipped (user_preferences table removed)');
  },
  down: (_db) => {
    console.log('[Migration v4] Rolled back: No-op (user_preferences table removed)');
  },
};

/**
 * Migration v4 -> v5: Remove FTS table
 * Cleanup for FTS removal - ensures all databases have consistent schema
 */
const migration_v5: IMigration = {
  version: 5,
  name: 'Remove FTS table',
  up: (db) => {
    // Remove FTS table created by old v3 migration
    db.exec('DROP TABLE IF EXISTS messages_fts');
    console.log('[Migration v5] Removed FTS table (cleanup for FTS removal)');
  },
  down: (_db) => {
    // If rolling back, we don't recreate FTS table (it's deprecated)
    console.log('[Migration v5] Rolled back: FTS table remains removed (deprecated feature)');
  },
};

/**
 * Migration v5 -> v6: Add jwt_secret column to users table
 * Store JWT secret per user for better security and management
 */
const migration_v6: IMigration = {
  version: 6,
  name: 'Add jwt_secret to users table',
  up: (db) => {
    // Check if jwt_secret column already exists
    const tableInfo = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    const hasJwtSecret = tableInfo.some((col) => col.name === 'jwt_secret');

    if (!hasJwtSecret) {
      // Add jwt_secret column to users table
      db.exec('ALTER TABLE users ADD COLUMN jwt_secret TEXT');
      console.log('[Migration v6] Added jwt_secret column to users table');
    } else {
      console.log('[Migration v6] jwt_secret column already exists, skipping');
    }
  },
  down: (db) => {
    // SQLite doesn't support DROP COLUMN directly, need to recreate table
    db.exec(
      'CREATE TABLE users_backup AS SELECT id, username, email, password_hash, avatar_path, created_at, updated_at, last_login FROM users'
    );
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_backup RENAME TO users');
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    console.log('[Migration v6] Rolled back: Removed jwt_secret column from users table');
  },
};

/**
 * Migration v6 -> v7: Add Personal Assistant tables
 * Supports remote interaction through messaging platforms (Telegram, Slack, Discord)
 */
const migration_v7: IMigration = {
  version: 7,
  name: 'Add Personal Assistant tables',
  up: (db) => {
    // Assistant plugins configuration
    db.exec(`CREATE TABLE IF NOT EXISTS assistant_plugins (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('telegram', 'slack', 'discord')),
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        config TEXT NOT NULL,
        status TEXT CHECK(status IN ('created', 'initializing', 'ready', 'starting', 'running', 'stopping', 'stopped', 'error')),
        last_connected INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_type ON assistant_plugins(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_enabled ON assistant_plugins(enabled)');

    // Authorized users whitelist
    db.exec(`CREATE TABLE IF NOT EXISTS assistant_users (
        id TEXT PRIMARY KEY,
        platform_user_id TEXT NOT NULL,
        platform_type TEXT NOT NULL,
        display_name TEXT,
        authorized_at INTEGER NOT NULL,
        last_active INTEGER,
        session_id TEXT,
        UNIQUE(platform_user_id, platform_type)
      )`);
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_assistant_users_platform ON assistant_users(platform_type, platform_user_id)'
    );

    // User sessions
    db.exec(`CREATE TABLE IF NOT EXISTS assistant_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_type TEXT NOT NULL CHECK(agent_type IN ('gemini', 'acp', 'codex')),
        conversation_id TEXT,
        workspace TEXT,
        created_at INTEGER NOT NULL,
        last_activity INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES assistant_users(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
      )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_sessions_user ON assistant_sessions(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_sessions_conversation ON assistant_sessions(conversation_id)');

    // Pending pairing requests
    db.exec(`CREATE TABLE IF NOT EXISTS assistant_pairing_codes (
        code TEXT PRIMARY KEY,
        platform_user_id TEXT NOT NULL,
        platform_type TEXT NOT NULL,
        display_name TEXT,
        requested_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'expired'))
      )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_pairing_expires ON assistant_pairing_codes(expires_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_pairing_status ON assistant_pairing_codes(status)');

    console.log('[Migration v7] Added Personal Assistant tables');
  },
  down: (db) => {
    db.exec('DROP TABLE IF EXISTS assistant_pairing_codes');
    db.exec('DROP TABLE IF EXISTS assistant_sessions');
    db.exec('DROP TABLE IF EXISTS assistant_users');
    db.exec('DROP TABLE IF EXISTS assistant_plugins');
    console.log('[Migration v7] Rolled back: Removed Personal Assistant tables');
  },
};

/**
 * Migration v7 -> v8: Add source column to conversations table
 */
const migration_v8: IMigration = {
  version: 8,
  name: 'Add source column to conversations',
  up: (db) => {
    // Add source column to conversations table
    db.exec(`ALTER TABLE conversations ADD COLUMN source TEXT CHECK(source IN ('aionui', 'telegram'))`);

    // Create index for efficient source-based queries
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');

    console.log('[Migration v8] Added source column to conversations table');
  },
  down: (db) => {
    // SQLite doesn't support DROP COLUMN directly, need to recreate table
    // For simplicity, just drop the indexes (column will remain)
    db.exec('DROP INDEX IF EXISTS idx_conversations_source');
    db.exec('DROP INDEX IF EXISTS idx_conversations_source_updated');
    console.log('[Migration v8] Rolled back: Removed source indexes');
  },
};

/**
 * Migration v8 -> v9: Add cron_jobs table for scheduled tasks
 */
const migration_v9: IMigration = {
  version: 9,
  name: 'Add cron_jobs table',
  up: (db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS cron_jobs (
        -- Basic info
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,

        -- Schedule
        schedule_kind TEXT NOT NULL,       -- 'at' | 'every' | 'cron'
        schedule_value TEXT NOT NULL,      -- timestamp | ms | cron expr
        schedule_tz TEXT,                  -- timezone (optional)
        schedule_description TEXT NOT NULL, -- human-readable description

        -- Target
        payload_message TEXT NOT NULL,

        -- Metadata (for management)
        conversation_id TEXT NOT NULL,     -- Which conversation created this
        conversation_title TEXT,           -- For display in UI
        agent_type TEXT NOT NULL,          -- 'gemini' | 'claude' | 'codex' | etc.
        created_by TEXT NOT NULL,          -- 'user' | 'agent'
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

        -- Runtime state
        next_run_at INTEGER,
        last_run_at INTEGER,
        last_status TEXT,                  -- 'ok' | 'error' | 'skipped'
        last_error TEXT,                   -- Error message if failed
        run_count INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3
      )`);
    // Index for querying jobs by conversation (frontend management)
    db.exec('CREATE INDEX IF NOT EXISTS idx_cron_jobs_conversation ON cron_jobs(conversation_id)');
    // Index for scheduler to find next jobs to run
    db.exec('CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run ON cron_jobs(next_run_at) WHERE enabled = 1');
    // Index for querying by agent type (if needed)
    db.exec('CREATE INDEX IF NOT EXISTS idx_cron_jobs_agent_type ON cron_jobs(agent_type)');
    console.log('[Migration v9] Added cron_jobs table');
  },
  down: (db) => {
    db.exec('DROP INDEX IF EXISTS idx_cron_jobs_agent_type');
    db.exec('DROP INDEX IF EXISTS idx_cron_jobs_next_run');
    db.exec('DROP INDEX IF EXISTS idx_cron_jobs_conversation');
    db.exec('DROP TABLE IF EXISTS cron_jobs');
    console.log('[Migration v9] Rolled back: Removed cron_jobs table');
  },
};

/**
 * Migration v9 -> v10: Add 'lark' to assistant_plugins type constraint
 */
const migration_v10: IMigration = {
  version: 10,
  name: 'Add lark to assistant_plugins type constraint',
  up: (db) => {
    // SQLite doesn't support ALTER TABLE to modify CHECK constraints
    // We need to recreate the table with the new constraint
    db.exec(`CREATE TABLE IF NOT EXISTS assistant_plugins_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('telegram', 'slack', 'discord', 'lark')),
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        config TEXT NOT NULL,
        status TEXT CHECK(status IN ('created', 'initializing', 'ready', 'starting', 'running', 'stopping', 'stopped', 'error')),
        last_connected INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
    db.exec('INSERT OR IGNORE INTO assistant_plugins_new SELECT * FROM assistant_plugins');
    db.exec('DROP TABLE IF EXISTS assistant_plugins');
    db.exec('ALTER TABLE assistant_plugins_new RENAME TO assistant_plugins');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_type ON assistant_plugins(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_enabled ON assistant_plugins(enabled)');

    console.log('[Migration v10] Added lark to assistant_plugins type constraint');
  },
  down: (db) => {
    // Rollback: recreate table without lark type (data with lark type will be lost)
    db.exec(`CREATE TABLE IF NOT EXISTS assistant_plugins_old (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('telegram', 'slack', 'discord')),
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        config TEXT NOT NULL,
        status TEXT CHECK(status IN ('created', 'initializing', 'ready', 'starting', 'running', 'stopping', 'stopped', 'error')),
        last_connected INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
    db.exec(`INSERT OR IGNORE INTO assistant_plugins_old SELECT * FROM assistant_plugins WHERE type != 'lark'`);
    db.exec('DROP TABLE IF EXISTS assistant_plugins');
    db.exec('ALTER TABLE assistant_plugins_old RENAME TO assistant_plugins');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_type ON assistant_plugins(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_enabled ON assistant_plugins(enabled)');
    console.log('[Migration v10] Rolled back: Removed lark from assistant_plugins type constraint');
  },
};

/**
 * Migration v10 -> v11: Add 'openclaw-gateway' to conversations type constraint
 */
const migration_v11: IMigration = {
  version: 11,
  name: 'Add openclaw-gateway to conversations type constraint',
  up: (db) => {
    // SQLite doesn't support ALTER TABLE to modify CHECK constraints.
    // We recreate the table with the new constraint.
    // NOTE: The migration runner disables foreign_keys before the transaction,
    // so DROP TABLE will NOT trigger ON DELETE CASCADE on the messages table.

    // Clean up any invalid source values before copying
    db.exec(`UPDATE conversations SET source = NULL WHERE source IS NOT NULL AND source NOT IN ('aionui', 'telegram')`);

    db.exec(`CREATE TABLE IF NOT EXISTS conversations_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway')),
        extra TEXT NOT NULL,
        model TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'finished')),
        source TEXT CHECK(source IS NULL OR source IN ('aionui', 'telegram')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    db.exec(`INSERT INTO conversations_new (id, user_id, name, type, extra, model, status, source, created_at, updated_at)
      SELECT id, user_id, name, type, extra, model, status, source, created_at, updated_at FROM conversations`);
    db.exec('DROP TABLE conversations');
    db.exec('ALTER TABLE conversations_new RENAME TO conversations');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');

    console.log('[Migration v11] Added openclaw-gateway to conversations type constraint');
  },
  down: (db) => {
    // Rollback: recreate table without openclaw-gateway type
    // (data with openclaw-gateway type will be lost)
    // NOTE: foreign_keys is disabled by the migration runner before the transaction.
    db.exec(`CREATE TABLE IF NOT EXISTS conversations_rollback (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex')),
        extra TEXT NOT NULL,
        model TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'finished')),
        source TEXT CHECK(source IS NULL OR source IN ('aionui', 'telegram')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    db.exec(`INSERT INTO conversations_rollback (id, user_id, name, type, extra, model, status, source, created_at, updated_at)
      SELECT id, user_id, name, type, extra, model, status, source, created_at, updated_at FROM conversations WHERE type != 'openclaw-gateway'`);
    db.exec('DROP TABLE conversations');
    db.exec('ALTER TABLE conversations_rollback RENAME TO conversations');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');

    console.log('[Migration v11] Rolled back: Removed openclaw-gateway from conversations type constraint');
  },
};

/**
 * Migration v11 -> v12: Add 'lark' to conversations source CHECK constraint
 */
const migration_v12: IMigration = {
  version: 12,
  name: 'Add lark to conversations source constraint',
  up: (db) => {
    // SQLite doesn't support ALTER TABLE to modify CHECK constraints.
    // We recreate the table with the updated constraint that includes 'lark'.
    // NOTE: The migration runner disables foreign_keys before the transaction,
    // so DROP TABLE will NOT trigger ON DELETE CASCADE on the messages table.

    // Clean up any invalid source values before copying
    db.exec(
      `UPDATE conversations SET source = NULL WHERE source IS NOT NULL AND source NOT IN ('aionui', 'telegram', 'lark')`
    );

    db.exec(`CREATE TABLE IF NOT EXISTS conversations_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway')),
        extra TEXT NOT NULL,
        model TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'finished')),
        source TEXT CHECK(source IS NULL OR source IN ('aionui', 'telegram', 'lark')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    db.exec(`INSERT INTO conversations_new (id, user_id, name, type, extra, model, status, source, created_at, updated_at)
      SELECT id, user_id, name, type, extra, model, status, source, created_at, updated_at FROM conversations`);
    db.exec('DROP TABLE conversations');
    db.exec('ALTER TABLE conversations_new RENAME TO conversations');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');

    console.log('[Migration v12] Added lark to conversations source constraint');
  },
  down: (db) => {
    // Rollback: recreate table without 'lark' in source constraint
    // NOTE: foreign_keys is disabled by the migration runner before the transaction.

    // Clean up lark source values before copying to table with stricter constraint
    db.exec(`UPDATE conversations SET source = NULL WHERE source = 'lark'`);

    db.exec(`CREATE TABLE IF NOT EXISTS conversations_rollback (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway')),
        extra TEXT NOT NULL,
        model TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'finished')),
        source TEXT CHECK(source IS NULL OR source IN ('aionui', 'telegram')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    db.exec(`INSERT INTO conversations_rollback (id, user_id, name, type, extra, model, status, source, created_at, updated_at)
      SELECT id, user_id, name, type, extra, model, status, source, created_at, updated_at FROM conversations`);
    db.exec('DROP TABLE conversations');
    db.exec('ALTER TABLE conversations_rollback RENAME TO conversations');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');

    console.log('[Migration v12] Rolled back: Removed lark from conversations source constraint');
  },
};

/**
 * Migration v12 -> v13: Add 'nanobot' to conversations type CHECK constraint
 */
const migration_v13: IMigration = {
  version: 13,
  name: 'Add nanobot to conversations type constraint',
  up: (db) => {
    // SQLite doesn't support ALTER TABLE to modify CHECK constraints.
    // We recreate the table with the updated constraint that includes 'nanobot'.
    // NOTE: The migration runner disables foreign_keys before the transaction,
    // so DROP TABLE will NOT trigger ON DELETE CASCADE on the messages table.

    db.exec(`CREATE TABLE IF NOT EXISTS conversations_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway', 'nanobot')),
        extra TEXT NOT NULL,
        model TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'finished')),
        source TEXT CHECK(source IS NULL OR source IN ('aionui', 'telegram', 'lark')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    db.exec(`INSERT INTO conversations_new (id, user_id, name, type, extra, model, status, source, created_at, updated_at)
      SELECT id, user_id, name, type, extra, model, status, source, created_at, updated_at FROM conversations`);
    db.exec('DROP TABLE conversations');
    db.exec('ALTER TABLE conversations_new RENAME TO conversations');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');

    console.log('[Migration v13] Added nanobot to conversations type constraint');
  },
  down: (db) => {
    // Rollback: recreate table without 'nanobot' in type constraint
    // NOTE: foreign_keys is disabled by the migration runner before the transaction.

    // Remove nanobot conversations before copying to table with stricter constraint
    db.exec(`DELETE FROM conversations WHERE type = 'nanobot'`);

    db.exec(`CREATE TABLE IF NOT EXISTS conversations_rollback (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway')),
        extra TEXT NOT NULL,
        model TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'finished')),
        source TEXT CHECK(source IS NULL OR source IN ('aionui', 'telegram', 'lark')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    db.exec(`INSERT INTO conversations_rollback (id, user_id, name, type, extra, model, status, source, created_at, updated_at)
      SELECT id, user_id, name, type, extra, model, status, source, created_at, updated_at FROM conversations`);
    db.exec('DROP TABLE conversations');
    db.exec('ALTER TABLE conversations_rollback RENAME TO conversations');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');

    console.log('[Migration v13] Rolled back: Removed nanobot from conversations type constraint');
  },
};

/**
 * Migration v13 -> v14: Add 'dingtalk' to assistant_plugins type and conversations source CHECK constraints
 */
const migration_v14: IMigration = {
  version: 14,
  name: 'Add dingtalk to assistant_plugins type and conversations source constraints',
  up: (db) => {
    // 1. Recreate assistant_plugins with 'dingtalk' in type constraint
    db.exec(`CREATE TABLE IF NOT EXISTS assistant_plugins_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('telegram', 'slack', 'discord', 'lark', 'dingtalk')),
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        config TEXT NOT NULL,
        status TEXT CHECK(status IN ('created', 'initializing', 'ready', 'starting', 'running', 'stopping', 'stopped', 'error')),
        last_connected INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
    db.exec('INSERT OR IGNORE INTO assistant_plugins_new SELECT * FROM assistant_plugins');
    db.exec('DROP TABLE IF EXISTS assistant_plugins');
    db.exec('ALTER TABLE assistant_plugins_new RENAME TO assistant_plugins');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_type ON assistant_plugins(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_enabled ON assistant_plugins(enabled)');

    // 2. Recreate conversations with 'dingtalk' in source constraint
    // NOTE: The migration runner disables foreign_keys before the transaction,
    // so DROP TABLE will NOT trigger ON DELETE CASCADE on the messages table.
    db.exec(
      `UPDATE conversations SET source = NULL WHERE source IS NOT NULL AND source NOT IN ('aionui', 'telegram', 'lark', 'dingtalk')`
    );

    db.exec(`CREATE TABLE IF NOT EXISTS conversations_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway', 'nanobot')),
        extra TEXT NOT NULL,
        model TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'finished')),
        source TEXT CHECK(source IS NULL OR source IN ('aionui', 'telegram', 'lark', 'dingtalk')),
        channel_chat_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    db.exec(`INSERT INTO conversations_new (id, user_id, name, type, extra, model, status, source, channel_chat_id, created_at, updated_at)
      SELECT id, user_id, name, type, extra, model, status, source, NULL, created_at, updated_at FROM conversations`);
    db.exec('DROP TABLE conversations');
    db.exec('ALTER TABLE conversations_new RENAME TO conversations');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_conversations_source_chat ON conversations(source, channel_chat_id, updated_at DESC)'
    );

    // 3. Add chat_id to assistant_sessions for per-chat session isolation
    const sessTableInfo = db.prepare('PRAGMA table_info(assistant_sessions)').all() as Array<{ name: string }>;
    if (!sessTableInfo.some((col) => col.name === 'chat_id')) {
      db.exec('ALTER TABLE assistant_sessions ADD COLUMN chat_id TEXT');
    }

    console.log('[Migration v14] Added dingtalk support and channel_chat_id for per-chat isolation');
  },
  down: (db) => {
    // Rollback assistant_plugins: remove 'dingtalk'
    db.exec(`DELETE FROM assistant_plugins WHERE type = 'dingtalk'`);

    db.exec(`CREATE TABLE IF NOT EXISTS assistant_plugins_old (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('telegram', 'slack', 'discord', 'lark')),
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        config TEXT NOT NULL,
        status TEXT CHECK(status IN ('created', 'initializing', 'ready', 'starting', 'running', 'stopping', 'stopped', 'error')),
        last_connected INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
    db.exec(`INSERT OR IGNORE INTO assistant_plugins_old SELECT * FROM assistant_plugins WHERE type != 'dingtalk'`);
    db.exec('DROP TABLE IF EXISTS assistant_plugins');
    db.exec('ALTER TABLE assistant_plugins_old RENAME TO assistant_plugins');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_type ON assistant_plugins(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_enabled ON assistant_plugins(enabled)');

    // Rollback conversations: remove 'dingtalk' from source
    db.exec(`UPDATE conversations SET source = NULL WHERE source = 'dingtalk'`);

    db.exec(`CREATE TABLE IF NOT EXISTS conversations_rollback (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway', 'nanobot')),
        extra TEXT NOT NULL,
        model TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'finished')),
        source TEXT CHECK(source IS NULL OR source IN ('aionui', 'telegram', 'lark')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    db.exec(`INSERT INTO conversations_rollback (id, user_id, name, type, extra, model, status, source, created_at, updated_at)
      SELECT id, user_id, name, type, extra, model, status, source, created_at, updated_at FROM conversations`);
    db.exec('DROP TABLE conversations');
    db.exec('ALTER TABLE conversations_rollback RENAME TO conversations');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');

    console.log('[Migration v14] Rolled back: Removed dingtalk and channel_chat_id');
  },
};

/**
 * All migrations in order
 */
/**
 * Migration v14 -> v15: Remove strict CHECK constraints on type/source
 * to allow extension-contributed channel plugins.
 */
const migration_v15: IMigration = {
  version: 15,
  name: 'Remove strict constraints for extension channels',
  up: (db) => {
    // 1. Recreate assistant_plugins without strict type constraint
    db.exec(`CREATE TABLE IF NOT EXISTS assistant_plugins_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- Removed CHECK constraint
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        config TEXT NOT NULL,
        status TEXT CHECK(status IN ('created', 'initializing', 'ready', 'starting', 'running', 'stopping', 'stopped', 'error')),
        last_connected INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
    db.exec('INSERT OR IGNORE INTO assistant_plugins_new SELECT * FROM assistant_plugins');
    db.exec('DROP TABLE IF EXISTS assistant_plugins');
    db.exec('ALTER TABLE assistant_plugins_new RENAME TO assistant_plugins');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_type ON assistant_plugins(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assistant_plugins_enabled ON assistant_plugins(enabled)');

    // 2. Recreate conversations without strict source constraint
    db.exec(`CREATE TABLE IF NOT EXISTS conversations_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway', 'nanobot')),
        extra TEXT NOT NULL,
        model TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'finished')),
        source TEXT, -- Removed CHECK constraint
        channel_chat_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    db.exec(`INSERT INTO conversations_new (id, user_id, name, type, extra, model, status, source, channel_chat_id, created_at, updated_at)
      SELECT id, user_id, name, type, extra, model, status, source, channel_chat_id, created_at, updated_at FROM conversations`);
    db.exec('DROP TABLE conversations');
    db.exec('ALTER TABLE conversations_new RENAME TO conversations');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_conversations_source_chat ON conversations(source, channel_chat_id, updated_at DESC)'
    );

    console.log('[Migration v15] Removed strict constraints for extension channels');
  },
  down: (_db) => {
    // Cannot safely rollback if there are custom types/sources in the database.
    // For now, we just log a warning and do nothing, or we could delete them.
    console.warn('[Migration v15] Rollback skipped to prevent data loss of extension channels.');
  },
};

/**
 * Migration v15 -> v16: Add remote_agents table + 'remote' to conversations type
 */
const migration_v16: IMigration = {
  version: 16,
  name: 'Add remote_agents table and remote conversation type',
  up: (db) => {
    // 1. Create remote_agents table
    db.exec(`CREATE TABLE IF NOT EXISTS remote_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        protocol TEXT NOT NULL DEFAULT 'openclaw',
        url TEXT NOT NULL,
        auth_type TEXT NOT NULL DEFAULT 'bearer',
        auth_token TEXT,
        avatar TEXT,
        description TEXT,
        status TEXT DEFAULT 'unknown',
        last_connected_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_remote_agents_protocol ON remote_agents(protocol)');

    // 2. Recreate conversations with 'remote' added to type CHECK
    db.exec(`CREATE TABLE IF NOT EXISTS conversations_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway', 'nanobot', 'remote')),
        extra TEXT NOT NULL,
        model TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'finished')),
        source TEXT,
        channel_chat_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    db.exec(`INSERT INTO conversations_new (id, user_id, name, type, extra, model, status, source, channel_chat_id, created_at, updated_at)
      SELECT id, user_id, name, type, extra, model, status, source, channel_chat_id, created_at, updated_at FROM conversations`);
    db.exec('DROP TABLE conversations');
    db.exec('ALTER TABLE conversations_new RENAME TO conversations');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_conversations_source_chat ON conversations(source, channel_chat_id, updated_at DESC)'
    );

    console.log('[Migration v16] Added remote_agents table and remote conversation type');
  },
  down: (db) => {
    db.exec('DROP INDEX IF EXISTS idx_remote_agents_protocol');
    db.exec('DROP TABLE IF EXISTS remote_agents');
    console.log('[Migration v16] Rolled back: Removed remote_agents table');
  },
};

/**
 * Migration v16 -> v17: Add device identity columns to remote_agents
 */
const migration_v17: IMigration = {
  version: 17,
  name: 'Add device identity columns to remote_agents',
  up: (db) => {
    const columns = new Set((db.pragma('table_info(remote_agents)') as Array<{ name: string }>).map((c) => c.name));
    if (!columns.has('device_id')) {
      db.exec('ALTER TABLE remote_agents ADD COLUMN device_id TEXT');
    }
    if (!columns.has('device_public_key')) {
      db.exec('ALTER TABLE remote_agents ADD COLUMN device_public_key TEXT');
    }
    if (!columns.has('device_private_key')) {
      db.exec('ALTER TABLE remote_agents ADD COLUMN device_private_key TEXT');
    }
    if (!columns.has('device_token')) {
      db.exec('ALTER TABLE remote_agents ADD COLUMN device_token TEXT');
    }
    console.log('[Migration v17] Added device identity columns to remote_agents');
  },
  down: (_db) => {
    // SQLite does not support DROP COLUMN before 3.35.0; skip rollback to prevent data loss.
    console.warn('[Migration v17] Rollback skipped: cannot drop columns safely.');
  },
};

/**
 * Migration v17 -> v18: Add allow_insecure column to remote_agents
 */
const migration_v18: IMigration = {
  version: 18,
  name: 'Add allow_insecure column to remote_agents',
  up: (db) => {
    const columns = new Set((db.pragma('table_info(remote_agents)') as Array<{ name: string }>).map((c) => c.name));
    if (!columns.has('allow_insecure')) {
      db.exec('ALTER TABLE remote_agents ADD COLUMN allow_insecure INTEGER DEFAULT 0');
    }
    console.log('[Migration v18] Added allow_insecure column to remote_agents');
  },
  down: (_db) => {
    // SQLite does not support DROP COLUMN before 3.35.0; skip rollback to prevent data loss.
    console.warn('[Migration v18] Rollback skipped: cannot drop columns safely.');
  },
};

/**
 * Migration v18 -> v19: Add teams table for Team mode
 *
 * NOTE: This migration intentionally omits `lead_agent_id`. That column was
 * added in v20 via ALTER TABLE. Users who upgrade directly to v20+ get the
 * column via the v20 migration; the omission here is a known historical gap,
 * not a bug. Do NOT add `lead_agent_id` here — it would conflict with v20.
 */
const migration_v19: IMigration = {
  version: 19,
  name: 'Add teams table',
  up: (db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      workspace TEXT NOT NULL,
      workspace_mode TEXT NOT NULL DEFAULT 'shared',
      agents TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_teams_updated_at ON teams(updated_at)');
  },
  down: (db) => {
    db.exec('DROP INDEX IF EXISTS idx_teams_updated_at');
    db.exec('DROP INDEX IF EXISTS idx_teams_user_id');
    db.exec('DROP TABLE IF EXISTS teams');
  },
};

const migration_v20: IMigration = {
  version: 20,
  name: 'Add lead_agent_id to teams, create mailbox and team_tasks tables',
  up: (db) => {
    // Ensure teams table exists (v19 should have created it, but guard against
    // dev databases where v19 ran without the teams migration content)
    db.exec(`CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      workspace TEXT NOT NULL,
      workspace_mode TEXT NOT NULL DEFAULT 'shared',
      agents TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_teams_updated_at ON teams(updated_at)');

    // Add lead_agent_id column (ignore if already exists from a prior v19 run)
    try {
      db.exec(`ALTER TABLE teams ADD COLUMN lead_agent_id TEXT NOT NULL DEFAULT ''`);
    } catch {
      // Column already exists — safe to ignore
    }
    db.exec(`CREATE TABLE IF NOT EXISTS mailbox (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      to_agent_id TEXT NOT NULL,
      from_agent_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'message',
      content TEXT NOT NULL,
      summary TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_mailbox_to ON mailbox(team_id, to_agent_id, read)');
    db.exec(`CREATE TABLE IF NOT EXISTS team_tasks (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      owner TEXT,
      blocked_by TEXT NOT NULL DEFAULT '[]',
      blocks TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_team ON team_tasks(team_id, status)');
  },
  down: (db) => {
    // SQLite does not support DROP COLUMN; leave lead_agent_id in place
    db.exec('DROP INDEX IF EXISTS idx_tasks_team');
    db.exec('DROP TABLE IF EXISTS team_tasks');
    db.exec('DROP INDEX IF EXISTS idx_mailbox_to');
    db.exec('DROP TABLE IF EXISTS mailbox');
  },
};

/**
 * Migration v20 -> v21: Add 'aionrs' to conversations type CHECK constraint
 */
const migration_v21: IMigration = {
  version: 21,
  name: "Add 'aionrs' to conversations type CHECK",
  up: (db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS conversations_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway', 'nanobot', 'remote', 'aionrs')),
        extra TEXT NOT NULL,
        model TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'finished')),
        source TEXT,
        channel_chat_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    db.exec(`INSERT INTO conversations_new (id, user_id, name, type, extra, model, status, source, channel_chat_id, created_at, updated_at)
      SELECT id, user_id, name, type, extra, model, status, source, channel_chat_id, created_at, updated_at FROM conversations`);
    db.exec('DROP TABLE conversations');
    db.exec('ALTER TABLE conversations_new RENAME TO conversations');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_conversations_source_chat ON conversations(source, channel_chat_id, updated_at DESC)'
    );
    console.log("[Migration v21] Added 'aionrs' to conversations type CHECK");
  },
  down: (db) => {
    // Remove aionrs conversations before copying to table with stricter constraint
    db.exec(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE type = 'aionrs')`);
    db.exec(`DELETE FROM conversations WHERE type = 'aionrs'`);

    db.exec(`CREATE TABLE IF NOT EXISTS conversations_rollback (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway', 'nanobot', 'remote')),
        extra TEXT NOT NULL,
        model TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'finished')),
        source TEXT,
        channel_chat_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    db.exec(`INSERT INTO conversations_rollback (id, user_id, name, type, extra, model, status, source, channel_chat_id, created_at, updated_at)
      SELECT id, user_id, name, type, extra, model, status, source, channel_chat_id, created_at, updated_at FROM conversations`);
    db.exec('DROP TABLE conversations');
    db.exec('ALTER TABLE conversations_rollback RENAME TO conversations');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_conversations_source_chat ON conversations(source, channel_chat_id, updated_at DESC)'
    );

    console.log("[Migration v21] Rolled back: Removed 'aionrs' from conversations type CHECK");
  },
};

/**
 * Migration v21 -> v22: Remove CHECK constraint on conversations.type,
 * add cron job columns, hidden messages, and cronJobId index.
 *
 * The CHECK(type IN (...)) constraint forced a heavy table-rebuild migration
 * every time a new agent type was added (v10, v11, v14, v15, v16, v21 all did this).
 * By removing the constraint, new agent types only need TypeScript-level changes
 * (TChatConversation union + rowToConversation branch) — no database migration.
 */
const migration_v22: IMigration = {
  version: 22,
  name: 'Remove type CHECK, add cron columns, hidden messages',
  up: (db) => {
    // 1. Remove CHECK constraint on conversations.type
    db.exec(`CREATE TABLE IF NOT EXISTS conversations_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        extra TEXT NOT NULL,
        model TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'finished')),
        source TEXT,
        channel_chat_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    db.exec(`INSERT INTO conversations_new (id, user_id, name, type, extra, model, status, source, channel_chat_id, created_at, updated_at)
      SELECT id, user_id, name, type, extra, model, status, source, channel_chat_id, created_at, updated_at FROM conversations`);
    db.exec('DROP TABLE conversations');
    db.exec('ALTER TABLE conversations_new RENAME TO conversations');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC)');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_conversations_source_chat ON conversations(source, channel_chat_id, updated_at DESC)'
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_conversations_cron_job_id ON conversations(json_extract(extra, '$.cronJobId'))`
    );

    // 2. Add cron job columns (execution_mode, agent_config)
    const cronColumns = new Set((db.pragma('table_info(cron_jobs)') as Array<{ name: string }>).map((c) => c.name));
    if (!cronColumns.has('execution_mode')) {
      db.exec(`ALTER TABLE cron_jobs ADD COLUMN execution_mode TEXT DEFAULT 'existing'`);
    }
    if (!cronColumns.has('agent_config')) {
      db.exec(`ALTER TABLE cron_jobs ADD COLUMN agent_config TEXT`);
    }
    // Fix legacy jobs: empty conversation_id means they were created before execution_mode existed
    db.exec(
      `UPDATE cron_jobs SET execution_mode = 'new_conversation' WHERE conversation_id = '' OR conversation_id IS NULL`
    );

    // 3. Add hidden column to messages
    const msgColumns = new Set((db.pragma('table_info(messages)') as Array<{ name: string }>).map((c) => c.name));
    if (!msgColumns.has('hidden')) {
      db.exec(`ALTER TABLE messages ADD COLUMN hidden INTEGER DEFAULT 0`);
    }

    console.log('[Migration v22] Removed type CHECK, added cron columns, hidden messages');
  },
  down: (_db) => {
    // Cannot safely rollback — re-adding CHECK would reject unknown types already in the table.
    console.warn('[Migration v22] Rollback skipped: re-adding CHECK constraint could reject existing data.');
  },
};

/**
 * All migrations in order
 */
// prettier-ignore
export const ALL_MIGRATIONS: IMigration[] = [
  migration_v1, migration_v2, migration_v3, migration_v4, migration_v5, migration_v6,
  migration_v7, migration_v8, migration_v9, migration_v10, migration_v11, migration_v12,
  migration_v13, migration_v14, migration_v15, migration_v16, migration_v17, migration_v18,
  migration_v19, migration_v20, migration_v21, migration_v22,
];

/**
 * Get migrations needed to upgrade from one version to another
 */
export function getMigrationsToRun(fromVersion: number, toVersion: number): IMigration[] {
  return ALL_MIGRATIONS.filter((m) => m.version > fromVersion && m.version <= toVersion).toSorted(
    (a, b) => a.version - b.version
  );
}

/**
 * Get migrations needed to downgrade from one version to another
 */
export function getMigrationsToRollback(fromVersion: number, toVersion: number): IMigration[] {
  return ALL_MIGRATIONS.filter((m) => m.version > toVersion && m.version <= fromVersion).toSorted(
    (a, b) => b.version - a.version
  );
}

/**
 * Run migrations in a transaction
 */
export function runMigrations(db: ISqliteDriver, fromVersion: number, toVersion: number): void {
  if (fromVersion === toVersion) {
    console.log('[Migrations] Already at target version');
    return;
  }

  if (fromVersion > toVersion) {
    throw new Error(`[Migrations] Downgrade not supported in production. Use rollbackMigration() for testing only.`);
  }

  const migrations = getMigrationsToRun(fromVersion, toVersion);

  if (migrations.length === 0) {
    console.log(`[Migrations] No migrations needed from v${fromVersion} to v${toVersion}`);
    return;
  }

  console.log(`[Migrations] Running ${migrations.length} migrations from v${fromVersion} to v${toVersion}`);

  // Disable foreign keys BEFORE the transaction to allow table recreation
  // (DROP TABLE + CREATE TABLE). PRAGMA foreign_keys cannot be changed inside
  // a transaction — it is silently ignored.
  // See: https://www.sqlite.org/lang_altertable.html#otheralter
  db.pragma('foreign_keys = OFF');

  // Run all migrations in a single transaction
  const runAll = db.transaction(() => {
    for (const migration of migrations) {
      try {
        console.log(`[Migrations] Running migration v${migration.version}: ${migration.name}`);
        migration.up(db);

        console.log(`[Migrations] ✓ Migration v${migration.version} completed`);
      } catch (error) {
        console.error(`[Migrations] ✗ Migration v${migration.version} failed:`, error);
        throw error; // Transaction will rollback
      }
    }

    // Verify foreign key integrity after all migrations
    const fkViolations = db.pragma('foreign_key_check') as unknown[];
    if (fkViolations.length > 0) {
      console.error('[Migrations] Foreign key violations detected:', fkViolations);
      throw new Error(`[Migrations] Foreign key check failed: ${fkViolations.length} violation(s)`);
    }
  });

  try {
    runAll();
    console.log(`[Migrations] All migrations completed successfully`);
  } catch (error) {
    console.error('[Migrations] Migration failed, all changes rolled back:', error);
    throw error;
  } finally {
    // Re-enable foreign keys regardless of success or failure
    db.pragma('foreign_keys = ON');
  }
}

/**
 * Rollback migrations (for testing/emergency use)
 * WARNING: This can cause data loss!
 */
export function rollbackMigrations(db: ISqliteDriver, fromVersion: number, toVersion: number): void {
  if (fromVersion <= toVersion) {
    throw new Error('[Migrations] Cannot rollback to a higher or equal version');
  }

  const migrations = getMigrationsToRollback(fromVersion, toVersion);

  if (migrations.length === 0) {
    console.log(`[Migrations] No rollback needed from v${fromVersion} to v${toVersion}`);
    return;
  }

  console.log(`[Migrations] Rolling back ${migrations.length} migrations from v${fromVersion} to v${toVersion}`);
  console.warn('[Migrations] WARNING: This may cause data loss!');

  // Disable foreign keys BEFORE the transaction (same reason as runMigrations)
  db.pragma('foreign_keys = OFF');

  // Run all rollbacks in a single transaction
  const rollbackAll = db.transaction(() => {
    for (const migration of migrations) {
      try {
        console.log(`[Migrations] Rolling back migration v${migration.version}: ${migration.name}`);
        migration.down(db);

        console.log(`[Migrations] ✓ Rollback v${migration.version} completed`);
      } catch (error) {
        console.error(`[Migrations] ✗ Rollback v${migration.version} failed:`, error);
        throw error; // Transaction will rollback
      }
    }

    // Verify foreign key integrity after rollback
    const fkViolations = db.pragma('foreign_key_check') as unknown[];
    if (fkViolations.length > 0) {
      console.error('[Migrations] Foreign key violations detected after rollback:', fkViolations);
      throw new Error(`[Migrations] Foreign key check failed: ${fkViolations.length} violation(s)`);
    }
  });

  try {
    rollbackAll();
    console.log(`[Migrations] All rollbacks completed successfully`);
  } catch (error) {
    console.error('[Migrations] Rollback failed:', error);
    throw error;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

/**
 * Get migration history
 * Now simplified - just returns the current version
 */
export function getMigrationHistory(db: ISqliteDriver): Array<{ version: number; name: string; timestamp: number }> {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  // Return a simple array with just the current version
  return [
    {
      version: currentVersion,
      name: `Current schema version`,
      timestamp: Date.now(),
    },
  ];
}

/**
 * Check if a specific migration has been applied
 * Now simplified - checks if current version >= target version
 */
export function isMigrationApplied(db: ISqliteDriver, version: number): boolean {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  return currentVersion >= version;
}
