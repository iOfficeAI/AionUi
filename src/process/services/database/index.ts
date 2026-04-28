/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ensureDirectory, getDataPath } from '@process/utils';
import type { ISqliteDriver } from './drivers/ISqliteDriver';
import { createDriver } from './drivers/createDriver';
import fs from 'fs';
import path from 'path';
import { runMigrations as executeMigrations } from './migrations';
import { CURRENT_DB_VERSION, getDatabaseVersion, initSchema, setDatabaseVersion } from './schema';
import type {
  IConversationRow,
  IMessageRow,
  IPaginatedResult,
  IQueryResult,
  IUser,
  TChatConversation,
  TMessage,
} from './types';
import { conversationToRow, messageToRow, rowToConversation, rowToMessage } from './types';
import type { IMessageSearchItem, IMessageSearchResponse } from '@/common/types/database';
import type { ConversationSource, TProviderWithModel } from '@/common/config/storage';
import type { RemoteAgentConfig, RemoteAgentStatus } from '@process/agent/remote';
import { encryptString, decryptString } from '@process/utils/credentialCrypto';

type IConversationMessageSearchRow = IConversationRow & {
  message_id: string;
  message_type: TMessage['type'];
  message_content: string;
  message_created_at: number;
};

const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, (match) => `\\${match}`);

const NATIVE_MODULE_LOAD_ERROR_PATTERNS = ['NODE_MODULE_VERSION', 'was compiled against', 'dlopen'];

const DATABASE_CORRUPTION_PATTERNS = [
  'SQLITE_CORRUPT',
  'SQLITE_NOTADB',
  'database disk image is malformed',
  'file is not a database',
  'malformed database schema',
  'unsupported file format',
];

const isNativeModuleLoadError = (message: string): boolean => {
  return NATIVE_MODULE_LOAD_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
};

const isDatabaseCorruptionError = (message: string): boolean => {
  const normalizedMessage = message.toLowerCase();
  return DATABASE_CORRUPTION_PATTERNS.some((pattern) => normalizedMessage.includes(pattern.toLowerCase()));
};

const extractSearchPreviewText = (rawContent: string): string => {
  const collectStrings = (value: unknown, bucket: string[]): void => {
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) {
        bucket.push(normalized);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => collectStrings(item, bucket));
      return;
    }

    if (value && typeof value === 'object') {
      Object.values(value).forEach((item) => collectStrings(item, bucket));
    }
  };

  try {
    const parsed = JSON.parse(rawContent);
    const bucket: string[] = [];
    collectStrings(parsed, bucket);
    const preview_text = bucket.join(' ').replace(/\s+/g, ' ').trim();
    return preview_text || rawContent;
  } catch {
    return rawContent.replace(/\s+/g, ' ').trim();
  }
};

/**
 * Main database class for AionUi
 * Uses a pluggable ISqliteDriver for SQLite operations
 */
export class AionUIDatabase {
  private db: ISqliteDriver;
  private readonly defaultUserId = 'system_default_user';
  private readonly systemPasswordPlaceholder = '';

  private constructor(db: ISqliteDriver) {
    this.db = db;
  }

