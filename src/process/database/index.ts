/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ensureDirectory, getDataPath } from '@process/utils';
import type Database from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { runMigrations as executeMigrations } from './migrations';
import { CURRENT_DB_VERSION, getDatabaseVersion, initSchema, setDatabaseVersion } from './schema';
import type { IConversationRow, IMessageRow, IPaginatedResult, IQueryResult, IUser, TChatConversation, TMessage } from './types';
import { conversationToRow, messageToRow, rowToConversation, rowToMessage } from './types';
import type { IChannelPluginConfig, IChannelUser, IChannelSession, IChannelPairingRequest, IChannelUserRow, IChannelSessionRow, IChannelPairingCodeRow, PluginType, PluginStatus } from '@/channels/types';
import { rowToChannelUser, rowToChannelSession, rowToPairingRequest } from '@/channels/types';
import { encryptCredentials, decryptCredentials } from '@/channels/utils/credentialCrypto';

/**
 * Main database class for AionUi
 * Uses better-sqlite3 for fast, synchronous SQLite operations
 */
export class AionUIDatabase {
  private db: Database.Database;
  private readonly defaultUserId = 'system_default_user';
  private readonly systemPasswordPlaceholder = '';

  constructor() {
    const finalPath = path.join(getDataPath(), 'aionui.db');
    console.log(`[Database] Initializing database at: ${finalPath}`);

    const dir = path.dirname(finalPath);
    ensureDirectory(dir);

    try {
      this.db = new BetterSqlite3(finalPath);
      this.initialize();
    } catch (error) {
      console.error('[Database] Failed to initialize, attempting recovery...', error);
      // 尝试恢复：关闭并重新创建数据库
      // Try to recover by closing and recreating database
      try {
        if (this.db) {
          this.db.close();
        }
      } catch (e) {
        // 忽略关闭错误
        // Ignore close errors
      }

      // 备份损坏的数据库文件
      // Backup corrupted database file
      if (fs.existsSync(finalPath)) {
        const backupPath = `${finalPath}.backup.${Date.now()}`;
        try {
          fs.renameSync(finalPath, backupPath);
          console.log(`[Database] Backed up corrupted database to: ${backupPath}`);
        } catch (e) {
          console.error('[Database] Failed to backup corrupted database:', e);
          // 备份失败则尝试直接删除
          // If backup fails, try to delete instead
          try {
            fs.unlinkSync(finalPath);
            console.log(`[Database] Deleted corrupted database file`);
          } catch (e2) {
            console.error('[Database] Failed to delete corrupted database:', e2);
            throw new Error('Database is corrupted and cannot be recovered. Please manually delete: ' + finalPath);
          }
        }
      }

      // 使用新数据库文件重试
      // Retry with fresh database file
      this.db = new BetterSqlite3(finalPath);
      this.initialize();
    }
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
      const userId = `user_${Date.now()}`;
      const now = Date.now();

      const stmt = this.db.prepare(`
        INSERT INTO users (id, username, email, password_hash, avatar_path, created_at, updated_at, last_login)
        VALUES (?, ?, ?, ?, NULL, ?, ?, NULL)
      `);

      stmt.run(userId, username, email ?? null, passwordHash, now, now);

      return {
        success: true,
        data: {
          id: userId,
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
   * @param userId - User ID to query
   * @returns Query result with user data or error if not found
   */
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
      const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM users WHERE password_hash IS NOT NULL AND TRIM(password_hash) != ''`);
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
   * @param userId - User ID to update
   * @returns Query result with success status
   */
  updateUserLastLogin(userId: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?').run(now, now, userId);
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
   * @param userId - User ID to update
   * @param newPasswordHash - New hashed password (use bcrypt)
   * @returns Query result with success status
   */
  updateUserPassword(userId: string, newPasswordHash: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newPasswordHash, now, userId);
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
  updateUserJwtSecret(userId: string, jwtSecret: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE users SET jwt_secret = ?, updated_at = ? WHERE id = ?').run(jwtSecret, now, userId);
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

  createConversation(conversation: TChatConversation, userId?: string): IQueryResult<TChatConversation> {
    try {
      const row = conversationToRow(conversation, userId || this.defaultUserId);

      const stmt = this.db.prepare(`
        INSERT INTO conversations (id, user_id, name, type, extra, model, status, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(row.id, row.user_id, row.name, row.type, row.extra, row.model, row.status, row.source, row.created_at, row.updated_at);

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

  /**
   * Get the latest conversation by source type
   * 根据来源类型获取最新的会话
   */
  getLatestConversationBySource(source: 'aionui' | 'telegram', userId?: string): IQueryResult<TChatConversation | null> {
    try {
      const finalUserId = userId || this.defaultUserId;
      const row = this.db
        .prepare(
          `
          SELECT * FROM conversations
          WHERE user_id = ? AND source = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `
        )
        .get(finalUserId, source) as IConversationRow | undefined;

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

  getConversationMessages(conversationId: string, page = 0, pageSize = 100, order = 'ASC'): IPaginatedResult<TMessage> {
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
            ORDER BY created_at ${order} LIMIT ?
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
  getMessageByMsgId(conversationId: string, msgId: string, type: TMessage['type']): IQueryResult<TMessage | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT *
        FROM messages
        WHERE conversation_id = ?
          AND msg_id = ?
          AND type = ?
        ORDER BY created_at DESC LIMIT 1
      `);

      const row = stmt.get(conversationId, msgId, type) as IMessageRow | undefined;

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
   * Channel Plugin operations
   * 个人助手插件操作
   * ==================
   */

  /**
   * Get all assistant plugins
   */
  getChannelPlugins(): IQueryResult<IChannelPluginConfig[]> {
    try {
      const rows = this.db.prepare('SELECT * FROM assistant_plugins ORDER BY created_at ASC').all() as Array<{
        id: string;
        type: string;
        name: string;
        enabled: number;
        config: string;
        status: string | null;
        last_connected: number | null;
        created_at: number;
        updated_at: number;
      }>;

      const plugins: IChannelPluginConfig[] = rows.map((row) => {
        const storedConfig = JSON.parse(row.config || '{}');
        // Decrypt credentials when loading
        const decryptedCredentials = decryptCredentials(storedConfig.credentials);

        return {
          id: row.id,
          type: row.type as PluginType,
          name: row.name,
          enabled: row.enabled === 1,
          credentials: decryptedCredentials,
          config: storedConfig.config,
          status: (row.status as PluginStatus) || 'stopped',
          lastConnected: row.last_connected ?? undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });

      return { success: true, data: plugins };
    } catch (error: any) {
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get assistant plugin by ID
   */
  getChannelPlugin(pluginId: string): IQueryResult<IChannelPluginConfig | null> {
    try {
      const row = this.db.prepare('SELECT * FROM assistant_plugins WHERE id = ?').get(pluginId) as
        | {
            id: string;
            type: string;
            name: string;
            enabled: number;
            config: string;
            status: string | null;
            last_connected: number | null;
            created_at: number;
            updated_at: number;
          }
        | undefined;

      if (!row) {
        return { success: true, data: null };
      }

      const storedConfig = JSON.parse(row.config || '{}');
      // Decrypt credentials when loading
      const decryptedCredentials = decryptCredentials(storedConfig.credentials);

      const plugin: IChannelPluginConfig = {
        id: row.id,
        type: row.type as PluginType,
        name: row.name,
        enabled: row.enabled === 1,
        credentials: decryptedCredentials,
        config: storedConfig.config,
        status: (row.status as PluginStatus) || 'stopped',
        lastConnected: row.last_connected ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      return { success: true, data: plugin };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create or update assistant plugin
   */
  upsertChannelPlugin(plugin: IChannelPluginConfig): IQueryResult<boolean> {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        INSERT INTO assistant_plugins (id, type, name, enabled, config, status, last_connected, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          enabled = excluded.enabled,
          config = excluded.config,
          status = excluded.status,
          last_connected = excluded.last_connected,
          updated_at = excluded.updated_at
      `);

      // Encrypt credentials before storing
      const encryptedCredentials = encryptCredentials(plugin.credentials);

      // Store both credentials and config in the config column
      const storedConfig = {
        credentials: encryptedCredentials,
        config: plugin.config,
      };

      stmt.run(plugin.id, plugin.type, plugin.name, plugin.enabled ? 1 : 0, JSON.stringify(storedConfig), plugin.status, plugin.lastConnected ?? null, plugin.createdAt || now, now);

      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update assistant plugin status
   */
  updateChannelPluginStatus(pluginId: string, status: PluginStatus, lastConnected?: number): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE assistant_plugins SET status = ?, last_connected = COALESCE(?, last_connected), updated_at = ? WHERE id = ?').run(status, lastConnected ?? null, now, pluginId);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete assistant plugin
   */
  deleteChannelPlugin(pluginId: string): IQueryResult<boolean> {
    try {
      const result = this.db.prepare('DELETE FROM assistant_plugins WHERE id = ?').run(pluginId);
      return { success: true, data: result.changes > 0 };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * ==================
   * Channel User operations
   * 个人助手用户操作
   * ==================
   */

  /**
   * Get all authorized assistant users
   */
  getChannelUsers(): IQueryResult<IChannelUser[]> {
    try {
      const rows = this.db.prepare('SELECT * FROM assistant_users ORDER BY authorized_at DESC').all() as IChannelUserRow[];
      return { success: true, data: rows.map(rowToChannelUser) };
    } catch (error: any) {
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get assistant user by platform user ID
   */
  getChannelUserByPlatform(platformUserId: string, platformType: PluginType): IQueryResult<IChannelUser | null> {
    try {
      const row = this.db.prepare('SELECT * FROM assistant_users WHERE platform_user_id = ? AND platform_type = ?').get(platformUserId, platformType) as IChannelUserRow | undefined;

      return { success: true, data: row ? rowToChannelUser(row) : null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create assistant user (authorize)
   */
  createChannelUser(user: IChannelUser): IQueryResult<IChannelUser> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO assistant_users (id, platform_user_id, platform_type, display_name, authorized_at, last_active, session_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(user.id, user.platformUserId, user.platformType, user.displayName ?? null, user.authorizedAt, user.lastActive ?? null, user.sessionId ?? null);

      return { success: true, data: user };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update assistant user's last active time
   */
  updateChannelUserActivity(userId: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE assistant_users SET last_active = ? WHERE id = ?').run(now, userId);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete assistant user (revoke authorization)
   */
  deleteChannelUser(userId: string): IQueryResult<boolean> {
    try {
      const result = this.db.prepare('DELETE FROM assistant_users WHERE id = ?').run(userId);
      return { success: true, data: result.changes > 0 };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * ==================
   * Channel Session operations
   * 个人助手会话操作
   * ==================
   */

  /**
   * Get all active assistant sessions
   */
  getChannelSessions(): IQueryResult<IChannelSession[]> {
    try {
      const rows = this.db.prepare('SELECT * FROM assistant_sessions ORDER BY last_activity DESC').all() as IChannelSessionRow[];
      return { success: true, data: rows.map(rowToChannelSession) };
    } catch (error: any) {
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get assistant session by user ID
   */
  getChannelSessionByUser(userId: string): IQueryResult<IChannelSession | null> {
    try {
      const row = this.db.prepare('SELECT * FROM assistant_sessions WHERE user_id = ?').get(userId) as IChannelSessionRow | undefined;
      return { success: true, data: row ? rowToChannelSession(row) : null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create or update assistant session
   */
  upsertChannelSession(session: IChannelSession): IQueryResult<boolean> {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        INSERT INTO assistant_sessions (id, user_id, agent_type, conversation_id, workspace, created_at, last_activity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          agent_type = excluded.agent_type,
          conversation_id = excluded.conversation_id,
          workspace = excluded.workspace,
          last_activity = excluded.last_activity
      `);

      stmt.run(session.id, session.userId, session.agentType, session.conversationId ?? null, session.workspace ?? null, session.createdAt || now, session.lastActivity || now);

      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete assistant session
   */
  deleteChannelSession(sessionId: string): IQueryResult<boolean> {
    try {
      const result = this.db.prepare('DELETE FROM assistant_sessions WHERE id = ?').run(sessionId);
      return { success: true, data: result.changes > 0 };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * ==================
   * Channel Pairing Code operations
   * 个人助手配对码操作
   * ==================
   */

  /**
   * Get all pending pairing requests
   */
  getPendingPairingRequests(): IQueryResult<IChannelPairingRequest[]> {
    try {
      const now = Date.now();
      const rows = this.db.prepare("SELECT * FROM assistant_pairing_codes WHERE status = 'pending' AND expires_at > ? ORDER BY requested_at DESC").all(now) as IChannelPairingCodeRow[];
      return { success: true, data: rows.map(rowToPairingRequest) };
    } catch (error: any) {
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get pairing request by code
   */
  getPairingRequestByCode(code: string): IQueryResult<IChannelPairingRequest | null> {
    try {
      const row = this.db.prepare('SELECT * FROM assistant_pairing_codes WHERE code = ?').get(code) as IChannelPairingCodeRow | undefined;
      return { success: true, data: row ? rowToPairingRequest(row) : null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create pairing request
   */
  createPairingRequest(request: IChannelPairingRequest): IQueryResult<IChannelPairingRequest> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO assistant_pairing_codes (code, platform_user_id, platform_type, display_name, requested_at, expires_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(request.code, request.platformUserId, request.platformType, request.displayName ?? null, request.requestedAt, request.expiresAt, request.status);

      return { success: true, data: request };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update pairing request status
   */
  updatePairingRequestStatus(code: string, status: IChannelPairingRequest['status']): IQueryResult<boolean> {
    try {
      const result = this.db.prepare('UPDATE assistant_pairing_codes SET status = ? WHERE code = ?').run(status, code);
      return { success: true, data: result.changes > 0 };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete expired pairing requests
   */
  cleanupExpiredPairingRequests(): IQueryResult<number> {
    try {
      const now = Date.now();
      const result = this.db.prepare("DELETE FROM assistant_pairing_codes WHERE expires_at < ? OR status != 'pending'").run(now);
      return { success: true, data: result.changes };
    } catch (error: any) {
      return { success: false, error: error.message, data: 0 };
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

// Export singleton instance
let dbInstance: AionUIDatabase | null = null;

export function getDatabase(): AionUIDatabase {
  if (!dbInstance) {
    dbInstance = new AionUIDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
