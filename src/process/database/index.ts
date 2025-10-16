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
import type { IUser, IQueryResult, IPaginatedResult, TChatConversation, TMessage, IConversationRow, IMessageRow } from './types';
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

      const stmt = this.db.prepare(`
        INSERT INTO messages (id, conversation_id, msg_id, type, content, position, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(row.id, row.conversation_id, row.msg_id, row.type, row.content, row.position, row.status, row.created_at);

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
   */
  updateMessage(messageId: string, message: TMessage): IQueryResult<boolean> {
    try {
      const row = messageToRow(message);

      const stmt = this.db.prepare(`
        UPDATE messages
        SET type     = ?,
            content  = ?,
            position = ?,
            status   = ?
        WHERE id = ?
      `);

      const result = stmt.run(row.type, row.content, row.position, row.status, messageId);

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

  deleteMessage(messageId: string): IQueryResult<boolean> {
    try {
      const stmt = this.db.prepare('DELETE FROM messages WHERE id = ?');
      const result = stmt.run(messageId);

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
      const stmt = this.db.prepare('DELETE FROM messages WHERE conversation_id = ?');
      const result = stmt.run(conversationId);

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
   * Vacuum database to reclaim space
   */
  vacuum(): void {
    this.db.exec('VACUUM');
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
