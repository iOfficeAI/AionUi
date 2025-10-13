/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 命令处理逻辑 / Command handling logic
 */

import { loadDatabase, saveDatabase, generatePassword, hashPassword } from './db.mjs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * 重置用户密码
 * Reset user password
 */
export async function resetPassword(username) {
  try {
    const db = loadDatabase();
    const user = db.users.find((u) => u.username === username);

    if (!user) {
      return {
        success: false,
        messages: [{ type: 'error', text: `User '${username}' not found` }],
      };
    }

    // 生成新密码 / Generate new password
    const newPassword = generatePassword();
    const hashedPassword = await hashPassword(newPassword);

    // 更新密码 / Update password
    user.password_hash = hashedPassword;

    // 清除该用户的所有会话 / Clear all user sessions
    db.sessions = db.sessions.filter((session) => session.user_id !== user.id);

    // 重新生成 JWT Secret，使所有旧 Token 立即失效
    // Regenerate JWT Secret to invalidate all old tokens
    const crypto = await import('crypto');
    const newJwtSecret = crypto.randomBytes(64).toString('hex');
    db.config['jwt_secret'] = newJwtSecret;

    saveDatabase(db);

    return {
      success: true,
      messages: [
        { type: 'success', text: 'Password reset successfully!' },
        { type: 'info', text: `Username: ${username}` },
        { type: 'info', text: `New Password: ${newPassword}` },
        { type: 'warning', text: 'All previous sessions have been invalidated' },
        { type: 'hint', text: 'Please save this password and login again!' },
      ],
    };
  } catch (error) {
    return {
      success: false,
      messages: [{ type: 'error', text: `Error: ${error.message}` }],
    };
  }
}

/**
 * 列出所有用户
 * List all users
 */
export function listUsers() {
  try {
    const db = loadDatabase();
    const messages = [{ type: 'info', text: `Found ${db.users.length} user(s):` }];

    db.users.forEach((user) => {
      const createdDate = new Date(user.created_at).toLocaleDateString();
      messages.push({
        type: 'plain',
        text: `  ${user.username} (ID: ${user.id}, Created: ${createdDate})`,
      });
    });

    return {
      success: true,
      messages,
      userCount: db.users.length,
    };
  } catch (error) {
    return {
      success: false,
      messages: [{ type: 'error', text: `Error: ${error.message}` }],
    };
  }
}

/**
 * 启动 WebUI 开发服务器
 * Start WebUI development server
 */
export function startWebUI() {
  try {
    // 在项目根目录运行 npm run start:webui
    // Run npm run start:webui in project root directory
    const child = spawn('npm', ['run', 'start:webui'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit', // 直接继承父进程的 stdio，这样可以看到完整输出
      shell: true,
    });

    child.on('error', (error) => {
      console.error(`Failed to start WebUI: ${error.message}`);
      process.exit(1);
    });

    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        process.exit(code);
      }
    });

    // 由于启动是异步的，不返回消息，直接让子进程接管
    // Since startup is async, don't return messages, let child process take over
    return null;
  } catch (error) {
    return {
      success: false,
      messages: [{ type: 'error', text: `Error starting WebUI: ${error.message}` }],
    };
  }
}

/**
 * 显示帮助信息
 * Show help information
 */
export function showHelp() {
  return {
    success: true,
    messages: [
      { type: 'info', text: 'Available commands:' },
      { type: 'plain', text: '  /start                - Start AionUi WebUI (npm run start:webui)' },
      { type: 'plain', text: '  /resetpass <username> - Reset user password' },
      { type: 'plain', text: '  /users                - List all users' },
      { type: 'plain', text: '  /help                 - Show this help' },
      { type: 'plain', text: '  /clear                - Clear screen' },
    ],
  };
}

/**
 * 获取用户数量
 * Get user count
 */
export function getUserCount() {
  try {
    const db = loadDatabase();
    return db.users.length;
  } catch (error) {
    return 0;
  }
}
