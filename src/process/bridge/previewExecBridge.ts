/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * HTML Preview __EXEC__ 协议的主进程执行器
 * Main process executor for HTML Preview __EXEC__ protocol
 *
 * 允许 HTML 预览页面通过 console.log('__EXEC__' + code) 在 Node.js 环境执行代码
 * Allows HTML preview pages to execute code in Node.js via console.log('__EXEC__' + code)
 *
 * 支持的操作（由 AI 生成代码，无需写死）：
 * - JSON 文件读写
 * - SQLite 增删改查
 * - 文件系统操作
 * - 任何 Node.js 可执行的代码
 */
export function initPreviewExecBridge(): void {
  ipcBridge.preview.exec.provider(async ({ code, workspace }) => {
    try {
      // 构建执行上下文，提供常用模块 / Build execution context with common modules
      const contextModules = {
        fs,
        path,
        workspace: workspace || process.cwd(),
        // 便捷方法：读写 JSON / Convenience: read/write JSON
        readJSON: (filePath: string) => {
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workspace || process.cwd(), filePath);
          return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        },
        writeJSON: (filePath: string, data: unknown) => {
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workspace || process.cwd(), filePath);
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');

          // 触发文件流更新，让预览面板感知变化 / Emit file stream update for preview panel
          try {
            ipcBridge.fileStream.contentUpdate.emit({
              filePath: fullPath,
              content: JSON.stringify(data, null, 2),
              workspace: workspace || process.cwd(),
              relativePath: path.relative(workspace || process.cwd(), fullPath),
              operation: 'write',
            });
          } catch { /* ignore emit errors */ }
        },
        readFile: (filePath: string) => {
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workspace || process.cwd(), filePath);
          return fs.readFileSync(fullPath, 'utf-8');
        },
        writeFile: (filePath: string, content: string) => {
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workspace || process.cwd(), filePath);
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullPath, content, 'utf-8');

          try {
            ipcBridge.fileStream.contentUpdate.emit({
              filePath: fullPath,
              content,
              workspace: workspace || process.cwd(),
              relativePath: path.relative(workspace || process.cwd(), fullPath),
              operation: 'write',
            });
          } catch { /* ignore emit errors */ }
        },
      };

      // 使用 AsyncFunction 执行代码，提供上下文变量
      // Use AsyncFunction to execute code with context variables
      const paramNames = Object.keys(contextModules);
      const paramValues = Object.values(contextModules);

      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      const fn = new Function(...paramNames, `return (async () => { ${code} })()`) as (...args: unknown[]) => Promise<unknown>;
      const result = await fn(...paramValues);

      return { success: true, result: result !== undefined ? result : null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[PreviewExec] Execution error:', errorMsg);
      return { success: false, error: errorMsg };
    }
  });
}
