/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type Database from 'better-sqlite3';

/**
 * Initialize database schema with all tables and indexes
 */
export function initSchema(db: Database.Database): void {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  // Enable Write-Ahead Logging for better performance
  db.pragma('journal_mode = WAL');

  // Users table (账户系统)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      avatar_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  // Conversations table (会话表 - 存储TChatConversation)
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('gemini', 'acp', 'codex')),
      extra TEXT NOT NULL,
      model TEXT,
      status TEXT CHECK(status IN ('pending', 'running', 'finished')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type);
    CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
  `);

  // Messages table (消息表 - 存储TMessage)
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      msg_id TEXT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      position TEXT CHECK(position IN ('left', 'right', 'center', 'pop')),
      status TEXT CHECK(status IN ('finish', 'pending', 'error', 'work')),
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
    CREATE INDEX IF NOT EXISTS idx_messages_msg_id ON messages(msg_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
  `);

  // Images are stored in the filesystem and referenced via message.resultDisplay
  // No separate images table needed

  // Configs table (配置表 - key-value存储，用于数据库版本跟踪)
  db.exec(`
    CREATE TABLE IF NOT EXISTS configs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_configs_updated_at ON configs(updated_at);
  `);

  // Create default system user if not exists
  const defaultUserId = 'system_default_user';
  const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(defaultUserId);

  if (!existingUser) {
    const now = Date.now();
    db.prepare(
      `
      INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(defaultUserId, 'default', 'default@aionui.local', '', now, now);
    console.log('[Database] Default system user created');
  }

  console.log('[Database] Schema initialized successfully');
}

/**
 * Get database version for migration tracking
 */
export function getDatabaseVersion(db: Database.Database): number {
  try {
    const result = db.prepare("SELECT value FROM configs WHERE key = 'db_version'").get() as { value: string } | undefined;
    return result ? parseInt(result.value) : 0;
  } catch {
    return 0;
  }
}

/**
 * Set database version
 */
export function setDatabaseVersion(db: Database.Database, version: number): void {
  const now = Date.now();
  db.prepare(
    `
    INSERT OR REPLACE INTO configs (key, value, updated_at)
    VALUES ('db_version', ?, ?)
  `
  ).run(version.toString(), now);
}

/**
 * Current database schema version
 * Update this when adding new migrations in migrations.ts
 */
export const CURRENT_DB_VERSION = 5;
