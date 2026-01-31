/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIONUI_TIMESTAMP_SEPARATOR } from '@/common/constants';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import https from 'node:https';
import http from 'node:http';
import { app } from 'electron';
import { ipcBridge } from '../../common';
import { getSystemDir, getAssistantsDir } from '../initStorage';
import { readDirectoryRecursive } from '../utils';

// ============================================================================
// Helper functions for builtin resource directory resolution
// 内置资源目录解析辅助函数
// ============================================================================

type ResourceType = 'rules' | 'skills';

/**
 * Find the builtin resource directory (rules or skills)
 * 查找内置资源目录（rules 或 skills）
 *
 * When packaged, resources are in asarUnpack, so they're at app.asar.unpacked/
 * 打包后，资源在 asarUnpack 中，所以在 app.asar.unpacked/ 目录下
 */
async function findBuiltinResourceDir(resourceType: ResourceType): Promise<string> {
  if (app.isPackaged) {
    const appPath = app.getAppPath();
    // asarUnpack extracts files to app.asar.unpacked directory
    // asarUnpack 会将文件解压到 app.asar.unpacked 目录
    const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
    const candidates = [
      path.join(unpackedPath, resourceType), // Unpacked location (preferred)
      path.join(appPath, resourceType), // Fallback to asar path
    ];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try next path
      }
    }
    console.warn(`[fsBridge] Could not find builtin ${resourceType} directory, tried:`, candidates);
    return candidates[0]; // Default to unpacked path
  }
  // Development: try multiple paths
  const appPath = app.getAppPath();
  const candidates = [path.join(appPath, resourceType), path.join(appPath, '..', resourceType), path.join(appPath, '..', '..', resourceType), path.join(appPath, '..', '..', '..', resourceType)];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next path
    }
  }
  return candidates[0]; // Default fallback
}

/**
 * Get user config skills directory
 * 获取用户配置 skills 目录
 */
function getUserSkillsDir(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'config', 'skills');
}

/**
 * Copy directory recursively
 * 递归复制目录
 */
