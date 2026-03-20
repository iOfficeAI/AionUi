/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  hashPassword as nativeHashPassword,
  verifyPassword as nativeVerifyPassword,
  generateToken as nativeGenerateToken,
  verifyJwt as nativeVerifyJwt,
  validateUsername as nativeValidateUsername,
  validatePasswordStrength as nativeValidatePasswordStrength,
  generateRandomPassword as nativeGenerateRandomPassword,
  generateUserCredentials as nativeGenerateUserCredentials,
  generateSessionId as nativeGenerateSessionId,
  generateSecretKey as nativeGenerateSecretKey,
  constantTimeCompare as nativeConstantTimeCompare,
  sha256Hex as nativeSha256Hex,
} from '@aionui/native';
import type { AuthUser } from '../repository/UserRepository';
import { UserRepository } from '../repository/UserRepository';
import { AUTH_CONFIG } from '../../config/constants';

interface TokenPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}

interface UserCredentials {
  username: string;
  password: string;
  createdAt: number;
}

/**
 * 认证服务 - 提供密码哈希、Token 生成与验证等能力
 * Authentication Service - handles password hashing, token issuance, and validation
 *
 * Crypto operations are delegated to the Rust native addon (aionui-auth crate).
 * Stateful parts (blacklist, JWT secret cache) remain in TypeScript.
 */
export class AuthService {
  private static jwtSecret: string | null = null;
  private static readonly TOKEN_EXPIRY = AUTH_CONFIG.TOKEN.SESSION_EXPIRY;

  /**
   * Token 黑名单 - 存储已登出的 token（内存存储，重启后清空）
   * Token blacklist - stores logged out tokens (in-memory, cleared on restart)
   * Key: token 的 SHA-256 哈希, Value: 过期时间戳
   */
  private static tokenBlacklist: Map<string, number> = new Map();
  private static readonly BLACKLIST_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  private static blacklistCleanupTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * 将 token 加入黑名单（登出时调用）
   * Add token to blacklist (called on logout)
   */
  public static blacklistToken(token: string): void {
    // 使用 token 的哈希作为 key，避免存储原始 token
    const tokenHash = nativeSha256Hex(token);
    this.tokenBlacklist.set(tokenHash, Date.now() + AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE);

    // 启动清理定时器（如果还没启动）
    this.startBlacklistCleanup();
  }

  /**
   * 检查 token 是否在黑名单中
   * Check if token is blacklisted
   */
  public static isTokenBlacklisted(token: string): boolean {
    const tokenHash = nativeSha256Hex(token);
    const expiry = this.tokenBlacklist.get(tokenHash);

    if (!expiry) {
      return false;
    }

    // 如果已过期，从黑名单移除
    if (Date.now() > expiry) {
      this.tokenBlacklist.delete(tokenHash);
      return false;
    }

    return true;
  }

