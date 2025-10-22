/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import type { AuthUser } from '../repository/UserRepository';
import { UserRepository } from '../repository/UserRepository';
import { AUTH_CONFIG } from '../../config/constants';

interface TokenPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}

type RawTokenPayload = Omit<TokenPayload, 'userId'> & {
  userId: string | number;
};

interface UserCredentials {
  username: string;
  password: string;
  createdAt: number;
}

/**
 * 认证服务 - 提供密码哈希、Token 生成与验证等能力
 * Authentication Service - handles password hashing, token issuance, and validation
 */
export class AuthService {
  private static readonly SALT_ROUNDS = 12;
  private static jwtSecret: string | null = null;
  private static readonly TOKEN_EXPIRY = AUTH_CONFIG.TOKEN.SESSION_EXPIRY;

  /**
   * 生成高强度的随机密钥
   * Generate a high-entropy random secret key
   */
  private static generateSecretKey(): string {
    // 始终使用随机数确保密钥不可预测 / Always rely on randomness for unpredictability
    return crypto.randomBytes(64).toString('hex');
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
      const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
      if (adminUser && adminUser.jwt_secret) {
        this.jwtSecret = adminUser.jwt_secret;
        return this.jwtSecret;
      }

      // 生成新的 secret 并保存到 admin 用户
      // Generate new secret and save to admin user
      if (adminUser) {
        const newSecret = this.generateSecretKey();
        UserRepository.updateJwtSecret(adminUser.id, newSecret);
        this.jwtSecret = newSecret;
        return this.jwtSecret;
      }

      // Fallback: 如果 admin 用户不存在(不应该发生)
      console.warn('[AuthService] Admin user not found, using temporary secret');
      this.jwtSecret = this.generateSecretKey();
      return this.jwtSecret;
    } catch (error) {
      console.error('Failed to get/save JWT secret:', error);
      this.jwtSecret = this.generateSecretKey();
      return this.jwtSecret;
    }
  }

  /**
   * 通过旋转密钥的方式让所有现有 Token 失效
   * Rotate the JWT secret to invalidate all existing tokens
   */
  public static invalidateAllTokens(): void {
    try {
      const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
      if (!adminUser) {
        console.warn('[AuthService] Admin user not found, cannot invalidate tokens');
        return;
      }

      const newSecret = this.generateSecretKey();
      UserRepository.updateJwtSecret(adminUser.id, newSecret);
      this.jwtSecret = newSecret;
    } catch (error) {
      console.error('Failed to invalidate tokens:', error);
    }
  }

  /**
   * 使用 bcrypt 进行密码哈希
   * Hash password using bcrypt
   */
  public static hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * 验证密码是否与存储的哈希匹配
   * Verify whether the password matches the stored hash
   */
  public static verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * 生成 WebUI 使用的标准会话 Token
   * Generate standard WebUI session token
   */
  public static generateToken(user: Pick<AuthUser, 'id' | 'username'>): string {
    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
    };

    return jwt.sign(payload, this.getJwtSecret(), {
      expiresIn: this.TOKEN_EXPIRY,
      issuer: 'aionui',
      audience: 'aionui-webui',
    });
  }

  /**
   * 将数据库中的用户 ID 统一转换为字符串格式
   * Normalize database user id into a consistent string
   *
   * Note: In new architecture, all user IDs are already strings (e.g., "auth_1234567890_abc")
   * This function simply ensures the ID is a string type.
   * 注意：在新架构中，所有用户 ID 已经是字符串格式（如 "auth_1234567890_abc"）
   * 此函数仅确保 ID 是字符串类型。
   */
  private static normalizeUserId(rawId: string | number): string {
    return String(rawId);
  }

  /**
   * 验证 WebUI 会话 Token 是否有效
   * Verify standard WebUI session token validity
   */
  public static verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.getJwtSecret(), {
        issuer: 'aionui',
        audience: 'aionui-webui',
      }) as RawTokenPayload;

      return {
        ...decoded,
        userId: this.normalizeUserId(decoded.userId),
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError || error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
        return null;
      }
      console.error('Token verification failed:', error);
      return null;
    }
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
    try {
      const decoded = jwt.verify(token, this.getJwtSecret(), {
        issuer: 'aionui',
        audience: 'aionui-webui', // 使用与 Web 登录相同的 audience
      }) as RawTokenPayload;

      return {
        ...decoded,
        userId: this.normalizeUserId(decoded.userId),
      };
    } catch (error) {
      console.error('WebSocket token verification failed:', error);
      return null;
    }
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

    // 刷新时不重复检查有效期 / Skip expiry check when refreshing token
    return this.generateToken({
      id: this.normalizeUserId(decoded.userId),
      username: decoded.username,
    });
  }

  /**
   * 生成符合复杂度要求的随机密码
   * Generate a random password with required complexity
   */
  public static generateRandomPassword(): string {
    const baseLength = 12;
    const lengthVariance = 5;
    const passwordLength = baseLength + crypto.randomInt(0, lengthVariance);

    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const special = '!@#$%^&*';
    const allChars = lowercase + uppercase + digits + special;

    const ensureCategory = (chars: string) => chars[crypto.randomInt(0, chars.length)];

    const passwordChars: string[] = [ensureCategory(lowercase), ensureCategory(uppercase), ensureCategory(digits), ensureCategory(special)];

    const remainingLength = Math.max(passwordLength - passwordChars.length, 0);
    for (let i = 0; i < remainingLength; i++) {
      const index = crypto.randomInt(0, allChars.length);
      passwordChars.push(allChars[index]);
    }

    // 打乱字符顺序，避免类型排列固定 / Shuffle to avoid predictable category order
    for (let i = passwordChars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
    }

    return passwordChars.join('');
  }

  /**
   * 生成初始引导时使用的随机凭证
   * Generate random credentials for initial bootstrap
   */
  public static generateUserCredentials(): UserCredentials {
    // 用户名长度控制在 6-8 位，便于记忆 / Username length fixed to 6-8 chars for memorability
    const usernameLength = crypto.randomInt(6, 9); // 6-8 chars
    const usernameChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let username = '';
    for (let i = 0; i < usernameLength; i++) {
      username += usernameChars[crypto.randomInt(0, usernameChars.length)];
    }

    return {
      username,
      password: this.generateRandomPassword(),
      createdAt: Date.now(),
    };
  }

  /**
   * 校验密码强度并返回错误提示
   * Validate password strength and return messages
   */
  public static validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (password.length > 128) {
      errors.push('Password must be less than 128 characters long');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // 检查重复字符或常见弱口令模式 / Guard against repeats or common patterns
    if (/(.)\1{2,}/.test(password)) {
      errors.push('Password should not contain repeated characters');
    }

    if (/123|abc|qwerty|password/i.test(password)) {
      errors.push('Password should not contain common patterns');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * 校验用户名是否符合格式要求
   * Validate username format requirements
   */
  public static validateUsername(username: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (username.length < 3) {
      errors.push('Username must be at least 3 characters long');
    }

    if (username.length > 32) {
      errors.push('Username must be less than 32 characters long');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.push('Username can only contain letters, numbers, hyphens, and underscores');
    }

    if (/^[_-]|[_-]$/.test(username)) {
      errors.push('Username cannot start or end with hyphen or underscore');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * 生成高强度的会话 ID
   * Generate a high-entropy session identifier
   */
  public static generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
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
      result = await bcrypt.compare(provided, expected);
    } else {
      result = crypto.timingSafeEqual(Buffer.from(provided.padEnd(expected.length, '0')), Buffer.from(expected.padEnd(provided.length, '0')));
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
