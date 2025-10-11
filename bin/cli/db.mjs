/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 数据库操作模块 / Database operations module
 */

import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * 获取数据库文件路径
 * Get database file path
 */
export function getDbPath() {
  const homeDir = os.homedir();
  return path.join(homeDir, 'Library', 'Application Support', 'AionUi', 'aion.json');
}

/**
 * 从磁盘加载数据库
 * Load database from disk
 */
export function loadDatabase() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error('❌ Database not found. Please start AionUI first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

/**
 * 保存数据库到磁盘
 * Save database to disk
 */
export function saveDatabase(data) {
  const dbPath = getDbPath();
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 生成随机密码
 * Generate random password
 */
export function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

/**
 * 使用 bcrypt 哈希密码
 * Hash password using bcrypt
 */
export async function hashPassword(password) {
  const bcrypt = await import('bcrypt');
  return bcrypt.hash(password, 12);
}
