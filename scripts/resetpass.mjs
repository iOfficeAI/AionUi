#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 重置密码脚本 / Reset Password Script
 *
 * Usage: node scripts/resetpass.mjs [username]
 * Default username: admin
 */

import crypto from 'crypto';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import os from 'os';
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
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  highlight: (msg) => console.log(`${colors.cyan}${colors.bright}${msg}${colors.reset}`),
};

// 生成随机密码 / Generate random password
function generatePassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// 获取 Electron userData 路径 / Get Electron userData path
function getElectronUserDataPath() {
  const home = os.homedir();
  const platform = process.platform;
  const appName = 'AionUi';

  switch (platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', appName);
    case 'win32':
      return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName);
    case 'linux':
      return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), appName);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// 获取数据库路径 / Get database path
function getDbPath() {
  // 从环境变量读取 / Read from environment variable
  if (process.env.AIONUI_DB_PATH) {
    return process.env.AIONUI_DB_PATH;
  }

  // 默认路径: userData/aionui/aionui.db
  // Default path: userData/aionui/aionui.db
  const userDataPath = getElectronUserDataPath();
  return path.join(userDataPath, 'aionui', 'aionui.db');
}

async function resetPassword() {
  try {
    // 获取用户名参数 / Get username argument
    const username = process.argv[2] || 'admin';

    log.info('Starting password reset...');
    log.info(`Target user: ${username}`);

    // 连接数据库 / Connect to database
    const dbPath = getDbPath();
    log.info(`Database path: ${dbPath}`);

    const db = new Database(dbPath);

    // 查找用户 / Find user
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      log.error(`User '${username}' not found in database`);
      db.close();
      process.exit(1);
    }

    log.info(`Found user: ${user.username} (ID: ${user.id})`);

    // 生成新密码 / Generate new password
    const newPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码 / Update password
    const now = Date.now();
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashedPassword, now, user.id);

    // 生成并更新 JWT Secret / Generate and update JWT secret
    const newJwtSecret = crypto.randomBytes(64).toString('hex');
    db.prepare('UPDATE users SET jwt_secret = ?, updated_at = ? WHERE id = ?').run(newJwtSecret, now, user.id);

    db.close();

    // 显示结果 / Display result
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
  } catch (error) {
    log.error(`Error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// 运行脚本 / Run script
resetPassword();
