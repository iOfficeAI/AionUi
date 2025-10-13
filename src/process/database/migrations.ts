/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type Database from 'better-sqlite3';

/**
 * Migration script definition
 */
export interface IMigration {
  version: number; // Target version after this migration
  name: string; // Migration name for logging
  up: (db: Database.Database) => void; // Upgrade script
  down: (db: Database.Database) => void; // Downgrade script (for rollback)
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
    // Drop all tables
    db.exec(`
      DROP TABLE IF EXISTS mcp_servers;
      DROP TABLE IF EXISTS providers;
      DROP TABLE IF EXISTS images;
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS conversations;
      DROP TABLE IF EXISTS configs;
      DROP TABLE IF EXISTS users;
    `);
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
    db.exec(`
      -- Add composite index for conversation messages lookup
      CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc
        ON messages(conversation_id, created_at DESC);

      -- Add index for message search by type
      CREATE INDEX IF NOT EXISTS idx_messages_type_created
        ON messages(type, created_at DESC);

      -- Add index for user conversations lookup
      CREATE INDEX IF NOT EXISTS idx_conversations_user_type
        ON conversations(user_id, type);
    `);
    console.log('[Migration v2] Added performance indexes');
  },
  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_messages_conv_created_desc;
      DROP INDEX IF EXISTS idx_messages_type_created;
      DROP INDEX IF EXISTS idx_conversations_user_type;
    `);
    console.log('[Migration v2] Rolled back: Removed performance indexes');
  },
};

/**
 * Migration v2 -> v3: Add full-text search support
 * Architecture: Application-managed FTS index (no triggers)
 *
 * Design rationale:
 * - FTS5 table stores message_id and content copy
 * - No triggers (avoids "unsafe use of virtual table" errors)
 * - FTS index updated directly in insertMessage/updateMessage/deleteMessage methods
 * - Better performance, better control, no recursion issues
 */
const migration_v3: IMigration = {
  version: 3,
  name: 'Add full-text search (application-managed)',
  up: (db) => {
    db.exec(`
      -- Create FTS5 virtual table for message content search
      -- message_id: UNINDEXED (for reference only, not searchable)
      -- content: Full-text indexed
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        message_id UNINDEXED,
        content,
        tokenize = 'porter unicode61'
      );

      -- Create index on message_id for fast lookups when deleting/updating
      -- Note: FTS5 doesn't support traditional indexes, but we can use message_id for joins
    `);

    // Populate FTS table with existing messages
    const stmt = db.prepare('SELECT rowid, id, content FROM messages');
    const messages = stmt.all() as Array<{ rowid: number; id: string; content: string }>;

    const insertFts = db.prepare('INSERT INTO messages_fts(rowid, message_id, content) VALUES (?, ?, ?)');

    for (const msg of messages) {
      insertFts.run(msg.rowid, msg.id, msg.content);
    }

    console.log(`[Migration v3] Added full-text search (application-managed), indexed ${messages.length} messages`);
  },
  down: (db) => {
    db.exec(`
      DROP TABLE IF EXISTS messages_fts;
    `);
    console.log('[Migration v3] Rolled back: Removed full-text search');
  },
};

/**
 * Migration v3 -> v4: Add user preferences and settings
 * Example of adding new table
 */
const migration_v4: IMigration = {
  version: 4,
  name: 'Add user preferences',
  up: (db) => {
    db.exec(`
      -- Create user preferences table
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_preferences_user
        ON user_preferences(user_id);

      -- Add default preferences for existing users
      INSERT INTO user_preferences (user_id, key, value, updated_at)
      SELECT id, 'theme', '"auto"', strftime('%s', 'now') * 1000
      FROM users
      WHERE id NOT IN (SELECT user_id FROM user_preferences WHERE key = 'theme');

      INSERT INTO user_preferences (user_id, key, value, updated_at)
      SELECT id, 'language', '"en-US"', strftime('%s', 'now') * 1000
      FROM users
      WHERE id NOT IN (SELECT user_id FROM user_preferences WHERE key = 'language');
    `);
    console.log('[Migration v4] Added user preferences table');
  },
  down: (db) => {
    db.exec(`
      DROP TABLE IF EXISTS user_preferences;
    `);
    console.log('[Migration v4] Rolled back: Removed user preferences table');
  },
};

/**
 * All migrations in order
 */
export const ALL_MIGRATIONS: IMigration[] = [migration_v1, migration_v2, migration_v3, migration_v4];

/**
 * Get migrations needed to upgrade from one version to another
 */
export function getMigrationsToRun(fromVersion: number, toVersion: number): IMigration[] {
  return ALL_MIGRATIONS.filter((m) => m.version > fromVersion && m.version <= toVersion).sort((a, b) => a.version - b.version);
}

/**
 * Get migrations needed to downgrade from one version to another
 */
export function getMigrationsToRollback(fromVersion: number, toVersion: number): IMigration[] {
  return ALL_MIGRATIONS.filter((m) => m.version > toVersion && m.version <= fromVersion).sort((a, b) => b.version - a.version);
}

/**
 * Run migrations in a transaction
 */
export function runMigrations(db: Database.Database, fromVersion: number, toVersion: number): void {
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

  // Run all migrations in a single transaction
  const runAll = db.transaction(() => {
    for (const migration of migrations) {
      try {
        console.log(`[Migrations] Running migration v${migration.version}: ${migration.name}`);
        migration.up(db);

        // Record migration in history
        const now = Date.now();
        db.prepare(
          `
          INSERT OR REPLACE INTO configs (key, value, updated_at)
          VALUES (?, ?, ?)
        `
        ).run(`migration_v${migration.version}`, JSON.stringify({ version: migration.version, name: migration.name, timestamp: now }), now);

        console.log(`[Migrations] ✓ Migration v${migration.version} completed`);
      } catch (error) {
        console.error(`[Migrations] ✗ Migration v${migration.version} failed:`, error);
        throw error; // Transaction will rollback
      }
    }
  });

  try {
    runAll();
    console.log(`[Migrations] All migrations completed successfully`);
  } catch (error) {
    console.error('[Migrations] Migration failed, all changes rolled back:', error);
    throw error;
  }
}

/**
 * Rollback migrations (for testing/emergency use)
 * WARNING: This can cause data loss!
 */
export function rollbackMigrations(db: Database.Database, fromVersion: number, toVersion: number): void {
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

  // Run all rollbacks in a single transaction
  const rollbackAll = db.transaction(() => {
    for (const migration of migrations) {
      try {
        console.log(`[Migrations] Rolling back migration v${migration.version}: ${migration.name}`);
        migration.down(db);

        // Remove migration record
        db.prepare(`DELETE FROM configs WHERE key = ?`).run(`migration_v${migration.version}`);

        console.log(`[Migrations] ✓ Rollback v${migration.version} completed`);
      } catch (error) {
        console.error(`[Migrations] ✗ Rollback v${migration.version} failed:`, error);
        throw error; // Transaction will rollback
      }
    }
  });

  try {
    rollbackAll();
    console.log(`[Migrations] All rollbacks completed successfully`);
  } catch (error) {
    console.error('[Migrations] Rollback failed:', error);
    throw error;
  }
}

/**
 * Get migration history
 */
export function getMigrationHistory(db: Database.Database): Array<{ version: number; name: string; timestamp: number }> {
  const rows = db.prepare(`SELECT key, value FROM configs WHERE key LIKE 'migration_v%'`).all() as Array<{ key: string; value: string }>;

  return rows
    .map((row) => {
      try {
        const data = JSON.parse(row.value);
        return {
          version: data.version,
          name: data.name,
          timestamp: data.timestamp,
        };
      } catch {
        return null;
      }
    })
    .filter((item): item is { version: number; name: string; timestamp: number } => item !== null)
    .sort((a, b) => a.version - b.version);
}

/**
 * Check if a specific migration has been applied
 */
export function isMigrationApplied(db: Database.Database, version: number): boolean {
  const result = db.prepare(`SELECT value FROM configs WHERE key = ?`).get(`migration_v${version}`) as { value: string } | undefined;

  return !!result;
}
