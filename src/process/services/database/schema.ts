/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ISqliteDriver } from './drivers/ISqliteDriver';

/**
 * Initialize database schema with all tables and indexes
 */
export function initSchema(db: ISqliteDriver): void {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  // Wait up to 5 seconds when the database is locked by another connection
  // instead of failing immediately (prevents "database is locked" errors
  // when multiple processes or startup tasks access the database concurrently)
  db.pragma('busy_timeout = 5000');
  // Enable Write-Ahead Logging for better performance
  try {
    db.pragma('journal_mode = WAL');
  } catch (error) {
    console.warn('[Database] Failed to enable WAL mode, using default journal mode:', error);
    // Continue with default journal mode if WAL fails
  }

  // Users table (账户系统)
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_path TEXT,
    jwt_secret TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login INTEGER
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');

  // Conversations table (会话表 - 存储TChatConversation)
  db.exec(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex', 'openclaw-gateway', 'nanobot', 'remote', 'aionrs')),
    extra TEXT NOT NULL,
    model TEXT,
    status TEXT CHECK(status IN ('pending', 'running', 'finished')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');

  // Messages table (消息表 - 存储TMessage)
  db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    msg_id TEXT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    position TEXT CHECK(position IN ('left', 'right', 'center', 'pop')),
    status TEXT CHECK(status IN ('finish', 'pending', 'error', 'work')),
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_msg_id ON messages(msg_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at)');

  // Teams table (团队模式)
  db.exec(`CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    workspace TEXT NOT NULL,
    workspace_mode TEXT NOT NULL DEFAULT 'shared',
    lead_agent_id TEXT NOT NULL DEFAULT '',
    agents TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_teams_updated_at ON teams(updated_at)');

  // Mailbox table (团队消息邮箱)
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

  // Team tasks table (团队任务)
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

  console.log('[Database] Schema initialized successfully');
}

/**
 * Get database version for migration tracking
 * Uses SQLite's built-in user_version pragma
 */
export function getDatabaseVersion(db: ISqliteDriver): number {
  try {
    const result = db.pragma('user_version', { simple: true }) as number;
    return result;
  } catch {
    return 0;
  }
}

/**
 * Set database version
 * Uses SQLite's built-in user_version pragma
 */
export function setDatabaseVersion(db: ISqliteDriver, version: number): void {
  db.pragma(`user_version = ${version}`);
}

/**
 * Current database schema version
 * Update this when adding new migrations in migrations.ts
 */
export const CURRENT_DB_VERSION = 21;