  /**
   * Create a new AionUIDatabase instance with corruption recovery.
   * This is the only way to obtain an instance — the constructor is private.
   */
  static async create(dbPath: string): Promise<AionUIDatabase> {
    const dir = path.dirname(dbPath);
    ensureDirectory(dir);

    // Attempt normal initialization
    let failedDriver: ISqliteDriver | null = null;
    try {
      const driver = await createDriver(dbPath);
      failedDriver = driver;
      const instance = new AionUIDatabase(driver);
      instance.initialize();
      return instance;
    } catch (error) {
      // Close the driver opened during the failed attempt.
      // On Windows, leaving it open locks the file and prevents recovery (EPERM).
      if (failedDriver) {
        try {
          failedDriver.close();
        } catch {
          // ignore close errors during recovery
        }
        failedDriver = null;
      }

      // Distinguish driver-level errors (native module mismatch, missing .node file)
      // from actual database corruption. Driver errors must NOT trigger recovery —
      // replacing a healthy database because of a build tooling issue causes data loss.
      const msg = error instanceof Error ? error.message : String(error);
      if (isNativeModuleLoadError(msg)) {
        console.error(
          '[Database] Native module load error — will NOT attempt recovery (database is likely intact):',
          msg
        );
        throw error;
      }
      if (!isDatabaseCorruptionError(msg)) {
        console.error('[Database] Initialization failed — will NOT attempt recovery without a corruption signal:', msg);
        throw error;
      }
      console.error('[Database] Failed to initialize due to corruption, attempting recovery...', error);
    }

    // Recovery: backup corrupted file and start fresh.
    // IMPORTANT: also remove the WAL (-wal) and shared-memory (-shm) sidecar files.
    // If they are left behind, SQLite will try to apply the stale WAL to the new
    // empty database on the next open, which causes another initialization failure
    // and triggers an infinite recovery loop.
    if (fs.existsSync(dbPath)) {
      const backupPath = `${dbPath}.backup.${Date.now()}`;
      try {
        fs.renameSync(dbPath, backupPath);
        console.log(`[Database] Backed up corrupted database to: ${backupPath}`);
      } catch {
        try {
          fs.unlinkSync(dbPath);
          console.log('[Database] Deleted corrupted database file');
        } catch (e2) {
          throw new Error('Database is corrupted and cannot be recovered. Please manually delete: ' + dbPath, {
            cause: e2,
          });
        }
      }
    }
    // Remove stale WAL sidecar files so SQLite starts with a clean slate
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = dbPath + suffix;
      if (fs.existsSync(sidecar)) {
        try {
          fs.unlinkSync(sidecar);
          console.log(`[Database] Removed stale WAL sidecar: ${sidecar}`);
        } catch (e) {
          console.warn(`[Database] Could not remove sidecar ${sidecar}:`, e);
        }
      }
    }

    // Retry with fresh file
    const driver = await createDriver(dbPath);
    const instance = new AionUIDatabase(driver);
    instance.initialize();
    return instance;
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

