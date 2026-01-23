/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Add user CLI utility for packaged applications
 * 打包应用的添加用户命令行工具
 */

import crypto from 'crypto';
import type Database from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { getDataPath, ensureDirectory } from '@process/utils';
import path from 'path';

// 颜色输出 / Color output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  highlight: (msg: string) => console.log(`${colors.cyan}${colors.bright}${msg}${colors.reset}`),
};

// Hash password using bcrypt
// 使用 bcrypt 哈希密码
async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

// 生成随机密码 / Generate random password
function generatePassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export interface AddUserOptions {
  username: string;
  password?: string;
  email?: string;
}

/**
 * Add a new user (CLI mode, works in packaged apps)
 * 添加新用户（CLI模式,在打包应用中可用）
 *
 * @param options - User creation options
 */
export async function addUserCLI(options: AddUserOptions): Promise<void> {
  let db: Database.Database | null = null;

  try {
    log.info('Starting user creation...');
    log.info(`Username: ${options.username}`);
    if (options.email) {
      log.info(`Email: ${options.email}`);
    }

    // Get database path using the same logic as the main app
    const dbPath = path.join(getDataPath(), 'aionui.db');
    log.info(`Database path: ${dbPath}`);

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    ensureDirectory(dir);

    // Connect to database
    db = new BetterSqlite3(dbPath);

    // Check if users table exists
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get() as { name: string } | undefined;

    if (!tableExists) {
      log.error('Database is not initialized yet');
      log.info('');
      log.info('Please run AionUi at least once to initialize the database:');
      log.info('  aionui --webui');
      log.info('');
      log.info('Then you can add users using:');
      log.info('  aionui --adduser <username>');
      process.exit(1);
    }

    // Check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(options.username) as { id: string } | undefined;

    if (existingUser) {
      log.error(`User '${options.username}' already exists`);
      process.exit(1);
    }

    // Generate password if not provided
    const password = options.password || generatePassword();
    const passwordWasGenerated = !options.password;
    const hashedPassword = await hashPassword(password);

    // Generate user ID and JWT secret
    const userId = crypto.randomUUID();
    const jwtSecret = crypto.randomBytes(64).toString('hex');
    const now = Date.now();

    // Insert new user
    db.prepare(
      `
      INSERT INTO users (id, username, password_hash, email, jwt_secret, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(userId, options.username, hashedPassword, options.email || null, jwtSecret, now, now);

    // Display result
    console.log('');
    log.success('User created successfully!');
    console.log('');
    log.highlight('═══════════════════════════════════════');
    log.highlight(`  Username: ${options.username}`);
    log.highlight(`  Password: ${password}`);
    if (options.email) {
      log.highlight(`  Email: ${options.email}`);
    }
    log.highlight('═══════════════════════════════════════');
    console.log('');
    if (passwordWasGenerated) {
      log.warning('⚠ Password was auto-generated. Please save it securely.');
    }
    console.log('');
    log.info('💡 You can now login with these credentials at:');
    log.info('   aionui --webui');
    console.log('');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error: ${errorMessage}`);
    console.error(error);
    process.exit(1);
  } finally {
    // Close database connection
    if (db) {
      db.close();
    }
  }
}
