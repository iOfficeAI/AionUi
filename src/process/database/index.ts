/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import Database from 'better-sqlite3';
import path from 'path';
import { initSchema, getDatabaseVersion, setDatabaseVersion, CURRENT_DB_VERSION } from './schema';
import { runMigrations as executeMigrations, getMigrationHistory, isMigrationApplied } from './migrations';
import type { IUser, IImageMetadata, IQueryResult, IPaginatedResult, TChatConversation, TMessage, IProvider, IMcpServer, IConversationRow, IMessageRow, IAuthUserRow, IAuthSessionRow, IProviderRow, IMcpServerRow, IConfigRow } from './types';
import { conversationToRow, rowToConversation, messageToRow, rowToMessage, providerToRow, rowToProvider, mcpServerToRow, rowToMcpServer } from './types';

/** Resolve final SQLite file path.
 * Priority:
 * 1. Explicit argument
 * 2. Environment variable AIONUI_DB_PATH
 * 3. Project root directory (./aionui.db)
 *
 * 解析 SQLite 数据库文件路径，优先级：
 * 1. 显式参数
 * 2. 环境变量 AIONUI_DB_PATH
 * 3. 项目根目录 (./aionui.db)
 */
const resolveDatabasePath = (explicitPath?: string): string => {
  // 1. Explicit argument
  if (explicitPath && explicitPath.trim() !== '') {
    const candidate = explicitPath.trim();
    return path.isAbsolute(candidate) ? candidate : path.resolve(candidate);
  }

  // 2. Environment variable
  if (process.env.AIONUI_DB_PATH && process.env.AIONUI_DB_PATH.trim() !== '') {
    const candidate = process.env.AIONUI_DB_PATH.trim();
    return path.isAbsolute(candidate) ? candidate : path.resolve(candidate);
  }

  // 3. Default: Project root directory
  return path.join(process.cwd(), 'aionui.db');
};

/**
 * Main database class for AionUi
 * Uses better-sqlite3 for fast, synchronous SQLite operations
 */
export class AionDatabase {
  private db: Database.Database;
  private defaultUserId = 'system_default_user';

  constructor(dbPath?: string) {
    const finalPath = resolveDatabasePath(dbPath);
    console.log(`[Database] Initializing database at: ${finalPath}`);

    this.db = new Database(finalPath);
    this.initialize();
  }