async function copyDirectory(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Read a builtin resource file (.md only)
 * 读取内置资源文件（仅限 .md）
 */
async function readBuiltinResource(resourceType: ResourceType, fileName: string): Promise<string> {
  const safeFileName = path.basename(fileName);
  if (!safeFileName.endsWith('.md')) {
    throw new Error('Only .md files are allowed');
  }
  const dir = await findBuiltinResourceDir(resourceType);
  return fs.readFile(path.join(dir, safeFileName), 'utf-8');
}

/**
 * Read assistant resource file with locale fallback
 * 读取助手资源文件，支持语言回退
 */
async function readAssistantResource(resourceType: ResourceType, assistantId: string, locale: string, fileNamePattern: (id: string, loc: string) => string): Promise<string> {
  const assistantsDir = getAssistantsDir();
  const locales = [locale, 'en-US', 'zh-CN'].filter((l, i, arr) => arr.indexOf(l) === i);

  // 1. Try user data directory first
  for (const loc of locales) {
    const fileName = fileNamePattern(assistantId, loc);
    try {
      return await fs.readFile(path.join(assistantsDir, fileName), 'utf-8');
    } catch {
      // Try next locale
    }
  }

  // 2. Fallback to builtin directory
  const builtinDir = await findBuiltinResourceDir(resourceType);
  for (const loc of locales) {
    const fileName = fileNamePattern(assistantId, loc);
    try {
      const content = await fs.readFile(path.join(builtinDir, fileName), 'utf-8');
      console.log(`[fsBridge] Read builtin ${resourceType} for ${assistantId}: ${fileName}`);
      return content;
    } catch {
      // Try next locale
    }
  }

  return ''; // Not found
}

/**
 * Write assistant resource file to user directory
 * 写入助手资源文件到用户目录
 */
async function writeAssistantResource(resourceType: ResourceType, assistantId: string, content: string, locale: string, fileNamePattern: (id: string, loc: string) => string): Promise<boolean> {
  try {
    const assistantsDir = getAssistantsDir();
    await fs.mkdir(assistantsDir, { recursive: true });
    const fileName = fileNamePattern(assistantId, locale);
    await fs.writeFile(path.join(assistantsDir, fileName), content, 'utf-8');
    console.log(`[fsBridge] Wrote assistant ${resourceType}: ${fileName}`);
    return true;
  } catch (error) {
    console.error(`Failed to write assistant ${resourceType}:`, error);
    return false;
  }
}

/**
 * Delete assistant resource files (all locale versions)
 * 删除助手资源文件（所有语言版本）
 */
async function deleteAssistantResource(resourceType: ResourceType, filePattern: RegExp): Promise<boolean> {
  try {
    const assistantsDir = getAssistantsDir();
    const files = await fs.readdir(assistantsDir);
    for (const file of files) {
      if (filePattern.test(file)) {
        await fs.unlink(path.join(assistantsDir, file));
        console.log(`[fsBridge] Deleted assistant ${resourceType}: ${file}`);
      }
    }
    return true;
  } catch (error) {
    console.error(`Failed to delete assistant ${resourceType}:`, error);
    return false;
  }
}

// File name patterns for rules and skills
const ruleFilePattern = (id: string, loc: string) => `${id}.${loc}.md`;
const skillFilePattern = (id: string, loc: string) => `${id}-skills.${loc}.md`;

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
      return await readBuiltinResource('rules', fileName);
    } catch (error) {
      console.error('Failed to read builtin rule:', error);
      throw error;
    }
  });

  // 读取内置 skills 文件 / Read built-in skills file from app resources
  ipcBridge.fs.readBuiltinSkill.provider(async ({ fileName }) => {
    try {
      return await readBuiltinResource('skills', fileName);
    } catch (error) {
      console.error('Failed to read builtin skill:', error);
      throw error;
    }
  });

  // 读取助手规则文件 / Read assistant rule file from user directory or builtin rules
  ipcBridge.fs.readAssistantRule.provider(async ({ assistantId, locale = 'en-US' }) => {
    try {
      return await readAssistantResource('rules', assistantId, locale, ruleFilePattern);
    } catch (error) {
      console.error('Failed to read assistant rule:', error);
      throw error;
    }
  });

  // 写入助手规则文件 / Write assistant rule file to user directory
  ipcBridge.fs.writeAssistantRule.provider(({ assistantId, content, locale = 'en-US' }) => {
    return writeAssistantResource('rules', assistantId, content, locale, ruleFilePattern);
  });

  // 删除助手规则文件 / Delete assistant rule files
  ipcBridge.fs.deleteAssistantRule.provider(({ assistantId }) => {
    return deleteAssistantResource('rules', new RegExp(`^${assistantId}\\..*\\.md$`));
  });

  // 读取助手技能文件 / Read assistant skill file from user directory or builtin skills
  ipcBridge.fs.readAssistantSkill.provider(async ({ assistantId, locale = 'en-US' }) => {
    try {
      return await readAssistantResource('skills', assistantId, locale, skillFilePattern);
    } catch (error) {
      console.error('Failed to read assistant skill:', error);
      throw error;
    }
  });

  // 写入助手技能文件 / Write assistant skill file to user directory
  ipcBridge.fs.writeAssistantSkill.provider(({ assistantId, content, locale = 'en-US' }) => {
    return writeAssistantResource('skills', assistantId, content, locale, skillFilePattern);
  });

  // 删除助手技能文件 / Delete assistant skill files
  ipcBridge.fs.deleteAssistantSkill.provider(({ assistantId }) => {
    return deleteAssistantResource('skills', new RegExp(`^${assistantId}-skills\\..*\\.md$`));
  });

  // 获取可用 skills 列表 / List available skills from both builtin and user directories
  ipcBridge.fs.listAvailableSkills.provider(async () => {
    try {
      const skills: Array<{ name: string; description: string; location: string; isCustom: boolean }> = [];

      // 辅助函数：从目录读取 skills
      const readSkillsFromDir = async (skillsDir: string, isCustomDir: boolean) => {
        try {
          await fs.access(skillsDir);
          const entries = await fs.readdir(skillsDir, { withFileTypes: true });

          for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            // 跳过内置 skills 目录（_builtin），这些 skills 自动注入，不需要用户选择
            // Skip builtin skills directory (_builtin), these are auto-injected, no user selection needed
            if (entry.name === '_builtin') continue;

            const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');

            try {
              const content = await fs.readFile(skillMdPath, 'utf-8');
              // 解析 YAML front matter
              const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
              if (frontMatterMatch) {
                const yaml = frontMatterMatch[1];
                const nameMatch = yaml.match(/^name:\s*(.+)$/m);
                const descMatch = yaml.match(/^description:\s*['"]?(.+?)['"]?$/m);
                if (nameMatch) {
                  skills.push({
                    name: nameMatch[1].trim(),
                    description: descMatch ? descMatch[1].trim() : '',
                    location: skillMdPath,
                    isCustom: isCustomDir,
                  });
                }
              }
            } catch {
              // Skill directory without SKILL.md, skip
            }
          }
        } catch {
          // Directory doesn't exist, skip
        }
      };

      // 读取内置 skills (isCustom: false)
      const builtinSkillsDir = await findBuiltinResourceDir('skills');
      const builtinCountBefore = skills.length;
      await readSkillsFromDir(builtinSkillsDir, false);
      const builtinCount = skills.length - builtinCountBefore;

      // 读取用户自定义 skills (isCustom: true)
      const userSkillsDir = getUserSkillsDir();
      const userCountBefore = skills.length;
      await readSkillsFromDir(userSkillsDir, true);
      const userCount = skills.length - userCountBefore;

      // 去重：如果 custom skill 和 builtin skill 同名，只保留 builtin
      // Deduplicate: if custom and builtin skills have same name, keep only builtin
      const skillMap = new Map<string, { name: string; description: string; location: string; isCustom: boolean }>();
      for (const skill of skills) {
        const existing = skillMap.get(skill.name);
        // 如果已存在且当前是 builtin，或者不存在，则添加/更新
        // Add/update if: already exists and current is builtin, or doesn't exist yet
        if (!existing || !skill.isCustom) {
          skillMap.set(skill.name, skill);
        }
      }
      const deduplicatedSkills = Array.from(skillMap.values());

      console.log(`[fsBridge] Listed ${deduplicatedSkills.length} available skills (${skills.length} before deduplication):`);
      console.log(`  - Builtin skills (${builtinCount}): ${builtinSkillsDir}`);
      console.log(`  - User skills (${userCount}): ${userSkillsDir}`);
      console.log(`  - Skills breakdown:`, deduplicatedSkills.map((s) => `${s.name} (${s.isCustom ? 'custom' : 'builtin'})`).join(', '));

      return deduplicatedSkills;
    } catch (error) {
      console.error('[fsBridge] Failed to list available skills:', error);
      return [];
    }
  });

  // 读取 skill 信息（不导入）/ Read skill info without importing
  ipcBridge.fs.readSkillInfo.provider(async ({ skillPath }) => {
    try {
      // 验证 SKILL.md 文件存在 / Verify SKILL.md file exists
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      try {
        await fs.access(skillMdPath);
      } catch {
        return {
          success: false,
          msg: 'SKILL.md file not found in the selected directory',
        };
      }

      // 读取 SKILL.md 获取 skill 信息 / Read SKILL.md to get skill info
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      let skillName = path.basename(skillPath); // 默认使用目录名 / Default to directory name
      let skillDescription = '';

      if (frontMatterMatch) {
        const yaml = frontMatterMatch[1];
        const nameMatch = yaml.match(/^name:\s*(.+)$/m);
        const descMatch = yaml.match(/^description:\s*['"]?(.+?)['"]?$/m);
        if (nameMatch) {
          skillName = nameMatch[1].trim();
        }
        if (descMatch) {
          skillDescription = descMatch[1].trim();
        }
      }

      return {
        success: true,
        data: {
          name: skillName,
          description: skillDescription,
        },
        msg: 'Skill info loaded successfully',
      };
    } catch (error) {
      console.error('[fsBridge] Failed to read skill info:', error);
      return {
        success: false,
        msg: `Failed to read skill info: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  // 导入 skill 目录 / Import skill directory
  ipcBridge.fs.importSkill.provider(async ({ skillPath }) => {
    try {
      // 验证 SKILL.md 文件存在 / Verify SKILL.md file exists
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      try {
        await fs.access(skillMdPath);
      } catch {
        return {
          success: false,
          msg: 'SKILL.md file not found in the selected directory',
        };
      }

      // 读取 SKILL.md 获取 skill 名称 / Read SKILL.md to get skill name
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      let skillName = path.basename(skillPath); // 默认使用目录名 / Default to directory name

      if (frontMatterMatch) {
        const yaml = frontMatterMatch[1];
        const nameMatch = yaml.match(/^name:\s*(.+)$/m);
        if (nameMatch) {
          skillName = nameMatch[1].trim();
        }
      }

      // 获取用户 skills 目录 / Get user skills directory
      const userSkillsDir = getUserSkillsDir();
      const targetDir = path.join(userSkillsDir, skillName);

      // 检查是否已存在同名 skill（同时检查内置和用户目录）/ Check if skill already exists in both builtin and user directories
      const builtinSkillsDir = await findBuiltinResourceDir('skills');
      const builtinTargetDir = path.join(builtinSkillsDir, skillName);

      try {
        await fs.access(targetDir);
        return {
          success: false,
          msg: `Skill "${skillName}" already exists in user skills`,
        };
      } catch {
        // User skill doesn't exist
      }

      try {
        await fs.access(builtinTargetDir);
        return {
          success: false,
          msg: `Skill "${skillName}" already exists in builtin skills`,
        };
      } catch {
        // Builtin skill doesn't exist, proceed with copy
      }

      // 复制整个目录 / Copy entire directory
      await copyDirectory(skillPath, targetDir);

      console.log(`[fsBridge] Successfully imported skill "${skillName}" to ${targetDir}`);

      return {
        success: true,
        data: { skillName },
        msg: `Skill "${skillName}" imported successfully`,
      };
    } catch (error) {
      console.error('[fsBridge] Failed to import skill:', error);
      return {
        success: false,
        msg: `Failed to import skill: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  // 扫描目录下的 skills / Scan directory for skills
  ipcBridge.fs.scanForSkills.provider(async ({ folderPath }) => {
    console.log(`[fsBridge] scanForSkills called with path: ${folderPath}`);
    try {
      const skills: Array<{ name: string; description: string; path: string }> = [];

      await fs.access(folderPath);
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      console.log(`[fsBridge] Found ${entries.length} entries in ${folderPath}`);

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillDir = path.join(folderPath, entry.name);
        const skillMdPath = path.join(skillDir, 'SKILL.md');

        try {
          const content = await fs.readFile(skillMdPath, 'utf-8');
          // 解析 YAML front matter
          const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
          if (frontMatterMatch) {
            const yaml = frontMatterMatch[1];
            const nameMatch = yaml.match(/^name:\s*(.+)$/m);
            const descMatch = yaml.match(/^description:\s*['"]?(.+?)['"]?$/m);
            if (nameMatch) {
              skills.push({
                name: nameMatch[1].trim(),
                description: descMatch ? descMatch[1].trim() : '',
                path: skillDir,
              });
              console.log(`[fsBridge] Found skill in subdirectory: ${nameMatch[1].trim()}`);
            }
          }
        } catch {
          // Skill directory without SKILL.md, skip
        }
      }

      // Si no se encontraron skills en subdirectorios, probamos si la carpeta seleccionada en sí es una skill
      if (skills.length === 0) {
        console.log(`[fsBridge] No skills in subdirectories, checking if ${folderPath} is a skill itself`);
        const skillMdPath = path.join(folderPath, 'SKILL.md');
        try {
          const content = await fs.readFile(skillMdPath, 'utf-8');
          const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
          if (frontMatterMatch) {
            const yaml = frontMatterMatch[1];
            const nameMatch = yaml.match(/^name:\s*(.+)$/m);
            const descMatch = yaml.match(/^description:\s*['"]?(.+?)['"]?$/m);
            if (nameMatch) {
              skills.push({
                name: nameMatch[1].trim(),
                description: descMatch ? descMatch[1].trim() : '',
                path: folderPath,
              });
              console.log(`[fsBridge] Found skill in the folder itself: ${nameMatch[1].trim()}`);
            }
          }
        } catch {
          // Not a skill directory
        }
      }

      console.log(`[fsBridge] scanForSkills finished. Found ${skills.length} skills.`);
      return {
        success: true,
        data: skills,
        msg: `Found ${skills.length} skills`,
      };
    } catch (error) {
      console.error('[fsBridge] Failed to scan skills:', error);
      return {
        success: false,
        msg: `Failed to scan skills: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  // 检测常见的 skills 路径 / Detect common skills paths
  ipcBridge.fs.detectCommonSkillPaths.provider(async () => {
    try {
      const homedir = os.homedir();
      const candidates = [
        { name: 'Gemini', path: path.join(homedir, '.gemini', 'skills') },
        { name: 'Claude', path: path.join(homedir, '.claude', 'skills') },
      ];

      const detected: Array<{ name: string; path: string }> = [];
      for (const candidate of candidates) {
        try {
          await fs.access(candidate.path);
          detected.push(candidate);
        } catch {
          // Path doesn't exist
        }
      }

      return {
        success: true,
        data: detected,
        msg: `Detected ${detected.length} common paths`,
      };
    } catch (error) {
      console.error('[fsBridge] Failed to detect common paths:', error);
      return {
        success: false,
        msg: 'Failed to detect common paths',
      };
    }
  });
}
