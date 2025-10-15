/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import Database from 'better-sqlite3';
import path from 'path';
import { getConfigPath } from '../utils';
import { initSchema, getDatabaseVersion, setDatabaseVersion, CURRENT_DB_VERSION } from './schema';
import { runMigrations as executeMigrations, getMigrationHistory, isMigrationApplied } from './migrations';
import type { IUser, IQueryResult, IPaginatedResult, TChatConversation, TMessage, IConversationRow, IMessageRow, IConfigRow } from './types';
import { conversationToRow, rowToConversation, messageToRow, rowToMessage } from './types';

/**
 * Main database class for AionUi
 * Uses better-sqlite3 for fast, synchronous SQLite operations
 */
export class AionUIDatabase {
  private db: Database.Database;
  private defaultUserId = 'system_default_user';

  constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(getConfigPath(), 'aionui.db');
    this.db = new Database(finalPath);
    this.initialize();
  }

  private initialize(): void {
    try {
      initSchema(this.db);

      // Check and run migrations if needed
      const currentVersion = getDatabaseVersion(this.db);
      if (currentVersion < CURRENT_DB_VERSION) {
        this.runMigrations(currentVersion, CURRENT_DB_VERSION);
        setDatabaseVersion(this.db, CURRENT_DB_VERSION);
      }
    } catch (error) {
      console.error('[Database] Initialization failed:', error);
      throw error;
    }
  }

  private runMigrations(from: number, to: number): void {
    executeMigrations(this.db, from, to);
  }

  /**
   * Get migration history
   */
  getMigrationHistory(): Array<{
    version: number;
    name: string;
    timestamp: number;
  }> {
    return getMigrationHistory(this.db);
  }

  /**
   * Check if a specific migration has been applied
   */
  isMigrationApplied(version: number): boolean {
    return isMigrationApplied(this.db, version);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * ==================
   * User operations
   * ==================
   */

  createUser(username: string, email: string | undefined, passwordHash: string): IQueryResult<IUser> {
    try {
      const userId = `user_${Date.now()}`;
      const now = Date.now();

      const stmt = this.db.prepare(`
        INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(userId, username, email, passwordHash, now, now);

      return {
        success: true,
        data: {
          id: userId,
          username,
          email,
          password_hash: passwordHash,
          created_at: now,
          updated_at: now,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getUser(userId: string): IQueryResult<IUser> {
    try {
      const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as IUser | undefined;

      if (!user) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      return {
        success: true,
        data: user,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getDefaultUserId(): string {
    return this.defaultUserId;
  }

  /**
   * ==================
   * Conversation operations
   * ==================
   */

  createConversation(conversation: TChatConversation, userId?: string): IQueryResult<TChatConversation> {
    try {
      const row = conversationToRow(conversation, userId || this.defaultUserId);

      const stmt = this.db.prepare(`
        INSERT INTO conversations (id, user_id, name, type, extra, model, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(row.id, row.user_id, row.name, row.type, row.extra, row.model, row.status, row.created_at, row.updated_at);

      return {
        success: true,
        data: conversation,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getConversation(conversationId: string): IQueryResult<TChatConversation> {
    try {
      const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as IConversationRow | undefined;

      if (!row) {
        return {
          success: false,
          error: 'Conversation not found',
        };
      }

      return {
        success: true,
        data: rowToConversation(row),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getUserConversations(userId?: string, page = 0, pageSize = 50): IPaginatedResult<TChatConversation> {
    try {
      const finalUserId = userId || this.defaultUserId;

      const countResult = this.db.prepare('SELECT COUNT(*) as count FROM conversations WHERE user_id = ?').get(finalUserId) as {
        count: number;
      };

      const rows = this.db
        .prepare(
          `
            SELECT *
            FROM conversations
            WHERE user_id = ?
            ORDER BY updated_at DESC LIMIT ?
            OFFSET ?
          `
        )
        .all(finalUserId, pageSize, page * pageSize) as IConversationRow[];

      return {
        data: rows.map(rowToConversation),
        total: countResult.count,
        page,
        pageSize,
        hasMore: (page + 1) * pageSize < countResult.count,
      };
    } catch (error: any) {
      console.error('[Database] Get conversations error:', error);
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
      };
    }
  }

  updateConversation(conversationId: string, updates: Partial<TChatConversation>): IQueryResult<boolean> {
    try {
      const existing = this.getConversation(conversationId);
      if (!existing.success || !existing.data) {
        return {
          success: false,
          error: 'Conversation not found',
        };
      }

      const updated = {
        ...existing.data,
        ...updates,
        modifyTime: Date.now(),
      } as TChatConversation;
      const row = conversationToRow(updated, this.defaultUserId);

      const stmt = this.db.prepare(`
        UPDATE conversations
        SET name       = ?,
            extra      = ?,
            model      = ?,
            status     = ?,
            updated_at = ?
        WHERE id = ?
      `);

      stmt.run(row.name, row.extra, row.model, row.status, row.updated_at, conversationId);

      return {
        success: true,
        data: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  deleteConversation(conversationId: string): IQueryResult<boolean> {
    try {
      const stmt = this.db.prepare('DELETE FROM conversations WHERE id = ?');
      const result = stmt.run(conversationId);

      return {
        success: true,
        data: result.changes > 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * ==================
   * Message operations
   * ==================
   */

  insertMessage(message: TMessage): IQueryResult<TMessage> {
    try {
      const row = messageToRow(message);

      // Insert into main table
      const stmt = this.db.prepare(`
        INSERT INTO messages (id, conversation_id, msg_id, type, content, position, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(row.id, row.conversation_id, row.msg_id, row.type, row.content, row.position, row.status, row.created_at);

      // Sync FTS index (application-managed, no triggers)
      try {
        const ftsStmt = this.db.prepare(`
          INSERT INTO messages_fts(rowid, message_id, content)
          VALUES (?, ?, ?)
        `);
        ftsStmt.run(result.lastInsertRowid, row.id, row.content);
      } catch (ftsError) {
        // FTS update failed, but main insert succeeded - log and continue
        console.warn('[Database] FTS index update failed for message insert:', ftsError);
      }

      return {
        success: true,
        data: message,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  insertMessages(messages: TMessage[]): IQueryResult<number> {
    try {
      const insert = this.db.prepare(`
        INSERT INTO messages (id, conversation_id, msg_id, type, content, position, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = this.db.transaction((messages: TMessage[]) => {
        for (const message of messages) {
          const row = messageToRow(message);
          insert.run(row.id, row.conversation_id, row.msg_id, row.type, row.content, row.position, row.status, row.created_at);
        }
      });

      insertMany(messages);

      return {
        success: true,
        data: messages.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getConversationMessages(conversationId: string, page = 0, pageSize = 100): IPaginatedResult<TMessage> {
    try {
      const countResult = this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?').get(conversationId) as {
        count: number;
      };

      const rows = this.db
        .prepare(
          `
            SELECT *
            FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC LIMIT ?
            OFFSET ?
          `
        )
        .all(conversationId, pageSize, page * pageSize) as IMessageRow[];

      return {
        data: rows.map(rowToMessage),
        total: countResult.count,
        page,
        pageSize,
        hasMore: (page + 1) * pageSize < countResult.count,
      };
    } catch (error: any) {
      console.error('[Database] Get messages error:', error);
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
      };
    }
  }

  /**
   * Update a message in the database
   * @param messageId - Message ID to update
   * @param message - Updated message data
   * @param options - Update options
   *   - skipFtsUpdate: Skip FTS index update (useful for streaming messages)
   */
  updateMessage(messageId: string, message: TMessage, options?: { skipFtsUpdate?: boolean }): IQueryResult<boolean> {
    try {
      const row = messageToRow(message);
      const skipFts = options?.skipFtsUpdate ?? false;

      // Get rowid first for FTS update (only if needed)
      let rowidRow: { rowid: number } | undefined;
      if (!skipFts) {
        const getRowid = this.db.prepare('SELECT rowid FROM messages WHERE id = ?');
        rowidRow = getRowid.get(messageId) as { rowid: number } | undefined;
      }

      // Update main table
      const stmt = this.db.prepare(`
        UPDATE messages
        SET type     = ?,
            content  = ?,
            position = ?,
            status   = ?
        WHERE id = ?
      `);

      const result = stmt.run(row.type, row.content, row.position, row.status, messageId);

      // Sync FTS index (application-managed, no triggers)
      // Skip for streaming messages to improve performance
      if (!skipFts && rowidRow && result.changes > 0) {
        try {
          // FTS5 doesn't support UPDATE, use DELETE + INSERT
          const ftsDelete = this.db.prepare('DELETE FROM messages_fts WHERE rowid = ?');
          ftsDelete.run(rowidRow.rowid);

          const ftsInsert = this.db.prepare(`
            INSERT INTO messages_fts(rowid, message_id, content)
            VALUES (?, ?, ?)
          `);
          ftsInsert.run(rowidRow.rowid, messageId, row.content);
        } catch (ftsError) {
          // FTS update failed, but main update succeeded - log and continue
          console.warn('[Database] FTS index update failed for message update:', ftsError);
        }
      }

      return {
        success: true,
        data: result.changes > 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update FTS index for a specific message
   * Used to sync FTS after streaming is complete
   */
  updateMessageFtsIndex(messageId: string): IQueryResult<boolean> {
    try {
      // Get message data
      const getMessage = this.db.prepare('SELECT rowid, content FROM messages WHERE id = ?');
      const msgRow = getMessage.get(messageId) as { rowid: number; content: string } | undefined;

      if (!msgRow) {
        return { success: false, error: 'Message not found' };
      }

      // Update FTS index
      const ftsDelete = this.db.prepare('DELETE FROM messages_fts WHERE rowid = ?');
      ftsDelete.run(msgRow.rowid);

      const ftsInsert = this.db.prepare(`
        INSERT INTO messages_fts(rowid, message_id, content)
        VALUES (?, ?, ?)
      `);
      ftsInsert.run(msgRow.rowid, messageId, msgRow.content);

      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  deleteMessage(messageId: string): IQueryResult<boolean> {
    try {
      // Get rowid first for FTS deletion
      const getRowid = this.db.prepare('SELECT rowid FROM messages WHERE id = ?');
      const rowidRow = getRowid.get(messageId) as { rowid: number } | undefined;

      // Delete from main table
      const stmt = this.db.prepare('DELETE FROM messages WHERE id = ?');
      const result = stmt.run(messageId);

      // Sync FTS index (application-managed, no triggers)
      if (rowidRow && result.changes > 0) {
        try {
          const ftsDelete = this.db.prepare('DELETE FROM messages_fts WHERE rowid = ?');
          ftsDelete.run(rowidRow.rowid);
        } catch (ftsError) {
          // FTS delete failed, but main delete succeeded - log and continue
          console.warn('[Database] FTS index update failed for message delete:', ftsError);
        }
      }

      return {
        success: true,
        data: result.changes > 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  deleteConversationMessages(conversationId: string): IQueryResult<number> {
    try {
      // Get all rowids for FTS deletion
      const getRowids = this.db.prepare('SELECT rowid FROM messages WHERE conversation_id = ?');
      const rows = getRowids.all(conversationId) as Array<{ rowid: number }>;

      // Delete from main table
      const stmt = this.db.prepare('DELETE FROM messages WHERE conversation_id = ?');
      const result = stmt.run(conversationId);

      // Sync FTS index (application-managed, no triggers)
      if (rows.length > 0 && result.changes > 0) {
        try {
          const ftsDelete = this.db.prepare('DELETE FROM messages_fts WHERE rowid = ?');
          for (const row of rows) {
            ftsDelete.run(row.rowid);
          }
        } catch (ftsError) {
          // FTS delete failed, but main delete succeeded - log and continue
          console.warn('[Database] FTS index update failed for conversation messages delete:', ftsError);
        }
      }

      return {
        success: true,
        data: result.changes,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get message by msg_id and conversation_id
   * Used for finding existing messages to update (e.g., streaming text accumulation)
   */
  getMessageByMsgId(conversationId: string, msgId: string): IQueryResult<TMessage | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT *
        FROM messages
        WHERE conversation_id = ?
          AND msg_id = ?
        ORDER BY created_at DESC LIMIT 1
      `);

      const row = stmt.get(conversationId, msgId) as IMessageRow | undefined;

      return {
        success: true,
        data: row ? rowToMessage(row) : null,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Search messages using full-text search
   * @param query - Search query (supports FTS5 syntax)
   * @param conversationId - Optional: Limit search to specific conversation
   * @param limit - Maximum number of results (default: 50)
   * @returns Array of matching messages with search rank
   */
  searchMessages(query: string, conversationId?: string, limit = 50): IQueryResult<TMessage[]> {
    try {
      let sql = `
        SELECT m.*, fts.rank
        FROM messages_fts fts
               JOIN messages m ON m.rowid = fts.rowid
        WHERE messages_fts MATCH ?
      `;

      const params: any[] = [query];

      if (conversationId) {
        sql += ' AND m.conversation_id = ?';
        params.push(conversationId);
      }

      sql += ' ORDER BY fts.rank LIMIT ?';
      params.push(limit);

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as IMessageRow[];

      return {
        success: true,
        data: rows.map((row) => rowToMessage(row)),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Rebuild FTS index from scratch
   * Useful for data recovery or after manual database changes
   */
  rebuildFtsIndex(): IQueryResult<number> {
    try {
      // Clear existing FTS data
      this.db.prepare('DELETE FROM messages_fts').run();

      // Rebuild from messages table
      const messages = this.db.prepare('SELECT rowid, id, content FROM messages').all() as Array<{
        rowid: number;
        id: string;
        content: string;
      }>;

      const insertFts = this.db.prepare('INSERT INTO messages_fts(rowid, message_id, content) VALUES (?, ?, ?)');

      for (const msg of messages) {
        insertFts.run(msg.rowid, msg.id, msg.content);
      }
      return {
        success: true,
        data: messages.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Batch update FTS index for a conversation
   * Used to sync FTS after streaming messages are complete
   * @param conversationId - Optional: sync specific conversation, or all if omitted
   */
  syncConversationFts(conversationId?: string): IQueryResult<number> {
    try {
      let sql = 'SELECT rowid, id, content FROM messages';
      const params: any[] = [];

      if (conversationId) {
        sql += ' WHERE conversation_id = ?';
        params.push(conversationId);
      }

      const messages = this.db.prepare(sql).all(...params) as Array<{
        rowid: number;
        id: string;
        content: string;
      }>;

      // Use DELETE+INSERT for each message
      const ftsDelete = this.db.prepare('DELETE FROM messages_fts WHERE rowid = ?');
      const ftsInsert = this.db.prepare('INSERT INTO messages_fts(rowid, message_id, content) VALUES (?, ?, ?)');

      let synced = 0;
      for (const msg of messages) {
        try {
          ftsDelete.run(msg.rowid);
          ftsInsert.run(msg.rowid, msg.id, msg.content);
          synced++;
        } catch (error) {
          // Skip individual errors, continue with next message
          console.warn(`[Database] Failed to sync FTS for message ${msg.id}:`, error);
        }
      }
      return {
        success: true,
        data: synced,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * ==================
   * Config operations
   * ==================
   */

  setConfig<K extends keyof any>(key: K, value: any): IQueryResult<boolean> {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        INSERT
        OR REPLACE INTO configs (key, value, updated_at)
        VALUES (?, ?, ?)
      `);

      stmt.run(String(key), JSON.stringify(value), now);

      return {
        success: true,
        data: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getConfig<T = any>(key: string): IQueryResult<T> {
    try {
      const row = this.db.prepare('SELECT value FROM configs WHERE key = ?').get(key) as IConfigRow | undefined;

      if (!row) {
        return {
          success: false,
          error: 'Config not found',
        };
      }

      return {
        success: true,
        data: JSON.parse(row.value) as T,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getAllConfigs(): IQueryResult<Record<string, any>> {
    try {
      const rows = this.db.prepare('SELECT key, value FROM configs').all() as IConfigRow[];

      const configs: Record<string, any> = {};
      for (const row of rows) {
        configs[row.key] = JSON.parse(row.value);
      }

      return {
        success: true,
        data: configs,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  deleteConfig(key: string): IQueryResult<boolean> {
    try {
      const stmt = this.db.prepare('DELETE FROM configs WHERE key = ?');
      const result = stmt.run(key);

      return {
        success: true,
        data: result.changes > 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * ==================
   * Image metadata operations (removed)
   * ==================
   */
  // Images are stored in filesystem and referenced via message.resultDisplay

  // Image storage removed - images are stored in filesystem and referenced via message.resultDisplay

  /**
   * ==================
   * Utility operations
   * ==================
   */

  /**
   * Vacuum database to reclaim space
   */
  vacuum(): void {
    this.db.exec('VACUUM');
  }

  /**
   * Get database statistics
   */
  getStats(): {
    users: number;
    conversations: number;
    messages: number;
  } {
    return {
      users: (
        this.db.prepare('SELECT COUNT(*) as count FROM users').get() as {
          count: number;
        }
      ).count,
      conversations: (this.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number }).count,
      messages: (
        this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as {
          count: number;
        }
      ).count,
    };
  }
}

// Export singleton instance
let dbInstance: AionUIDatabase | null = null;

export function getDatabase(dbPath?: string): AionUIDatabase {
  if (!dbInstance) {
    dbInstance = new AionUIDatabase(dbPath);
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
