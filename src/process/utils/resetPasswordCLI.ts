/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reset password CLI utility for packaged applications
 * 打包应用的密码重置命令行工具
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDataPath } from '@process/utils';
import { closeDatabase, getDatabase } from '@process/services/database/export';
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
  info: (msg: string) => console.log(`${colors.blue}i${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}OK${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}ERR${colors.reset} ${msg}`),
  warning: (msg: string) => console.log(`${colors.yellow}WARN${colors.reset} ${msg}`),
  highlight: (msg: string) => console.log(`${colors.cyan}${colors.bright}${msg}${colors.reset}`),
};

const hashPasswordAsync = (password: string, saltRounds: number): Promise<string> =>
  new Promise((resolve, reject) => {
    bcrypt.hash(password, saltRounds, (error, hash) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(hash);
    });
  });

// Hash password using bcrypt
// 使用 bcrypt 哈希密码
async function hashPassword(password: string): Promise<string> {
  return await hashPasswordAsync(password, 10);
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

export function resolveResetPasswordUsername(argv: string[]): string {
  const resetPasswordIndex = argv.indexOf('--resetpass');
  if (resetPasswordIndex === -1) {
    return 'admin';
  }

  const argsAfterCommand = argv.slice(resetPasswordIndex + 1);
  return argsAfterCommand.find((arg) => !arg.startsWith('--')) || 'admin';
}

/**
 * Reset password for a user (CLI mode, works in packaged apps)
 * 重置用户密码（CLI模式,在打包应用中可用）
 *
 * @param username - Username to reset password for
 */
export async function resetPasswordCLI(username: string): Promise<void> {
  try {
    log.info('Starting password reset...');
    log.info(`Target user: ${username}`);

    // Get database path using the same logic as the main app
    const dbPath = path.join(getDataPath(), 'aionui.db');
    log.info(`Database path: ${dbPath}`);

    const db = await getDatabase();
    const hasUsersResult = db.hasUsers();

    if (!hasUsersResult.success) {
      throw new Error(hasUsersResult.error || 'Failed to check database users');
    }

    if (!hasUsersResult.data) {
      log.error('Database is not initialized yet');
      log.info('');
      log.info('Please run AionUi at least once to initialize the database:');
      log.info('  aionui --webui');
      log.info('');
      log.info('Then you can reset the password using:');
      log.info('  aionui --resetpass <username>');
      process.exit(1);
    }

    const userResult = db.getUserByUsername(username);
    if (!userResult.success) {
      throw new Error(userResult.error || `Failed to query user '${username}'`);
    }

    const user = userResult.data;
    if (!user) {
      log.error(`User '${username}' not found in database`);
      log.info('');
      log.info('Available users:');

      const allUsersResult = db.getAllUsers();
      if (!allUsersResult.success) {
        throw new Error(allUsersResult.error || 'Failed to list users');
      }

      const allUsers = allUsersResult.data;
      if (allUsers.length === 0) {
        log.info('  (no users found)');
      } else {
        allUsers.forEach((entry) => log.info(`  - ${entry.username}`));
      }
      process.exit(1);
    }

    log.info(`Found user: ${user.username} (ID: ${user.id})`);

    // Generate new password
    const newPassword = generatePassword();
    const hashedPassword = await hashPassword(newPassword);

    const updatePasswordResult = db.updateUserPassword(user.id, hashedPassword);
    if (!updatePasswordResult.success) {
      throw new Error(updatePasswordResult.error || 'Failed to update password');
    }

    const newJwtSecret = crypto.randomBytes(64).toString('hex');
    const updateJwtSecretResult = db.updateUserJwtSecret(user.id, newJwtSecret);
    if (!updateJwtSecretResult.success) {
      throw new Error(updateJwtSecretResult.error || 'Failed to update JWT secret');
    }

    // Display result
    console.log('');
    log.success('Password reset successfully!');
    console.log('');
    log.highlight('========================================');
    log.highlight(`  Username: ${user.username}`);
    log.highlight(`  New Password: ${newPassword}`);
    log.highlight('========================================');
    console.log('');
    log.warning('JWT secret has been rotated');
    log.warning('All previous tokens are now invalid');
    console.log('');
    log.info('Next steps:');
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
    closeDatabase();
  }
}
