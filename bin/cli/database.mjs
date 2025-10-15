/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 数据库操作封装 / Database Operations Wrapper
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { CLI_CONFIG } from './config.mjs';

/**
 * 解析数据库路径，遵循环境变量 > 工作目录(.aionui/aionui.db） > 默认路径(./aionui.db)
 * Resolve database path with env override, workspace fallback, default path
 */
export function resolveDbPath() {
  const envPath = process.env[CLI_CONFIG.DATABASE.ENV_KEY];
  if (envPath && envPath.trim() !== '') {
    return path.resolve(envPath.trim());
  }

  const cwd = process.cwd();
  const workspaceDb = path.join(cwd, CLI_CONFIG.DATABASE.DEFAULT_PATH);
  if (fs.existsSync(workspaceDb)) {
    return workspaceDb;
  }

  return path.join(cwd, 'aionui.db');
}

/**
 * 数据库连接管理器
 * Database Connection Manager
 */
class DatabaseManager {
  constructor() {
    this.db = null;
  }

  /**
   * 获取数据库连接
   * Get database connection
   */
  getConnection() {
    if (!this.db) {
      const dbPath = resolveDbPath();
      this.db = new Database(dbPath);
      this.db.pragma('foreign_keys = ON');
    }
    return this.db;
  }

  /**
   * 关闭数据库连接
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * 使用数据库连接执行回调，自动管理连接生命周期
   * Execute callback with database connection, auto-manage lifecycle
   */
  withConnection(callback) {
    const db = this.getConnection();
    try {
      return callback(db);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 异步版本
   * Async version
   */
  async withConnectionAsync(callback) {
    const db = this.getConnection();
    try {
      return await callback(db);
    } catch (error) {
      throw error;
    }
  }
}

// 单例实例 / Singleton instance
const dbManager = new DatabaseManager();

/**
 * 导出数据库管理器
 * Export database manager
 */
export { dbManager };

/**
 * 用户仓储 / User Repository
 */
export const UserRepository = {
  /**
   * 获取所有普通用户，排除系统默认账号
   * Fetch all regular users, skipping the system account
   */
  fetchAll() {
    return dbManager.withConnection((db) => {
      const stmt = db.prepare(
        `SELECT id, username, password_hash, created_at, updated_at, last_login
         FROM users
         WHERE id != ?
         ORDER BY created_at ASC`
      );
      return stmt.all(CLI_CONFIG.DATABASE.SYSTEM_USER_ID);
    });
  },

  /**
   * 通过用户名查找用户
   * Find user by username
   */
  findByUsername(username) {
    return dbManager.withConnection((db) => {
      const stmt = db.prepare(
        `SELECT id, username, password_hash, created_at, updated_at, last_login
         FROM users
         WHERE username = ? AND id != ?`
      );
      return stmt.get(username, CLI_CONFIG.DATABASE.SYSTEM_USER_ID) || null;
    });
  },

  /**
   * 更新用户密码并刷新更新时间戳
   * Update a user's password and refresh timestamp metadata
   */
  updatePassword(userId, passwordHash) {
    return dbManager.withConnection((db) => {
      const now = Date.now();
      const stmt = db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?');
      const result = stmt.run(passwordHash, now, userId);
      return result.changes > 0;
    });
  },

  /**
   * 获取用户数量
   * Get user count
   */
  count() {
    return dbManager.withConnection((db) => {
      const stmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE id != ?');
      const result = stmt.get(CLI_CONFIG.DATABASE.SYSTEM_USER_ID);
      return result?.count || 0;
    });
  },
};

/**
 * 配置仓储 / Config Repository
 */
export const ConfigRepository = {
  /**
   * 设置或覆盖配置项，值以 JSON 形式保存
   * Insert or replace config value stored as JSON
   */
  set(key, value) {
    return dbManager.withConnection((db) => {
      const stmt = db.prepare(
        `INSERT OR REPLACE INTO configs (key, value, updated_at)
         VALUES (?, ?, ?)`
      );
      stmt.run(key, JSON.stringify(value), Date.now());
    });
  },

  /**
   * 获取配置项
   * Get config value
   */
  get(key) {
    return dbManager.withConnection((db) => {
      const stmt = db.prepare('SELECT value FROM configs WHERE key = ?');
      const result = stmt.get(key);
      return result ? JSON.parse(result.value) : null;
    });
  },
};

/**
 * 密码工具 / Password Utils
 */
export const PasswordUtils = {
  /**
   * 生成符合复杂度要求的随机密码
   * Generate a random password that satisfies complexity rules
   */
  generate() {
    const { BASE_LENGTH, LENGTH_VARIANCE, CHARSET } = CLI_CONFIG.PASSWORD;
    const randomByte = crypto.randomBytes(1)[0];
    const length = BASE_LENGTH + (randomByte % LENGTH_VARIANCE);

    const { LOWERCASE, UPPERCASE, DIGITS, SPECIAL } = CHARSET;
    const pool = LOWERCASE + UPPERCASE + DIGITS + SPECIAL;

    const pick = (chars) => chars[crypto.randomBytes(1)[0] % chars.length];

    // 确保至少包含每种字符类型 / Ensure at least one of each character type
    const chars = [pick(LOWERCASE), pick(UPPERCASE), pick(DIGITS), pick(SPECIAL)];

    // 填充剩余长度 / Fill remaining length
    const remaining = Math.max(length - chars.length, 0);
    const bytes = crypto.randomBytes(remaining);
    for (let i = 0; i < remaining; i++) {
      chars.push(pool[bytes[i] % pool.length]);
    }

    // 随机打乱 / Shuffle
    for (let i = chars.length - 1; i > 0; i--) {
      const j = crypto.randomBytes(1)[0] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
  },

  /**
   * 使用 bcrypt 进行密码哈希
   * Hash password with bcrypt
   */
  async hash(password) {
    return bcrypt.hash(password, CLI_CONFIG.DATABASE.BCRYPT_ROUNDS);
  },

  /**
   * 验证密码
   * Verify password
   */
  async verify(password, hash) {
    return bcrypt.compare(password, hash);
  },
};

/**
 * 清理函数，在进程退出时调用
 * Cleanup function to be called on process exit
 */
export function cleanup() {
  dbManager.close();
}
