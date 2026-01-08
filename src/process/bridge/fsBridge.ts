/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIONUI_TIMESTAMP_SEPARATOR } from '@/common/constants';
import fs from 'fs/promises';
import path from 'path';
import https from 'node:https';
import http from 'node:http';
import { app } from 'electron';
import { ipcBridge } from '../../common';
import { getSystemDir, getAssistantsDir } from '../initStorage';
import { readDirectoryRecursive } from '../utils';

export function initFsBridge(): void {
  ipcBridge.fs.getFilesByDir.provider(async ({ dir }) => {
    const tree = await readDirectoryRecursive(dir);
    return tree ? [tree] : [];
  });

  ipcBridge.fs.getImageBase64.provider(async ({ path: filePath }) => {
    try {
      const ext = (path.extname(filePath) || '').toLowerCase().replace(/^\./, '');
      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        bmp: 'image/bmp',
        svg: 'image/svg+xml',
        ico: 'image/x-icon',
        tif: 'image/tiff',
        tiff: 'image/tiff',
        avif: 'image/avif',
      };
      const mime = mimeMap[ext] || 'application/octet-stream';
      const base64 = await fs.readFile(filePath, { encoding: 'base64' });
      return `data:${mime};base64,${base64}`;
    } catch (error) {
      // Return a placeholder data URL instead of throwing
      return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4=';
    }
  });

  // 下载远程图片并限制协议/重定向次数 / Download remote resource with protocol & redirect guard
  const downloadRemoteBuffer = (targetUrl: string, redirectCount = 0): Promise<{ buffer: Buffer; contentType?: string }> => {
    const allowedProtocols = new Set(['http:', 'https:']);
    const parsedUrl = new URL(targetUrl);
    if (!allowedProtocols.has(parsedUrl.protocol)) {
      return Promise.reject(new Error('Unsupported protocol'));
    }

    // 仅允许白名单域名，避免随意访问 / Restrict to a whitelist of hosts for safety
    const allowedHosts = ['github.com', 'raw.githubusercontent.com', 'contrib.rocks', 'img.shields.io'];
    const isAllowedHost = allowedHosts.some((host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`));
    if (!isAllowedHost) {
      return Promise.reject(new Error('URL not allowed for remote fetch'));
    }

    return new Promise((resolve, reject) => {
      try {
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const request = client.get(
          targetUrl,
          {
            headers: {
              'User-Agent': 'AionUI-Preview',
              Referer: 'https://github.com/iOfficeAI/AionUi',
            },
          },
          (response) => {
            const { statusCode = 0, headers } = response;

            if (statusCode >= 300 && statusCode < 400 && headers.location && redirectCount < 5) {
              const redirectUrl = new URL(headers.location, targetUrl).toString();
              response.resume();
              resolve(downloadRemoteBuffer(redirectUrl, redirectCount + 1));
              return;
            }

            if (statusCode >= 400) {
              response.resume();
              reject(new Error(`Failed to fetch image: HTTP ${statusCode}`));
              return;
            }

            const chunks: Buffer[] = [];
            let receivedBytes = 0;
            const MAX_BYTES = 5 * 1024 * 1024; // 5MB limit

            response.on('data', (chunk: Buffer) => {
              receivedBytes += chunk.length;
              if (receivedBytes > MAX_BYTES) {
                response.destroy(new Error('Remote image exceeds size limit (5MB)'));
                return;
              }
              chunks.push(chunk);
            });

            response.on('end', () => {
              resolve({ buffer: Buffer.concat(chunks), contentType: headers['content-type'] });
            });
            response.on('error', (error) => reject(error));
          }
        );

        request.setTimeout(15000, () => {
          request.destroy(new Error('Remote image request timed out'));
        });

        request.on('error', (error) => reject(error));
      } catch (error) {
        reject(error);
      }
    });
  };

  // 通过桥接层拉取远程图片并转成 base64 / Fetch remote image via bridge and return base64
  ipcBridge.fs.fetchRemoteImage.provider(async ({ url }) => {
    const { buffer, contentType } = await downloadRemoteBuffer(url);
    const base64 = buffer.toString('base64');
    return `data:${contentType || 'application/octet-stream'};base64,${base64}`;
  });

  // 创建临时文件 / Create temporary file on disk
  ipcBridge.fs.createTempFile.provider(async ({ fileName }) => {
    try {
      const { cacheDir } = getSystemDir();
      const tempDir = path.join(cacheDir, 'temp');

      // 确保临时目录存在 / Ensure temp directory exists
      await fs.mkdir(tempDir, { recursive: true });

      // 使用原文件名，必要时清理非法字符 / Keep original name but sanitize illegal characters
      const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_');
      let tempFilePath = path.join(tempDir, safeFileName);

      // 如果冲突则追加时间戳后缀 / Append timestamp when duplicate exists
      const fileExists = await fs
        .access(tempFilePath)
        .then(() => true)
        .catch(() => false);

      if (fileExists) {
        const timestamp = Date.now();
        const ext = path.extname(safeFileName);
        const name = path.basename(safeFileName, ext);
        const tempFileName = `${name}${AIONUI_TIMESTAMP_SEPARATOR}${timestamp}${ext}`;
        tempFilePath = path.join(tempDir, tempFileName);
      }

      // 创建空文件作为占位 / Create empty placeholder file
      await fs.writeFile(tempFilePath, Buffer.alloc(0));

      return tempFilePath;
    } catch (error) {
      console.error('Failed to create temp file:', error);
      throw error;
    }
  });

  // 读取文件内容（UTF-8编码）/ Read file content (UTF-8 encoding)
  ipcBridge.fs.readFile.provider(async ({ path: filePath }) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      console.error('Failed to read file:', error);
      throw error;
    }
  });

  // 读取二进制文件为 ArrayBuffer / Read binary file as ArrayBuffer
  ipcBridge.fs.readFileBuffer.provider(async ({ path: filePath }) => {
    try {
      const buffer = await fs.readFile(filePath);
      // 将 Node.js Buffer 转换为 ArrayBuffer
      // Convert Node.js Buffer to ArrayBuffer
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch (error) {
      console.error('Failed to read file buffer:', error);
      throw error;
    }
  });

  // 写入文件
  ipcBridge.fs.writeFile.provider(async ({ path: filePath, data }) => {
    try {
      // 处理字符串类型 / Handle string type
      if (typeof data === 'string') {
        await fs.writeFile(filePath, data, 'utf-8');

        // 发送流式内容更新事件到预览面板（用于实时更新）
        // Send streaming content update to preview panel (for real-time updates)
        try {
          const pathSegments = filePath.split(path.sep);
          const fileName = pathSegments[pathSegments.length - 1];
          const workspace = pathSegments.slice(0, -1).join(path.sep);

          const eventData = {
            filePath: filePath,
            content: data,
            workspace: workspace,
            relativePath: fileName,
            operation: 'write' as const,
          };

          ipcBridge.fileStream.contentUpdate.emit(eventData);
        } catch (emitError) {
          console.error('[fsBridge] ❌ Failed to emit file stream update:', emitError);
        }

        return true;
      }

      // 处理 Uint8Array 在 IPC 传输中被序列化为对象的情况
      let bufferData;

      // 检查是否是被序列化的类型化数组（包含数字键的对象）
      if (data && typeof data === 'object' && data.constructor?.name === 'Object') {
        const keys = Object.keys(data);
        // 检查是否所有键都是数字字符串（类型化数组的特征）
        const isTypedArrayLike = keys.length > 0 && keys.every((key) => /^\d+$/.test(key));

        if (isTypedArrayLike) {
          // 确保值是数字数组
          const values = Object.values(data).map((v) => (typeof v === 'number' ? v : parseInt(v, 10)));
          bufferData = Buffer.from(values);
        } else {
          bufferData = data;
        }
      } else if (data instanceof Uint8Array) {
        bufferData = Buffer.from(data);
      } else if (Buffer.isBuffer(data)) {
        bufferData = data;
      } else {
        bufferData = data;
      }

      await fs.writeFile(filePath, bufferData);
      return true;
    } catch (error) {
      console.error('Failed to write file:', error);
      return false;
    }
  });

  // 获取文件元数据
  ipcBridge.fs.getFileMetadata.provider(async ({ path: filePath }) => {
    try {
      const stats = await fs.stat(filePath);
      return {
        name: path.basename(filePath),
        path: filePath,
        size: stats.size,
        type: '', // MIME type可以根据扩展名推断
        lastModified: stats.mtime.getTime(),
      };
    } catch (error) {
      console.error('Failed to get file metadata:', error);
      throw error;
    }
  });

  // 复制文件到工作空间
  ipcBridge.fs.copyFilesToWorkspace.provider(async ({ filePaths, workspace, sourceRoot }) => {
    try {
      const copiedFiles: string[] = [];
      const failedFiles: Array<{ path: string; error: string }> = [];

      // 确保工作空间目录存在 / Ensure workspace directory exists
      await fs.mkdir(workspace, { recursive: true });

      for (const filePath of filePaths) {
        try {
          let targetPath: string;

          if (sourceRoot) {
            // Preserve directory structure / 保留目录结构
            const relativePath = path.relative(sourceRoot, filePath);
            targetPath = path.join(workspace, relativePath);

            // Ensure parent directory exists / 确保父目录存在
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
          } else {
            // Flatten to root (legacy behavior) / 扁平化到根目录（旧行为）
            const fileName = path.basename(filePath);
            targetPath = path.join(workspace, fileName);
          }

          // 检查目标文件是否已存在
          const exists = await fs
            .access(targetPath)
            .then(() => true)
            .catch(() => false);

          let finalTargetPath = targetPath;
          if (exists) {
            // 如果文件已存在，添加时间戳后缀 / Append timestamp when target file already exists
            const timestamp = Date.now();
            const ext = path.extname(targetPath);
            const name = path.basename(targetPath, ext);
            // Construct new path in the same directory / 在同一目录下构建新路径
            const dir = path.dirname(targetPath);
            const newFileName = `${name}${AIONUI_TIMESTAMP_SEPARATOR}${timestamp}${ext}`;
            finalTargetPath = path.join(dir, newFileName);
          }

          await fs.copyFile(filePath, finalTargetPath);
          copiedFiles.push(finalTargetPath);
        } catch (error) {
          // 记录失败的文件路径与错误信息，前端可以用来提示用户 / Record failed file info so UI can warn user
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed to copy file ${filePath}:`, message);
          failedFiles.push({ path: filePath, error: message });
        }
      }

      // 只要存在失败文件就视作部分失败，并返回提示信息 / Mark operation as non-success if anything failed and provide hint text
      const success = failedFiles.length === 0;
      const msg = success ? undefined : 'Some files failed to copy';

      return {
        success,
        data: { copiedFiles, failedFiles },
        msg,
      };
    } catch (error) {
      console.error('Failed to copy files to workspace:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Delete file or directory on disk (删除磁盘上的文件或文件夹)
  ipcBridge.fs.removeEntry.provider(async ({ path: targetPath }) => {
    try {
      const stats = await fs.lstat(targetPath);
      if (stats.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true });
      } else {
        await fs.unlink(targetPath);

        // 发送流式删除事件到预览面板（用于关闭预览）
        // Send streaming delete event to preview panel (to close preview)
        try {
          const pathSegments = targetPath.split(path.sep);
          const fileName = pathSegments[pathSegments.length - 1];
          const workspace = pathSegments.slice(0, -1).join(path.sep);

          ipcBridge.fileStream.contentUpdate.emit({
            filePath: targetPath,
            content: '',
            workspace: workspace,
            relativePath: fileName,
            operation: 'delete',
          });
        } catch (emitError) {
          console.error('[fsBridge] Failed to emit file stream delete:', emitError);
        }
      }
      return { success: true };
    } catch (error) {
      console.error('Failed to remove entry:', error);
      return { success: false, msg: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Rename file or directory and return new path (重命名文件/文件夹并返回新路径)
  ipcBridge.fs.renameEntry.provider(async ({ path: targetPath, newName }) => {
    try {
      const directory = path.dirname(targetPath);
      const newPath = path.join(directory, newName);

      if (newPath === targetPath) {
        // Skip when the new name equals the original path (新旧路径一致时直接跳过)
        return { success: true, data: { newPath } };
      }

      const exists = await fs
        .access(newPath)
        .then(() => true)
        .catch(() => false);

      if (exists) {
        // Avoid overwriting existing targets (避免覆盖已存在的目标文件)
        return { success: false, msg: 'Target path already exists' };
      }

      await fs.rename(targetPath, newPath);
      return { success: true, data: { newPath } };
    } catch (error) {
      console.error('Failed to rename entry:', error);
      return { success: false, msg: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // 读取内置 rules 文件 / Read built-in rules file from app resources
  ipcBridge.fs.readBuiltinRule.provider(async ({ fileName }) => {
    try {
      // 安全检查：只允许读取 rules 目录下的 .md 文件
      // Security check: only allow reading .md files from rules directory
      const safeFileName = path.basename(fileName);
      if (!safeFileName.endsWith('.md')) {
        throw new Error('Only .md files are allowed');
      }

      // 开发模式下使用项目根目录，生产模式使用 app.getAppPath()
      // In development, use project root. In production, use app.getAppPath()
      let rulesDir: string;
      if (app.isPackaged) {
        // 生产模式：rules 在 app.asar 中或 Resources 目录下
        // Production: rules are in app.asar or Resources directory
        rulesDir = path.join(app.getAppPath(), 'rules');
      } else {
        // 开发模式：尝试多种路径找到 rules 目录
        // Development: try multiple paths to find rules directory
        const appPath = app.getAppPath();
        const candidates = [
          path.join(appPath, 'rules'), // 直接在 appPath 下
          path.join(appPath, '..', 'rules'), // 上一级
          path.join(appPath, '..', '..', 'rules'), // 上两级 (.webpack/main 情况)
          path.join(appPath, '..', '..', '..', 'rules'), // 上三级
        ];

        rulesDir = candidates[0]; // 默认值
        for (const candidate of candidates) {
          try {
            await fs.access(candidate);
            rulesDir = candidate;
            break;
          } catch {
            // 继续尝试下一个路径 / Try next path
          }
        }
      }

      const rulesPath = path.join(rulesDir, safeFileName);
      const content = await fs.readFile(rulesPath, 'utf-8');
      return content;
    } catch (error) {
      console.error('Failed to read builtin rule:', error);
      throw error;
    }
  });

  // 读取助手规则文件 / Read assistant rule file from user directory or builtin rules
  ipcBridge.fs.readAssistantRule.provider(async ({ assistantId, locale = 'en-US' }) => {
    try {
      const assistantsDir = getAssistantsDir();

      // 尝试按优先级读取：指定语言 -> en-US -> zh-CN
      // Try reading in priority order: specified locale -> en-US -> zh-CN
      const locales = [locale, 'en-US', 'zh-CN'].filter((l, i, arr) => arr.indexOf(l) === i);

      // 1. 首先尝试从用户数据目录读取 / First try to read from user data directory
      for (const loc of locales) {
        const fileName = `${assistantId}.${loc}.md`;
        const filePath = path.join(assistantsDir, fileName);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          return content;
        } catch {
          // 继续尝试下一个语言 / Try next locale
        }
      }

      // 2. 如果用户目录没有，回退到内置规则目录 / Fallback to builtin rules directory
      let builtinRulesDir: string;
      if (app.isPackaged) {
        builtinRulesDir = path.join(app.getAppPath(), 'rules');
      } else {
        // 开发模式：尝试多种路径找到 rules 目录
        const appPath = app.getAppPath();
        const candidates = [path.join(appPath, 'rules'), path.join(appPath, '..', 'rules'), path.join(appPath, '..', '..', 'rules'), path.join(appPath, '..', '..', '..', 'rules')];

        builtinRulesDir = candidates[0];
        for (const candidate of candidates) {
          try {
            await fs.access(candidate);
            builtinRulesDir = candidate;
            break;
          } catch {
            // 继续尝试下一个路径
          }
        }
      }

      // 尝试从内置规则目录读取 / Try to read from builtin rules directory
      for (const loc of locales) {
        const fileName = `${assistantId}.${loc}.md`;
        const filePath = path.join(builtinRulesDir, fileName);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          console.log(`[fsBridge] Read builtin rule for ${assistantId}: ${fileName}`);
          return content;
        } catch {
          // 继续尝试下一个语言 / Try next locale
        }
      }

      // 如果都找不到，返回空字符串
      // Return empty string if no file found
      return '';
    } catch (error) {
      console.error('Failed to read assistant rule:', error);
      throw error;
    }
  });

  // 写入助手规则文件 / Write assistant rule file to user directory
  ipcBridge.fs.writeAssistantRule.provider(async ({ assistantId, content, locale = 'en-US' }) => {
    try {
      const assistantsDir = getAssistantsDir();

      // 确保目录存在 / Ensure directory exists
      await fs.mkdir(assistantsDir, { recursive: true });

      const fileName = `${assistantId}.${locale}.md`;
      const filePath = path.join(assistantsDir, fileName);

      await fs.writeFile(filePath, content, 'utf-8');
      console.log(`[fsBridge] Wrote assistant rule: ${fileName}`);
      return true;
    } catch (error) {
      console.error('Failed to write assistant rule:', error);
      return false;
    }
  });

  // 删除助手规则文件 / Delete assistant rule files
  ipcBridge.fs.deleteAssistantRule.provider(async ({ assistantId }) => {
    try {
      const assistantsDir = getAssistantsDir();

      // 读取目录中所有文件 / Read all files in directory
      const files = await fs.readdir(assistantsDir);

      // 删除所有匹配该助手 ID 的规则文件（所有语言版本）
      // Delete all rule files matching this assistant ID (all locale versions)
      const pattern = new RegExp(`^${assistantId}\\..*\\.md$`);
      for (const file of files) {
        if (pattern.test(file)) {
          await fs.unlink(path.join(assistantsDir, file));
          console.log(`[fsBridge] Deleted assistant rule: ${file}`);
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to delete assistant rule:', error);
      return false;
    }
  });
}
