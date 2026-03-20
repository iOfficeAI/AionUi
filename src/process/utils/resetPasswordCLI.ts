/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reset password CLI utility for packaged applications
 * 打包应用的密码重置命令行工具
 */

import type Database from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import {
  hashPassword as nativeHashPassword,
  generateRandomPassword as nativeGenerateRandomPassword,
  generateSecretKey as nativeGenerateSecretKey,
} from '@aionui/native';
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

/**
 * Reset password for a user (CLI mode, works in packaged apps)
 * 重置用户密码（CLI模式,在打包应用中可用）
 *
 * @param username - Username to reset password for
 */
export async function resetPasswordCLI(username: string): Promise<void> {
  let db: Database.Database | null = null;

  try {
    log.info('Starting password reset...');
    log.info(`Target user: ${username}`);

    // Get database path using the same logic as the main app
    const dbPath = path.join(getDataPath(), 'aionui.db');
    log.info(`Database path: ${dbPath}`);

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    ensureDirectory(dir);

    // Connect to database
    db = new BetterSqlite3(dbPath);

    // Check if users table exists
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get() as
      | { name: string }
      | undefined;

    if (!tableExists) {
      log.error('Database is not initialized yet');
      log.info('');
      log.info('Please run AionUi at least once to initialize the database:');
      log.info('  aionui --webui');
      log.info('');
      log.info('Then you can reset the password using:');
      log.info('  aionui --resetpass <username>');
      process.exit(1);
    }

    // Find user
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
      | { id: string; username: string; password_hash: string; jwt_secret: string | null }
      | undefined;

    if (!user) {
      log.error(`User '${username}' not found in database`);
      log.info('');
      log.info('Available users:');
      const allUsers = db.prepare('SELECT username FROM users').all() as { username: string }[];
      if (allUsers.length === 0) {
        log.info('  (no users found)');
      } else {
        allUsers.forEach((u) => log.info(`  - ${u.username}`));
      }
      process.exit(1);
    }

    log.info(`Found user: ${user.username} (ID: ${user.id})`);

    // Generate new password using Rust native addon
    const newPassword = nativeGenerateRandomPassword();
    const hashedPassword = await nativeHashPassword(newPassword);

    // Update password and rotate JWT secret in a single query
    const now = Date.now();
    const newJwtSecret = nativeGenerateSecretKey();
    db.prepare('UPDATE users SET password_hash = ?, jwt_secret = ?, updated_at = ? WHERE id = ?').run(
      hashedPassword,
      newJwtSecret,
      now,
      user.id
    );

    // Display result
    console.log('');
    log.success('Password reset successfully!');
    console.log('');
    log.highlight('═══════════════════════════════════════');
    log.highlight(`  Username: ${user.username}`);
    log.highlight(`  New Password: ${newPassword}`);
    log.highlight('═══════════════════════════════════════');
    console.log('');
    log.warning('⚠ JWT secret has been rotated');
    log.warning('⚠ All previous tokens are now invalid');
    console.log('');
    log.info('💡 Next steps:');
    log.info('   1. Refresh your browser (Cmd+R or Ctrl+R)');
    log.info('   2. You will be redirected to login page');
    log.info('   3. Login with the new password above');
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
