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

      // 启动 WebUI 开发服务器 / Launch WebUI dev server
      const child = spawn('npm', ['run', 'start:webui'], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: true,
        env,
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

      // 成功启动，退出 CLI / Successfully started, exit CLI
      context.ui.exit();
    } catch (error) {
      context.ui.addOutput({ type: 'error', text: `Error starting WebUI: ${error.message}` });
    }
  },
};
