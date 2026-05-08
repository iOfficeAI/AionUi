/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reset password CLI utility for packaged applications
 * 打包应用的密码重置命令行工具
 */

import { app } from 'electron';
import { resetPassword } from '@aionui/web-host';
import { getDataPath } from './utils';

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
 * Backed by @aionui/web-host resetPassword (UC-3).
 */
export async function resetPasswordCLI(username: string): Promise<void> {
  log.info(`Target user: ${username}`);

  try {
    const newPassword = await resetPassword({
      app: {
        version: app.getVersion(),
        isPackaged: app.isPackaged,
        resourcesPath: app.getAppPath(),
        // webui.config.json must live alongside the backend's SQLite DB so
        // Electron-launched WebUI reads the same auth state whether you change
        // the password via `--resetpass`, the settings toggle, or the browser.
        // getDataPath() returns the CLI-safe symlink (~/.aionui[-dev]) on macOS.
        userDataPath: getDataPath(),
      },
    });
    log.success('Password reset successfully.');
    log.info('New password:');
    log.highlight(newPassword);
    log.info('');
    log.warning('Please change this password after next login.');
  } catch (error) {
    log.error(error instanceof Error ? error.message : 'Password reset failed');
    process.exit(1);
  }
}