  private initialize(): void {
    try {
      initSchema(this.db);

      // Check and run migrations if needed
      const currentVersion = getDatabaseVersion(this.db);
      if (currentVersion < CURRENT_DB_VERSION) {
        console.log(`[Database] Migrating from version ${currentVersion} to ${CURRENT_DB_VERSION}`);
        this.runMigrations(currentVersion, CURRENT_DB_VERSION);
        setDatabaseVersion(this.db, CURRENT_DB_VERSION);
      }

      console.log('[Database] Initialization complete');
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
  getMigrationHistory(): Array<{ version: number; name: string; timestamp: number }> {
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
    console.log('[Database] Connection closed');
  }

  /**
   * Execute operations inside a transaction
   */
  transaction<T>(fn: () => T): T {
    const wrapped = this.db.transaction(fn);
    return wrapped();
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

      const countResult = this.db.prepare('SELECT COUNT(*) as count FROM conversations WHERE user_id = ?').get(finalUserId) as { count: number };

      const rows = this.db
        .prepare(
          `
        SELECT * FROM conversations
        WHERE user_id = ?
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
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

      const updated = { ...existing.data, ...updates, modifyTime: Date.now() } as TChatConversation;
      const row = conversationToRow(updated, this.defaultUserId);

      const stmt = this.db.prepare(`
        UPDATE conversations
        SET name = ?, extra = ?, model = ?, status = ?, updated_at = ?
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
      const countResult = this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?').get(conversationId) as { count: number };

      const rows = this.db
        .prepare(
          `
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?
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
        SET type = ?, content = ?, position = ?, status = ?
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
        SELECT * FROM messages
        WHERE conversation_id = ? AND msg_id = ?
        ORDER BY created_at DESC
        LIMIT 1
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

      console.log(`[Database] Rebuilt FTS index: ${messages.length} messages indexed`);

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

      console.log(`[Database] Synced FTS for ${synced}/${messages.length} messages`);

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
        INSERT OR REPLACE INTO configs (key, value, updated_at)
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
   * Provider operations
   * ==================
   */

  createProvider(provider: IProvider, userId?: string): IQueryResult<IProvider> {
    try {
      const row = providerToRow(provider, userId || this.defaultUserId);

      const stmt = this.db.prepare(`
        INSERT INTO providers (id, user_id, platform, name, base_url, api_key, models, capabilities, context_limit, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(row.id, row.user_id, row.platform, row.name, row.base_url, row.api_key, row.models, row.capabilities, row.context_limit, row.created_at, row.updated_at);

      return {
        success: true,
        data: provider,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getUserProviders(userId?: string): IQueryResult<IProvider[]> {
    try {
      const finalUserId = userId || this.defaultUserId;
      const rows = this.db.prepare('SELECT * FROM providers WHERE user_id = ?').all(finalUserId) as IProviderRow[];

      return {
        success: true,
        data: rows.map(rowToProvider),
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
   * MCP Server operations
   * ==================
   */

  createMcpServer(server: IMcpServer, userId?: string): IQueryResult<IMcpServer> {
    try {
      const row = mcpServerToRow(server, userId || this.defaultUserId);

      const stmt = this.db.prepare(`
        INSERT INTO mcp_servers (id, user_id, name, description, enabled, transport, tools, status, last_connected, created_at, updated_at, original_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(row.id, row.user_id, row.name, row.description, row.enabled ? 1 : 0, row.transport, row.tools, row.status, row.last_connected, row.created_at, row.updated_at, row.original_json);

      return {
        success: true,
        data: server,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getUserMcpServers(userId?: string): IQueryResult<IMcpServer[]> {
    try {
      const finalUserId = userId || this.defaultUserId;
      const rows = this.db.prepare('SELECT * FROM mcp_servers WHERE user_id = ?').all(finalUserId) as IMcpServerRow[];

      return {
        success: true,
        data: rows.map(rowToMcpServer),
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
   * Image metadata operations
   * ==================
   */

  createImageMetadata(image: IImageMetadata): IQueryResult<IImageMetadata> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO images (id, message_id, conversation_id, file_path, file_hash, file_size, mime_type, width, height, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(image.id, image.message_id, image.conversation_id, image.file_path, image.file_hash, image.file_size, image.mime_type, image.width, image.height, image.created_at);

      return {
        success: true,
        data: image,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getImageByHash(hash: string): IQueryResult<IImageMetadata> {
    try {
      const image = this.db.prepare('SELECT * FROM images WHERE file_hash = ?').get(hash) as IImageMetadata | undefined;

      if (!image) {
        return {
          success: false,
          error: 'Image not found',
        };
      }

      return {
        success: true,
        data: image,
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
   * Utility operations
   * ==================
   */

  /**
   * Vacuum database to reclaim space
   */
  vacuum(): void {
    this.db.exec('VACUUM');
    console.log('[Database] Vacuum completed');
  }

  /**
   * ==================
   * Auth User operations (认证用户操作)
   * ==================
   */

  /**
   * 创建认证用户
   * Create auth user
   */
  createAuthUser(username: string, passwordHash: string): IQueryResult<IAuthUserRow> {
    try {
      const now = Date.now();
      const result = this.db
        .prepare(
          `
        INSERT INTO auth_users (username, password_hash, created_at, last_login)
        VALUES (?, ?, ?, NULL)
      `
        )
        .run(username, passwordHash, now);

      const id = Number(result.lastInsertRowid);

      return {
        success: true,
        data: {
          id,
          username,
          password_hash: passwordHash,
          created_at: now,
          last_login: null,
        },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 根据ID获取认证用户
   * Get auth user by ID
   */
  getAuthUser(id: number): IQueryResult<IAuthUserRow | null> {
    try {
      const row = this.db.prepare('SELECT * FROM auth_users WHERE id = ?').get(id) as IAuthUserRow | undefined;

      return { success: true, data: row || null };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: null };
    }
  }

  /**
   * 根据用户名获取认证用户
   * Get auth user by username
   */
  getAuthUserByUsername(username: string): IQueryResult<IAuthUserRow | null> {
    try {
      const row = this.db.prepare('SELECT * FROM auth_users WHERE username = ?').get(username) as IAuthUserRow | undefined;

      return { success: true, data: row || null };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: null };
    }
  }

  /**
   * 获取所有认证用户
   * Get all auth users
   */
  getAllAuthUsers(): IQueryResult<IAuthUserRow[]> {
    try {
      const rows = this.db.prepare('SELECT * FROM auth_users ORDER BY created_at ASC').all() as IAuthUserRow[];

      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: [] };
    }
  }

  /**
   * 更新认证用户最后登录时间
   * Update auth user last login time
   */
  updateAuthUserLastLogin(id: number): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE auth_users SET last_login = ? WHERE id = ?').run(now, id);

      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: false };
    }
  }

  /**
   * 更新认证用户密码
   * Update auth user password
   */
  updateAuthUserPassword(id: number, newPasswordHash: string): IQueryResult<boolean> {
    try {
      this.db.prepare('UPDATE auth_users SET password_hash = ? WHERE id = ?').run(newPasswordHash, id);

      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: false };
    }
  }

  /**
   * 检查是否存在认证用户
   * Check if auth users exist
   */
  hasAuthUsers(): IQueryResult<boolean> {
    try {
      const result = this.db.prepare('SELECT COUNT(*) as count FROM auth_users').get() as { count: number };

      return { success: true, data: result.count > 0 };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: false };
    }
  }

  /**
   * ==================
   * Auth Session operations (认证会话操作)
   * ==================
   */

  /**
   * 创建认证会话
   * Create auth session
   */
  createAuthSession(id: string, userId: number, title: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db
        .prepare(
          `
        INSERT INTO auth_sessions (id, user_id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run(id, userId, title, now, now);

      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: false };
    }
  }

  /**
   * 根据ID获取认证会话
   * Get auth session by ID
   */
  getAuthSession(id: string): IQueryResult<IAuthSessionRow | null> {
    try {
      const row = this.db.prepare('SELECT * FROM auth_sessions WHERE id = ?').get(id) as IAuthSessionRow | undefined;

      return { success: true, data: row || null };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: null };
    }
  }

  /**
   * 根据用户ID获取所有认证会话
   * Get all auth sessions by user ID
   */
  getAuthSessionsByUserId(userId: number): IQueryResult<IAuthSessionRow[]> {
    try {
      const rows = this.db.prepare('SELECT * FROM auth_sessions WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as IAuthSessionRow[];

      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: [] };
    }
  }

  /**
   * 更新认证会话标题
   * Update auth session title
   */
  updateAuthSessionTitle(id: string, title: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE auth_sessions SET title = ?, updated_at = ? WHERE id = ?').run(title, now, id);

      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: false };
    }
  }

  /**
   * 更新认证会话时间戳
   * Update auth session timestamp
   */
  updateAuthSessionTimestamp(id: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE auth_sessions SET updated_at = ? WHERE id = ?').run(now, id);

      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: false };
    }
  }

  /**
   * 删除认证会话
   * Delete auth session
   */
  deleteAuthSession(id: string): IQueryResult<boolean> {
    try {
      this.db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(id);

      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: false };
    }
  }

  /**
   * 删除用户的所有认证会话
   * Delete all auth sessions for a user
   */
  deleteAuthSessionsByUserId(userId: number): IQueryResult<number> {
    try {
      const result = this.db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);

      return { success: true, data: result.changes };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: 0 };
    }
  }

  /**
   * Get database statistics (获取数据库统计信息)
   */
  getStats(): {
    users: number;
    conversations: number;
    messages: number;
    images: number;
    providers: number;
    mcpServers: number;
    authUsers: number;
    authSessions: number;
  } {
    return {
      users: (this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count,
      conversations: (this.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number }).count,
      messages: (this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }).count,
      images: (this.db.prepare('SELECT COUNT(*) as count FROM images').get() as { count: number }).count,
      providers: (this.db.prepare('SELECT COUNT(*) as count FROM providers').get() as { count: number }).count,
      mcpServers: (this.db.prepare('SELECT COUNT(*) as count FROM mcp_servers').get() as { count: number }).count,
      authUsers: (this.db.prepare('SELECT COUNT(*) as count FROM auth_users').get() as { count: number }).count,
      authSessions: (this.db.prepare('SELECT COUNT(*) as count FROM auth_sessions').get() as { count: number }).count,
    };
  }
}

// Export singleton instance
let dbInstance: AionDatabase | null = null;

export function getDatabase(dbPath?: string): AionDatabase {
  if (!dbInstance) {
    dbInstance = new AionDatabase(dbPath);
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