  /**
   * 启动黑名单清理定时器
   * Start blacklist cleanup timer
   */
  private static startBlacklistCleanup(): void {
    if (this.blacklistCleanupTimer) {
      return;
    }

    this.blacklistCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [hash, expiry] of this.tokenBlacklist.entries()) {
        if (now > expiry) {
          this.tokenBlacklist.delete(hash);
        }
      }
    }, this.BLACKLIST_CLEANUP_INTERVAL);

    // 允许进程正常退出
    this.blacklistCleanupTimer.unref();
  }

  /**
   * 获取或创建 JWT Secret，并缓存于内存
   * Load or create the JWT secret and cache it in memory
   *
   * JWT secret 存储在 users 表的 admin 用户中
   * JWT secret is stored in the admin user's row in users table
   */
  public static getJwtSecret(): string {
    if (this.jwtSecret) {
      return this.jwtSecret;
    }

    // 优先使用环境变量，方便部署覆盖 / Prefer env var for deploy-time override
    if (process.env.JWT_SECRET) {
      this.jwtSecret = process.env.JWT_SECRET;
      return this.jwtSecret;
    }

    try {
      // 从数据库读取 admin 用户的 jwt_secret
      // Read jwt_secret from admin user in database
      const systemUser = UserRepository.getSystemUser();
      if (systemUser && systemUser.jwt_secret) {
        this.jwtSecret = systemUser.jwt_secret;
        return this.jwtSecret;
      }

      // 生成新的 secret 并保存到 admin 用户
      // Generate new secret and save to admin user
      if (systemUser) {
        const newSecret = nativeGenerateSecretKey();
        UserRepository.updateJwtSecret(systemUser.id, newSecret);
        this.jwtSecret = newSecret;
        return this.jwtSecret;
      }

      // Fallback: 如果 admin 用户不存在(不应该发生)
      console.warn('[AuthService] System WebUI user not found, using temporary secret');
      this.jwtSecret = nativeGenerateSecretKey();
      return this.jwtSecret;
    } catch (error) {
      console.error('Failed to get/save JWT secret:', error);
      this.jwtSecret = nativeGenerateSecretKey();
      return this.jwtSecret;
    }
  }

  /**
   * 通过旋转密钥的方式让所有现有 Token 失效
   * Rotate the JWT secret to invalidate all existing tokens
   */
  public static invalidateAllTokens(): void {
    try {
      const systemUser = UserRepository.getSystemUser();
      if (!systemUser) {
        console.warn('[AuthService] System WebUI user not found, cannot invalidate tokens');
        return;
      }

      const newSecret = nativeGenerateSecretKey();
      UserRepository.updateJwtSecret(systemUser.id, newSecret);
      this.jwtSecret = newSecret;
    } catch (error) {
      console.error('Failed to invalidate tokens:', error);
    }
  }

  /**
   * 使用 argon2 进行密码哈希（新密码均使用 argon2，旧 bcrypt 哈希仍可验证）
   * Hash password using argon2 (new passwords use argon2; legacy bcrypt hashes remain verifiable)
   */
  public static hashPassword(password: string): Promise<string> {
    return nativeHashPassword(password);
  }

  /**
   * 验证密码是否与存储的哈希匹配（自动识别 argon2 / bcrypt 格式）
   * Verify whether the password matches the stored hash (auto-detects argon2 / bcrypt format)
   */
  public static verifyPassword(password: string, hash: string): Promise<boolean> {
    return nativeVerifyPassword(password, hash);
  }

  /**
   * 生成 WebUI 使用的标准会话 Token
   * Generate standard WebUI session token
   */
  public static generateToken(user: Pick<AuthUser, 'id' | 'username'>): string {
    return nativeGenerateToken({ userId: user.id, username: user.username }, this.getJwtSecret(), this.TOKEN_EXPIRY);
  }

  /**
   * 验证 WebUI 会话 Token 是否有效
   * Verify standard WebUI session token validity
   */
  public static verifyToken(token: string): TokenPayload | null {
    // 先检查黑名单 / Check blacklist first
    if (this.isTokenBlacklisted(token)) {
      return null;
    }

    const decoded = nativeVerifyJwt(token, this.getJwtSecret());
    if (!decoded) {
      return null;
    }

    return {
      userId: String(decoded.userId),
      username: decoded.username,
    };
  }

  /**
   * 验证 WebSocket Token
   * Verify WebSocket token
   *
   * 复用 Web 登录 token (audience: aionui-webui)
   *
   * @param token - JWT token string
   * @returns Token payload if valid, null otherwise
   */
  public static verifyWebSocketToken(token: string): TokenPayload | null {
    // 先检查黑名单 / Check blacklist first
    if (this.isTokenBlacklisted(token)) {
      return null;
    }

    const decoded = nativeVerifyJwt(token, this.getJwtSecret());
    if (!decoded) {
      return null;
    }

    return {
      userId: String(decoded.userId),
      username: decoded.username,
    };
  }

  /**
   * 刷新会话 Token（不检查原 Token 是否过期）
   * Refresh a session token without enforcing expiry check
   */
  public static refreshToken(token: string): string | null {
    const decoded = this.verifyToken(token);
    if (!decoded) {
      return null;
    }

    return this.generateToken({
      id: String(decoded.userId),
      username: decoded.username,
    });
  }

  /**
   * 生成符合复杂度要求的随机密码
   * Generate a random password with required complexity
   */
  public static generateRandomPassword(): string {
    return nativeGenerateRandomPassword();
  }

  /**
   * 生成初始引导时使用的随机凭证
   * Generate random credentials for initial bootstrap
   */
  public static generateUserCredentials(): UserCredentials {
    return nativeGenerateUserCredentials();
  }

  /**
   * 校验密码强度并返回错误提示（简化版，适用于本地 WebUI）
   * Validate password strength (simplified for local WebUI)
   */
  public static validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    return nativeValidatePasswordStrength(password);
  }

  /**
   * 校验用户名是否符合格式要求
   * Validate username format requirements
   */
  public static validateUsername(username: string): {
    isValid: boolean;
    errors: string[];
  } {
    return nativeValidateUsername(username);
  }

  /**
   * 生成高强度的会话 ID
   * Generate a high-entropy session identifier
   */
  public static generateSessionId(): string {
    return nativeGenerateSessionId();
  }

  /**
   * 常量时间比较，降低时序攻击风险
   * Perform constant-time comparison to mitigate timing attacks
   */
  public static async constantTimeVerify(provided: string, expected: string, hashProvided = false): Promise<boolean> {
    // 强制执行固定时间对比 / Ensure constant-time comparison routine
    const start = process.hrtime.bigint();

    let result: boolean;
    if (hashProvided) {
      result = await nativeVerifyPassword(provided, expected);
    } else {
      result = nativeConstantTimeCompare(provided, expected);
    }

    // Add minimum delay to prevent timing attacks
    const elapsed = process.hrtime.bigint() - start;
    const minDelay = BigInt(50_000_000); // 50ms in nanoseconds
    if (elapsed < minDelay) {
      const delayMs = Number((minDelay - elapsed) / BigInt(1_000_000));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return result;
  }
}

export default AuthService;
