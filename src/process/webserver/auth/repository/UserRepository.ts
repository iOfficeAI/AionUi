/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpRequest } from '@/common/adapter/httpBridge';
import { AUTH_CONFIG } from '@process/webserver/config/constants';

/**
 * 认证用户类型，仅包含必要的认证字段
 * Authentication user type containing only essential auth fields
 */
export type AuthUser = {
  id: string;
  username: string;
  password_hash: string;
  jwt_secret: string | null;
  created_at: number;
  updated_at: number;
  last_login: number | null;
};

type AuthStatus = {
  success: boolean;
  needs_setup: boolean;
  user_count: number;
  is_authenticated: boolean;
};

const INTERNAL_USERS_BASE = '/api/auth/internal/users';

function encodePath(value: string): string {
  return encodeURIComponent(value);
}

function hasPassword(user: AuthUser | null): boolean {
  return !!user?.password_hash?.trim();
}

async function getAuthStatus(): Promise<AuthStatus> {
  return await httpRequest<AuthStatus>('GET', '/api/auth/status');
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
    const status = await getAuthStatus();
    return !status.needs_setup;
  },

  async getSystemUser(): Promise<AuthUser | null> {
    return await httpRequest<AuthUser | null>('GET', `${INTERNAL_USERS_BASE}/system`);
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
    await httpRequest<void>('POST', `${INTERNAL_USERS_BASE}/system/credentials`, {
      username,
      password_hash: passwordHash,
    });
  },

  /**
   * 创建新用户
   * Create a new user
   * @param username - 用户名 / Username
   * @param passwordHash - 密码哈希 / Password hash
   * @returns 创建的用户 / Created user
   */
  async createUser(username: string, passwordHash: string): Promise<AuthUser> {
    return await httpRequest<AuthUser>('POST', INTERNAL_USERS_BASE, {
      username,
      password_hash: passwordHash,
    });
  },

  /**
   * 根据用户名查找用户
   * Find user by username
   * @param username - 用户名 / Username
   * @returns 用户对象或 null / User object or null
   */
  async findByUsername(username: string): Promise<AuthUser | null> {
    return await httpRequest<AuthUser | null>('GET', `${INTERNAL_USERS_BASE}/by-username/${encodePath(username)}`);
  },

  /**
   * 根据用户 ID 查找用户
   * Find user by ID
   * @param id - 用户 ID / User ID
   * @returns 用户对象或 null / User object or null
   */
  async findById(id: string): Promise<AuthUser | null> {
    return await httpRequest<AuthUser | null>('GET', `${INTERNAL_USERS_BASE}/${encodePath(id)}`);
  },

  /**
   * 获取所有用户列表
   * Get list of all users
   * @returns 用户数组 / Array of users
   */
  async listUsers(): Promise<AuthUser[]> {
    return await httpRequest<AuthUser[]>('GET', INTERNAL_USERS_BASE);
  },

  /**
   * 统计用户总数
   * Count total number of users
   * @returns 用户数量 / Number of users
   */
  async countUsers(): Promise<number> {
    const status = await getAuthStatus();
    return status.user_count ?? 0;
  },

  /**
   * 更新用户密码
   * Update user password
   * @param user_id - 用户 ID / User ID
   * @param passwordHash - 新的密码哈希 / New password hash
   */
  async updatePassword(user_id: string, passwordHash: string): Promise<void> {
    await httpRequest<void>('POST', `${INTERNAL_USERS_BASE}/${encodePath(user_id)}/password`, {
      password_hash: passwordHash,
    });
  },

  async updateUsername(user_id: string, username: string): Promise<void> {
    await httpRequest<void>('POST', `${INTERNAL_USERS_BASE}/${encodePath(user_id)}/username`, {
      username,
    });
  },

  /**
   * 更新用户最后登录时间
   * Update user's last login time
   * @param user_id - 用户 ID / User ID
   */
  async updateLastLogin(user_id: string): Promise<void> {
    await httpRequest<void>('POST', `${INTERNAL_USERS_BASE}/${encodePath(user_id)}/last-login`);
  },

  /**
   * 更新用户的 JWT secret
   * Update user's JWT secret
   * @param user_id - 用户 ID / User ID
   * @param jwtSecret - JWT secret 字符串 / JWT secret string
   */
  async updateJwtSecret(user_id: string, jwtSecret: string): Promise<void> {
    await httpRequest<void>('POST', `${INTERNAL_USERS_BASE}/${encodePath(user_id)}/jwt-secret`, {
      jwt_secret: jwtSecret,
    });
  },
};
