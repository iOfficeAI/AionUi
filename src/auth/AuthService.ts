/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { User } from '../database';

interface TokenPayload {
  userId: number;
  username: string;
  iat?: number;
  exp?: number;
}

interface UserCredentials {
  username: string;
  password: string;
  createdAt: number;
}

export class AuthService {
  private static readonly SALT_ROUNDS = 12;
  private static readonly JWT_SECRET = process.env.JWT_SECRET || this.generateSecretKey();
  private static readonly TOKEN_EXPIRY = '30d'; // 30 days

  private static generateSecretKey(): string {
    // Generate a strong secret key if not provided
    return crypto.randomBytes(64).toString('hex');
  }

  // Password hashing with strong security
  public static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // JWT token operations
  public static generateToken(user: Pick<User, 'id' | 'username'>): string {
    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
    };

    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.TOKEN_EXPIRY,
      issuer: 'aionui',
      audience: 'aionui-webui',
    });
  }

  public static verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET, {
        issuer: 'aionui',
        audience: 'aionui-webui',
      }) as TokenPayload;

      return decoded;
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }

  public static refreshToken(token: string): string | null {
    const decoded = this.verifyToken(token);
    if (!decoded) {
      return null;
    }

    // Generate new token without expiry check (since we're refreshing)
    return this.generateToken({
      id: decoded.userId,
      username: decoded.username,
    });
  }

  // Generate secure random credentials for initial setup
  public static generateUserCredentials(): UserCredentials {
    // Generate random username (6-8 characters, alphanumeric)
    const usernameLength = Math.floor(Math.random() * 3) + 6; // 6-8 chars
    const usernameChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let username = '';
    for (let i = 0; i < usernameLength; i++) {
      username += usernameChars.charAt(Math.floor(Math.random() * usernameChars.length));
    }

    // Generate random password (12-16 characters with mixed case, numbers, and symbols)
    const passwordLength = Math.floor(Math.random() * 5) + 12; // 12-16 chars
    const passwordChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < passwordLength; i++) {
      password += passwordChars.charAt(Math.floor(Math.random() * passwordChars.length));
    }

    return {
      username,
      password,
      createdAt: Date.now(),
    };
  }

  // Password strength validation
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

    // Check for common patterns
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

  // Username validation
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

  // Generate secure session ID
  public static generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Rate limiting helpers
  public static createRateLimitKey(ip: string, action: string): string {
    return `ratelimit:${action}:${ip}`;
  }

  // Timing attack protection
  public static async constantTimeVerify(provided: string, expected: string, hashProvided = false): Promise<boolean> {
    // Ensure constant time comparison
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
