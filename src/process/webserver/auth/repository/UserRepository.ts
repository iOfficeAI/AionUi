/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AUTH_CONFIG } from '@process/webserver/config/constants';
import { getDatabase } from '@process/services/database/export';
import type { IUser, IQueryResult } from '@process/services/database/types';

/**
 * 认证用户类型，仅包含必要的认证字段
 * Authentication user type containing only essential auth fields
 */
export type AuthUser = Pick<
  IUser,
  'id' | 'username' | 'password_hash' | 'jwt_secret' | 'created_at' | 'updated_at' | 'last_login'
>;

/**
 * 解包数据库查询结果，失败时抛出异常
 * Unwrap database query result, throw error on failure
 * @param result - 查询结果 / Query result
 * @param errorMessage - 错误消息 / Error message
 * @returns 解包后的数据 / Unwrapped data
 */
function unwrap<T>(result: IQueryResult<T>, errorMessage: string): T {
  if (!result.success || typeof result.data === 'undefined' || result.data === null) {
    throw new Error(result.error || errorMessage);
  }
  return result.data;
}

/**
 * 将数据库用户记录映射为认证用户对象
 * Map database user record to auth user object
 * @param row - 数据库用户记录 / Database user record
 * @returns 认证用户对象 / Auth user object
 */
function mapUser(row: IUser): AuthUser {
  return {
    id: row.id,
    username: row.username,
    password_hash: row.password_hash,
    jwt_secret: row.jwt_secret ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login: row.last_login ?? null,
  };
}

function hasPassword(user: AuthUser | null): boolean {
  return !!user?.password_hash?.trim();
}

/**
 * 用户仓库 - 提供用户数据访问接口
 * User Repository - Provides user data access interface
 */
export const UserRepository = {
  /**
   * 检查系统中是否存在用户
   * Check if any users exist in the system
   * @returns 是否存在用户 / Whether users exist
   */
  async hasUsers(): Promise<boolean> {
    const db = await getDatabase();
    const result = db.hasUsers();
    if (!result.success) {
      throw new Error(result.error || 'Failed to check users');
    }
    // 数据层已经过滤掉未设置密码的占位用户
    // Database layer already ignores placeholder rows without passwords
    return Boolean(result.data);
  },

  async getSystemUser(): Promise<AuthUser | null> {
    const db = await getDatabase();
    const system = db.getSystemUser();
    if (!system) {
      return null;
    }
    return mapUser(system);
  },

  async getPrimaryWebUIUser(): Promise<AuthUser | null> {
    const systemUser = await this.getSystemUser();
    if (hasPassword(systemUser)) {
      return systemUser;
    }

    const defaultAdmin = await this.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
    if (hasPassword(defaultAdmin)) {
      return defaultAdmin;
    }

    if (systemUser && systemUser.username !== systemUser.id) {
      return systemUser;
    }

    return null;
  },

  async setSystemUserCredentials(username: string, passwordHash: string): Promise<void> {
    const db = await getDatabase();
    db.setSystemUserCredentials(username, passwordHash);
  },

  /**
   * 创建新用户
   * Create a new user
   * @param username - 用户名 / Username
   * @param passwordHash - 密码哈希 / Password hash
   * @returns 创建的用户 / Created user
   */
  async createUser(username: string, passwordHash: string): Promise<AuthUser> {
    const db = await getDatabase();
    const result = db.createUser(username, undefined, passwordHash);
    const user = unwrap(result, 'Failed to create user');
    return mapUser(user);
  },

  /**
   * 根据用户名查找用户
   * Find user by username
   * @param username - 用户名 / Username
   * @returns 用户对象或 null / User object or null
   */
  async findByUsername(username: string): Promise<AuthUser | null> {
    const db = await getDatabase();
    const result = db.getUserByUsername(username);
    if (!result.success || !result.data) {
      return null;
    }
    return mapUser(result.data);
  },

  /**
   * 根据用户 ID 查找用户
   * Find user by ID
   * @param id - 用户 ID / User ID
   * @returns 用户对象或 null / User object or null
   */
  async findById(id: string): Promise<AuthUser | null> {
    const db = await getDatabase();
    const result = db.getUser(id);
    if (!result.success || !result.data) {
      return null;
    }
    return mapUser(result.data);
  },

  /**
   * 获取所有用户列表
   * Get list of all users
   * @returns 用户数组 / Array of users
   */
  async listUsers(): Promise<AuthUser[]> {
    const db = await getDatabase();
    const result = db.getAllUsers();
    if (!result.success || !result.data) {
      return [];
    }
    return result.data.map(mapUser);
  },

  /**
   * 统计用户总数
   * Count total number of users
   * @returns 用户数量 / Number of users
   */
  async countUsers(): Promise<number> {
    const db = await getDatabase();
    const result = db.getUserCount();
    if (!result.success) {
      throw new Error(result.error || 'Failed to count users');
    }
    return result.data ?? 0;
  },

  /**
   * 更新用户密码
   * Update user password
   * @param userId - 用户 ID / User ID
   * @param passwordHash - 新的密码哈希 / New password hash
   */
  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const db = await getDatabase();
    const result = db.updateUserPassword(userId, passwordHash);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update user password');
    }
  },

  async updateUsername(userId: string, username: string): Promise<void> {
    const db = await getDatabase();
    const result = db.updateUserUsername(userId, username);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update username');
    }
  },

  /**
   * 更新用户最后登录时间
   * Update user's last login time
   * @param userId - 用户 ID / User ID
   */
  async updateLastLogin(userId: string): Promise<void> {
    const db = await getDatabase();
    const result = db.updateUserLastLogin(userId);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update last login');
    }
  },

  /**
   * 更新用户的 JWT secret
   * Update user's JWT secret
   * @param userId - 用户 ID / User ID
   * @param jwtSecret - JWT secret 字符串 / JWT secret string
   */
  async updateJwtSecret(userId: string, jwtSecret: string): Promise<void> {
    const db = await getDatabase();
    const result = db.updateUserJwtSecret(userId, jwtSecret);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update JWT secret');
    }
  },
};