      this.ensureSystemUser();
    } catch (error) {
      console.error('[Database] Initialization failed:', error);
      throw error;
    }
  }

  private runMigrations(from: number, to: number): void {
    executeMigrations(this.db, from, to);
  }

  private ensureSystemUser(): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO users (id, username, email, password_hash, avatar_path, created_at, updated_at, last_login, jwt_secret)
         VALUES (?, ?, NULL, ?, NULL, ?, ?, NULL, NULL)`
      )
      .run(this.defaultUserId, this.defaultUserId, this.systemPasswordPlaceholder, now, now);
  }

  getSystemUser(): IUser | null {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(this.defaultUserId) as IUser | undefined;
    return user ?? null;
  }

  setSystemUserCredentials(username: string, passwordHash: string): void {
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE users
         SET username = ?, password_hash = ?, updated_at = ?, created_at = COALESCE(created_at, ?)
         WHERE id = ?`
      )
      .run(username, passwordHash, now, now, this.defaultUserId);
  }

  updateUserUsername(user_id: string, username: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?').run(username, now, user_id);
      return {
        success: true,
        data: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: false,
      };
    }
  }
  /**
   * Expose the underlying SQLite driver for repositories that need raw SQL access.
   * Prefer using dedicated methods on AionUIDatabase where possible.
   */
  getDriver(): ISqliteDriver {
    return this.db;
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
   * 用户操作
   * ==================
   */

  /**
   * Create a new user in the database
   * 在数据库中创建新用户
   *
   * @param username - Username (unique identifier)
   * @param email - User email (optional)
   * @param passwordHash - Hashed password (use bcrypt)
   * @returns Query result with created user data
   */
  createUser(username: string, email: string | undefined, passwordHash: string): IQueryResult<IUser> {
    try {
      const user_id = `user_${Date.now()}`;
      const now = Date.now();

      const stmt = this.db.prepare(`
        INSERT INTO users (id, username, email, password_hash, avatar_path, created_at, updated_at, last_login)
        VALUES (?, ?, ?, ?, NULL, ?, ?, NULL)
      `);

      stmt.run(user_id, username, email ?? null, passwordHash, now, now);

      return {
        success: true,
        data: {
          id: user_id,
          username,
          email,
          password_hash: passwordHash,
          created_at: now,
          updated_at: now,
          last_login: null,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get user by user ID
   * 通过用户 ID 获取用户信息
   *
   * @param user_id - User ID to query
   * @returns Query result with user data or error if not found
   */
  getUser(user_id: string): IQueryResult<IUser> {
    try {
      const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(user_id) as IUser | undefined;

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

  /**
   * Get user by username (used for authentication)
   * 通过用户名获取用户信息（用于身份验证）
   *
   * @param username - Username to query
   * @returns Query result with user data or null if not found
   */
  getUserByUsername(username: string): IQueryResult<IUser | null> {
    try {
      const user = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as IUser | undefined;

      return {
        success: true,
        data: user ?? null,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }

  /**
   * Get all users (excluding system default user)
   * 获取所有用户（排除系统默认用户）
   *
   * @returns Query result with array of all users ordered by creation time
   */
  getAllUsers(): IQueryResult<IUser[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM users ORDER BY created_at ASC');
      const rows = stmt.all() as IUser[];

      return {
        success: true,
        data: rows,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: [],
      };
    }
  }

  /**
   * Get total count of users (excluding system default user)
   * 获取用户总数（排除系统默认用户）
   *
   * @returns Query result with user count
   */
  getUserCount(): IQueryResult<number> {
    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM users');
      const row = stmt.get() as { count: number };

      return {
        success: true,
        data: row.count,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: 0,
      };
    }
  }

  /**
   * Check if any users exist in the database
   * 检查数据库中是否存在用户
   *
   * @returns Query result with boolean indicating if users exist
   */
  hasUsers(): IQueryResult<boolean> {
    try {
      // 只统计已设置密码的账户，排除尚未完成初始化的占位行
      // Count only accounts with a non-empty password to ignore placeholder entries
      const stmt = this.db.prepare(
        `SELECT COUNT(*) as count FROM users WHERE password_hash IS NOT NULL AND TRIM(password_hash) != ''`
      );
      const row = stmt.get() as { count: number };
      return {
        success: true,
        data: row.count > 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update user's last login timestamp
   * 更新用户的最后登录时间戳
   *
   * @param user_id - User ID to update
   * @returns Query result with success status
   */
  updateUserLastLogin(user_id: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?').run(now, now, user_id);
      return {
        success: true,
        data: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: false,
      };
    }
  }

  /**
   * Update user's password hash
   * 更新用户的密码哈希
   *
   * @param user_id - User ID to update
   * @param newPasswordHash - New hashed password (use bcrypt)
   * @returns Query result with success status
   */
  updateUserPassword(user_id: string, newPasswordHash: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db
        .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(newPasswordHash, now, user_id);
      return {
        success: true,
        data: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: false,
      };
    }
  }

  /**
   * Update user's JWT secret
   * 更新用户的 JWT secret
   */
  updateUserJwtSecret(user_id: string, jwtSecret: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE users SET jwt_secret = ?, updated_at = ? WHERE id = ?').run(jwtSecret, now, user_id);
      return {
        success: true,
        data: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: false,
      };
    }
  }

  /**
   * ==================
   * Conversation operations
   * ==================
   */

  createConversation(conversation: TChatConversation, user_id?: string): IQueryResult<TChatConversation> {
    try {
      const row = conversationToRow(conversation, user_id || this.defaultUserId);

      const stmt = this.db.prepare(`
        INSERT INTO conversations (id, user_id, name, type, extra, model, status, source, channel_chat_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        row.id,
        row.user_id,
        row.name,
        row.type,
        row.extra,
        row.model,
        row.status,
        row.source,
        row.channel_chat_id ?? null,
        row.created_at,
        row.updated_at
      );

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

  getConversation(conversation_id: string): IQueryResult<TChatConversation> {
    try {
      const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation_id) as
        | IConversationRow
        | undefined;

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

  /**
   * Find the latest channel conversation by source, chat ID, type, and optionally backend.
   * Used for per-chat conversation isolation in channel platforms.
   *
   * For ACP conversations, `backend` distinguishes between claude, codebuddy, etc.
   * (stored in `extra.backend` JSON field).
   */
  findChannelConversation(
    source: ConversationSource,
    channel_chat_id: string,
    type: string,
    backend?: string,
    user_id?: string
  ): IQueryResult<TChatConversation | null> {
    try {
      const finalUserId = user_id || this.defaultUserId;

      let row: IConversationRow | undefined;
      if (backend) {
        row = this.db
          .prepare(
            `
            SELECT * FROM conversations
            WHERE user_id = ? AND source = ? AND channel_chat_id = ? AND type = ?
              AND json_extract(extra, '$.backend') = ?
            ORDER BY updated_at DESC
            LIMIT 1
          `
          )
          .get(finalUserId, source, channel_chat_id, type, backend) as IConversationRow | undefined;
      } else {
        row = this.db
          .prepare(
            `
            SELECT * FROM conversations
            WHERE user_id = ? AND source = ? AND channel_chat_id = ? AND type = ?
            ORDER BY updated_at DESC
            LIMIT 1
          `
          )
          .get(finalUserId, source, channel_chat_id, type) as IConversationRow | undefined;
      }

      return {
        success: true,
        data: row ? rowToConversation(row) : null,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Batch-update the model field on channel conversations matching source + type.
   * Used when channel settings change to propagate new model to existing conversations.
   */
  updateChannelConversationModel(
    source: 'telegram' | 'lark' | 'dingtalk' | 'weixin' | 'wecom',
    type: string,
    model: TProviderWithModel,
    user_id?: string
  ): IQueryResult<number> {
    try {
      const finalUserId = user_id || this.defaultUserId;
      const modelJson = JSON.stringify(model);
      const now = Date.now();
      const stmt = this.db.prepare(`
        UPDATE conversations SET model = ?, updated_at = ?
        WHERE user_id = ? AND source = ? AND type = ?
      `);
      const result = stmt.run(modelJson, now, finalUserId, source, type);
      return { success: true, data: result.changes };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getUserConversations(user_id?: string, page = 0, page_size = 50): IPaginatedResult<TChatConversation> {
    try {
      const finalUserId = user_id || this.defaultUserId;

      const countResult = this.db
        .prepare('SELECT COUNT(*) as count FROM conversations WHERE user_id = ?')
        .get(finalUserId) as {
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
        .all(finalUserId, page_size, page * page_size) as IConversationRow[];

      const data: TChatConversation[] = [];
      for (const row of rows) {
        try {
          data.push(rowToConversation(row));
        } catch (e) {
          console.warn('[Database] Skipping conversation row with unknown type:', row.type, row.id);
        }
      }

      return {
        data,
        total: countResult.count,
        page,
        page_size,
        has_more: (page + 1) * page_size < countResult.count,
      };
    } catch (error: any) {
      console.error('[Database] Get conversations error:', error);
      return {
        data: [],
        total: 0,
        page,
        page_size,
        has_more: false,
      };
    }
  }

  getConversationsByCronJobId(cron_job_id: string): TChatConversation[] {
    const rows = this.db
      .prepare(`SELECT * FROM conversations WHERE json_extract(extra, '$.cron_job_id') = ? ORDER BY created_at DESC`)
      .all(cron_job_id) as IConversationRow[];
    const result: TChatConversation[] = [];
    for (const row of rows) {
      try {
        result.push(rowToConversation(row));
      } catch (e) {
        console.warn('[Database] Skipping conversation row with unknown type:', row.type, row.id);
      }
    }
    return result;
  }

  updateConversation(conversation_id: string, updates: Partial<TChatConversation>): IQueryResult<boolean> {
    try {
      const existing = this.getConversation(conversation_id);
      if (!existing.success || !existing.data) {
        return {
          success: false,
          error: 'Conversation not found',
        };
      }

      const updated = {
        ...existing.data,
        ...updates,
        modified_at: Date.now(),
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

      stmt.run(row.name, row.extra, row.model, row.status, row.updated_at, conversation_id);

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

  deleteConversation(conversation_id: string): IQueryResult<boolean> {
    try {
      const stmt = this.db.prepare('DELETE FROM conversations WHERE id = ?');
      const result = stmt.run(conversation_id);

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
        INSERT INTO messages (id, conversation_id, msg_id, type, content, position, status, hidden, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        row.id,
        row.conversation_id,
        row.msg_id,
        row.type,
        row.content,
        row.position,
        row.status,
        row.hidden ?? 0,
        row.created_at
      );

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

  getConversationMessages(
    conversation_id: string,
    page = 0,
    page_size = 100,
    order = 'ASC'
  ): IPaginatedResult<TMessage> {
    try {
      const countResult = this.db
        .prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?')
        .get(conversation_id) as {
        count: number;
      };

      const rows = this.db
        .prepare(
          `
            SELECT *
            FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ${order} LIMIT ?
            OFFSET ?
          `
        )
        .all(conversation_id, page_size, page * page_size) as IMessageRow[];

      return {
        data: rows.map(rowToMessage),
        total: countResult.count,
        page,
        page_size,
        has_more: (page + 1) * page_size < countResult.count,
      };
    } catch (error: any) {
      console.error('[Database] Get messages error:', error);
      return {
        data: [],
        total: 0,
        page,
        page_size,
        has_more: false,
      };
    }
  }

  searchConversationMessages(keyword: string, user_id?: string, page = 0, page_size = 20): IMessageSearchResponse {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      return {
        items: [],
        total: 0,
        page,
        page_size,
        has_more: false,
      };
    }

    try {
      const finalUserId = user_id || this.defaultUserId;
      const escapedKeyword = escapeLikePattern(trimmedKeyword);
      const likePattern = `%${escapedKeyword}%`;

      const countResult = this.db
        .prepare(
          `
            SELECT COUNT(*) as count
            FROM messages m
            INNER JOIN conversations c ON c.id = m.conversation_id
            WHERE c.user_id = ?
              AND m.content LIKE ? ESCAPE '\\'
          `
        )
        .get(finalUserId, likePattern) as { count: number };

      const rows = this.db
        .prepare(
          `
            SELECT
              c.id,
              c.user_id,
              c.name,
              c.type,
              c.extra,
              c.model,
              c.status,
              c.source,
              c.channel_chat_id,
              c.created_at,
              c.updated_at,
              m.id as message_id,
              m.type as message_type,
              m.content as message_content,
              m.created_at as message_created_at
            FROM messages m
            INNER JOIN conversations c ON c.id = m.conversation_id
            WHERE c.user_id = ?
              AND m.content LIKE ? ESCAPE '\\'
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?
          `
        )
        .all(finalUserId, likePattern, page_size, page * page_size) as IConversationMessageSearchRow[];

      const items: IMessageSearchItem[] = rows.map((row) => ({
        conversation: rowToConversation(row),
        message_id: row.message_id,
        message_type: row.message_type,
        message_created_at: row.message_created_at,
        preview_text: extractSearchPreviewText(row.message_content),
      }));

      return {
        items,
        total: countResult.count,
        page,
        page_size,
        has_more: (page + 1) * page_size < countResult.count,
      };
    } catch (error: any) {
      console.error('[Database] Search messages error:', error);
      return {
        items: [],
        total: 0,
        page,
        page_size,
        has_more: false,
      };
    }
  }

  /**
   * Update a message in the database
   * @param message_id - Message ID to update
   * @param message - Updated message data
   */
  updateMessage(message_id: string, message: TMessage): IQueryResult<boolean> {
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

      const result = stmt.run(row.type, row.content, row.position, row.status, message_id);

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

  deleteMessage(message_id: string): IQueryResult<boolean> {
    try {
      const stmt = this.db.prepare('DELETE FROM messages WHERE id = ?');
      const result = stmt.run(message_id);

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

  deleteConversationMessages(conversation_id: string): IQueryResult<number> {
    try {
      const stmt = this.db.prepare('DELETE FROM messages WHERE conversation_id = ?');
      const result = stmt.run(conversation_id);

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
  getMessageByMsgId(conversation_id: string, msgId: string, type: TMessage['type']): IQueryResult<TMessage | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT *
        FROM messages
        WHERE conversation_id = ?
          AND msg_id = ?
          AND type = ?
        ORDER BY created_at DESC LIMIT 1
      `);

      const row = stmt.get(conversation_id, msgId, type) as IMessageRow | undefined;

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
   * ==================
   * Remote Agent operations
   * ==================
   */

  getRemoteAgents(): RemoteAgentConfig[] {
    try {
      const rows = this.db.prepare('SELECT * FROM remote_agents ORDER BY created_at DESC').all() as Array<{
        id: string;
        name: string;
        protocol: string;
        url: string;
        auth_type: string;
        auth_token: string | null;
        avatar: string | null;
        description: string | null;
        device_id: string | null;
        device_public_key: string | null;
        device_private_key: string | null;
        device_token: string | null;
        allow_insecure: number | null;
        status: string | null;
        last_connected_at: number | null;
        created_at: number;
        updated_at: number;
      }>;

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        protocol: row.protocol as RemoteAgentConfig['protocol'],
        url: row.url,
        auth_type: row.auth_type as RemoteAgentConfig['auth_type'],
        auth_token: row.auth_token ? decryptString(row.auth_token) : undefined,
        allow_insecure: !!row.allow_insecure,
        avatar: row.avatar ?? undefined,
        description: row.description ?? undefined,
        device_id: row.device_id ?? undefined,
        device_public_key: row.device_public_key ? decryptString(row.device_public_key) : undefined,
        device_private_key: row.device_private_key ? decryptString(row.device_private_key) : undefined,
        device_token: row.device_token ? decryptString(row.device_token) : undefined,
        status: (row.status as RemoteAgentStatus) ?? 'unknown',
        last_connected_at: row.last_connected_at ?? undefined,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    } catch (error) {
      console.error('[Database] getRemoteAgents error:', error);
      return [];
    }
  }

  getRemoteAgent(id: string): RemoteAgentConfig | null {
    try {
      const row = this.db.prepare('SELECT * FROM remote_agents WHERE id = ?').get(id) as
        | {
            id: string;
            name: string;
            protocol: string;
            url: string;
            auth_type: string;
            auth_token: string | null;
            avatar: string | null;
            description: string | null;
            device_id: string | null;
            device_public_key: string | null;
            device_private_key: string | null;
            device_token: string | null;
            allow_insecure: number | null;
            status: string | null;
            last_connected_at: number | null;
            created_at: number;
            updated_at: number;
          }
        | undefined;

      if (!row) return null;

      return {
        id: row.id,
        name: row.name,
        protocol: row.protocol as RemoteAgentConfig['protocol'],
        url: row.url,
        auth_type: row.auth_type as RemoteAgentConfig['auth_type'],
        auth_token: row.auth_token ? decryptString(row.auth_token) : undefined,
        allow_insecure: !!row.allow_insecure,
        avatar: row.avatar ?? undefined,
        description: row.description ?? undefined,
        device_id: row.device_id ?? undefined,
        device_public_key: row.device_public_key ? decryptString(row.device_public_key) : undefined,
        device_private_key: row.device_private_key ? decryptString(row.device_private_key) : undefined,
        device_token: row.device_token ? decryptString(row.device_token) : undefined,
        status: (row.status as RemoteAgentStatus) ?? 'unknown',
        last_connected_at: row.last_connected_at ?? undefined,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    } catch (error) {
      console.error('[Database] getRemoteAgent error:', error);
      return null;
    }
  }

  createRemoteAgent(config: RemoteAgentConfig): IQueryResult<RemoteAgentConfig> {
    try {
      this.db
        .prepare(
          `INSERT INTO remote_agents (id, name, protocol, url, auth_type, auth_token, allow_insecure, avatar, description, device_id, device_public_key, device_private_key, device_token, status, last_connected_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          config.id,
          config.name,
          config.protocol,
          config.url,
          config.auth_type,
          config.auth_token ? encryptString(config.auth_token) : null,
          config.allow_insecure ? 1 : 0,
          config.avatar ?? null,
          config.description ?? null,
          config.device_id ?? null,
          config.device_public_key ? encryptString(config.device_public_key) : null,
          config.device_private_key ? encryptString(config.device_private_key) : null,
          config.device_token ? encryptString(config.device_token) : null,
          config.status ?? 'unknown',
          config.last_connected_at ?? null,
          config.created_at,
          config.updated_at
        );
      return { success: true, data: config };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  updateRemoteAgent(
    id: string,
    updates: Partial<{
      name: string;
      protocol: string;
      url: string;
      auth_type: string;
      auth_token: string;
      avatar: string;
      description: string;
      device_id: string;
      device_public_key: string;
      device_private_key: string;
      device_token: string;
      allow_insecure: number;
      status: string;
      last_connected_at: number;
    }>
  ): IQueryResult<boolean> {
    const ENCRYPTED_FIELDS = new Set(['auth_token', 'device_public_key', 'device_private_key', 'device_token']);
    try {
      const sets: string[] = [];
      const values: unknown[] = [];

      for (const [key, value] of Object.entries(updates)) {
        sets.push(`${key} = ?`);
        values.push(ENCRYPTED_FIELDS.has(key) && typeof value === 'string' ? encryptString(value) : (value ?? null));
      }

      sets.push('updated_at = ?');
      values.push(Date.now());
      values.push(id);

      this.db.prepare(`UPDATE remote_agents SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  deleteRemoteAgent(id: string): IQueryResult<boolean> {
    try {
      const result = this.db.prepare('DELETE FROM remote_agents WHERE id = ?').run(id);
      return { success: true, data: result.changes > 0 };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Vacuum database to reclaim space
   */
  vacuum(): void {
    this.db.exec('VACUUM');
    console.log('[Database] Vacuum completed');
  }
}

// Async singleton with Promise cache
let dbInstancePromise: Promise<AionUIDatabase> | null = null;
// Synchronous reference to the resolved instance — used for safe close on exit
let dbResolved: AionUIDatabase | null = null;

function resolveDbPath(): string {
  return path.join(getDataPath(), 'aionui.db');
}

export function getDatabase(): Promise<AionUIDatabase> {
  if (!dbInstancePromise) {
    dbInstancePromise = AionUIDatabase.create(resolveDbPath()).then((db) => {
      dbResolved = db;
      return db;
    });
  }
  return dbInstancePromise;
}

export function closeDatabase(): void {
  // Close synchronously via the resolved reference so this is safe to call from
  // process.on('exit') handlers (which cannot await Promises).
  if (dbResolved) {
    try {
      dbResolved.close();
    } catch {
      // ignore errors during shutdown
    }
    dbResolved = null;
  }
  dbInstancePromise = null;
}
