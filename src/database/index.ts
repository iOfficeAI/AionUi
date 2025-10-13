/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Authentication Database Adapter
 *
 * This file provides compatibility layer for the authentication system
 * by wrapping the SQLite database (src/process/database) with the old API.
 *
 * 认证数据库适配器
 */

import crypto from 'crypto';
import { getDatabase, type IAuthUserRow, type IAuthSessionRow } from '../process/database/export';

export interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
  last_login: string | null;
}

export interface Session {
  id: string;
  user_id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

const toIsoString = (timestamp: number): string => new Date(timestamp).toISOString();

const toIsoStringOrNull = (timestamp: number | null): string | null => {
  return timestamp == null ? null : new Date(timestamp).toISOString();
};

const mapAuthUser = (row: IAuthUserRow): User => ({
  id: row.id,
  username: row.username,
  password_hash: row.password_hash,
  created_at: toIsoString(row.created_at),
  last_login: toIsoStringOrNull(row.last_login),
});

const mapAuthSession = (row: IAuthSessionRow): Session => ({
  id: row.id,
  user_id: row.user_id,
  title: row.title,
  created_at: toIsoString(row.created_at),
  updated_at: toIsoString(row.updated_at),
});

class AionDatabase {
  private static instance: AionDatabase;

  private constructor() {
    // Initialize SQLite database through getDatabase()
  }

  public static getInstance(): AionDatabase {
    if (!AionDatabase.instance) {
      AionDatabase.instance = new AionDatabase();
    }
    return AionDatabase.instance;
  }

  // ==================== User operations (用户操作) ====================

  /**
   * Create a new user (创建新用户)
   */
  public createUser(username: string, passwordHash: string): User {
    const db = getDatabase();

    const result = db.createAuthUser(username, passwordHash);

    if (!result.success || !result.data) {
      throw new Error('Failed to create user');
    }

    return mapAuthUser(result.data);
  }

  /**
   * Get user by ID (根据ID获取用户)
   */
  public getUserById(id: number): User | null {
    const db = getDatabase();
    const result = db.getAuthUser(id);

    if (!result.success || !result.data) {
      return null;
    }

    return mapAuthUser(result.data);
  }

  /**
   * Get user by username (根据用户名获取用户)
   */
  public getUserByUsername(username: string): User | null {
    const db = getDatabase();
    const result = db.getAuthUserByUsername(username);

    if (!result.success || !result.data) {
      return null;
    }

    return mapAuthUser(result.data);
  }

  /**
   * Update user's last login time (更新用户最后登录时间)
   */
  public updateLastLogin(userId: number): void {
    const db = getDatabase();
    db.updateAuthUserLastLogin(userId);
  }

  /**
   * Update user password (更新用户密码)
   */
  public updateUserPassword(userId: number, newPasswordHash: string, invalidateAllTokens = true): void {
    const db = getDatabase();

    db.transaction(() => {
      const updateResult = db.updateAuthUserPassword(userId, newPasswordHash);
      if (!updateResult.success) {
        throw new Error(updateResult.error || 'Failed to update user password');
      }

      if (!invalidateAllTokens) {
        return;
      }

      const newJwtSecret = crypto.randomBytes(64).toString('hex');
      const configResult = db.setConfig('jwt_secret', newJwtSecret);
      if (!configResult.success) {
        throw new Error(configResult.error || 'Failed to update JWT secret');
      }

      const deleteResult = db.deleteAuthSessionsByUserId(userId);
      if (!deleteResult.success) {
        throw new Error(deleteResult.error || 'Failed to invalidate user sessions');
      }
    });
  }

  /**
   * Check if any users exist (检查是否存在用户)
   */
  public hasUsers(): boolean {
    const db = getDatabase();
    const result = db.hasAuthUsers();
    return result.success && result.data === true;
  }

  /**
   * Get total user count (获取用户总数)
   */
  public getUserCount(): number {
    const db = getDatabase();
    const result = db.getAllAuthUsers();
    if (!result.success || !result.data) {
      return 0;
    }
    return result.data.length;
  }

  /**
   * Get all users (获取所有用户)
   */
  public getAllUsers(): User[] {
    const db = getDatabase();
    const result = db.getAllAuthUsers();

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map(mapAuthUser);
  }

  // ==================== Session operations (会话操作) ====================

  /**
   * Create a new session (创建新会话)
   */
  public createSession(userId: number, title: string, sessionId?: string): Session {
    const db = getDatabase();
    const id = sessionId || this.generateSessionId();

    const result = db.createAuthSession(id, userId, title);

    if (!result.success || !result.data) {
      throw new Error('Failed to create session');
    }

    // Get the created session
    const sessionResult = db.getAuthSession(id);
    if (!sessionResult.success || !sessionResult.data) {
      throw new Error('Failed to retrieve created session');
    }

    const sessionData = sessionResult.data;

    return mapAuthSession(sessionData);
  }

  /**
   * Get session by ID (根据ID获取会话)
   */
  public getSessionById(id: string): Session | null {
    const db = getDatabase();
    const result = db.getAuthSession(id);

    if (!result.success || !result.data) {
      return null;
    }

    return mapAuthSession(result.data);
  }

  /**
   * Get all sessions for a user (获取用户的所有会话)
   */
  public getSessionsByUserId(userId: number): Session[] {
    const db = getDatabase();
    const result = db.getAuthSessionsByUserId(userId);

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map(mapAuthSession);
  }

  /**
   * Update session title (更新会话标题)
   */
  public updateSessionTitle(sessionId: string, title: string): void {
    const db = getDatabase();
    db.updateAuthSessionTitle(sessionId, title);
  }

  /**
   * Delete session (删除会话)
   */
  public deleteSession(sessionId: string): void {
    const db = getDatabase();
    db.deleteAuthSession(sessionId);
  }

  /**
   * Update session timestamp (更新会话时间戳)
   */
  public updateSessionTimestamp(sessionId: string): void {
    const db = getDatabase();
    db.updateAuthSessionTimestamp(sessionId);
  }

  /**
   * Close database connection (关闭数据库连接)
   */
  public close(): void {
    // SQLite database handles its own closing
  }

  /**
   * Execute function in transaction (在事务中执行函数)
   */
  public transaction<T>(fn: () => T): T {
    // For now, execute directly - proper transaction support would require DB changes
    return fn();
  }

  // ==================== Config operations (配置操作) ====================

  /**
   * Get config value (获取配置值)
   */
  public getConfig(key: string): string | null {
    const db = getDatabase();
    const result = db.getConfig(key);

    if (!result.success || !result.data) {
      return null;
    }

    return result.data as string;
  }

  /**
   * Set config value (设置配置值)
   */
  public setConfig(key: string, value: string): void {
    const db = getDatabase();
    db.setConfig(key, value);
  }

  // ==================== Helper methods (辅助方法) ====================

  /**
   * Generate unique session ID (生成唯一会话ID)
   */
  private generateSessionId(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

export default AionDatabase;
