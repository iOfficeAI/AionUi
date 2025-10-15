/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 启动 WebUI 命令 / Start WebUI Command
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveDbPath } from '../database.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

export const startCommand = {
  name: 'start',
  description: 'Start AionUi WebUI',

  async action(context, _args) {
    try {
      // 确保存储目录存在 / Ensure storage directory exists
      const storageRoot = path.join(PROJECT_ROOT, '.aionui');
      if (!fs.existsSync(storageRoot)) {
        fs.mkdirSync(storageRoot, { recursive: true });
      }

      const dbPath = resolveDbPath();

      // 设置环境变量 / Set environment variables
      const env = {
        ...process.env,
        AIONUI_DB_PATH: dbPath,
      };

      // 检查是否在项目目录 / Check if in project directory
      const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        context.ui.addOutput({
          type: 'error',
          text: 'Error: Cannot find package.json. Make sure you are in the AionUi project directory.',
        });
        return;
      }

      context.ui.addOutput({
        type: 'success',
        text: '🚀 Starting AionUi WebUI...',
      });

      context.ui.addOutput({
        type: 'info',
        text: `📁 Project root: ${PROJECT_ROOT}`,
      });

      context.ui.addOutput({
        type: 'info',
        text: `💾 Database: ${dbPath}`,
      });

      // Windows 需要使用 cmd.exe 或 npm.cmd / Windows requires cmd.exe or npm.cmd
      const isWindows = process.platform === 'win32';
      const npmCommand = isWindows ? 'npm.cmd' : 'npm';

      // 启动 WebUI 开发服务器 / Launch WebUI dev server
      const child = spawn(npmCommand, ['run', 'start:webui'], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: isWindows ? true : false,
        env,
      });

      child.on('error', (error) => {
        context.ui.addOutput({
          type: 'error',
          text: `Failed to start WebUI: ${error.message}`,
        });
        context.ui.addOutput({
          type: 'info',
          text: 'Try running manually: npm run start:webui',
        });
        process.exit(1);
      });

      child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          context.ui.addOutput({
            type: 'error',
            text: `WebUI exited with code ${code}`,
          });
          process.exit(code);
        }
      });

      // 成功启动，退出 CLI / Successfully started, exit CLI
      context.ui.exit();
    } catch (error) {
      context.ui.addOutput({ type: 'error', text: `Error starting WebUI: ${error.message}` });
    }
  },
};
