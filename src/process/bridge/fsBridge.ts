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
import { execFile } from 'child_process';
import { app } from 'electron';
import JSZip from 'jszip';
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
 * Parse a skills.sh URL, GitHub URL, or owner/repo shorthand into structured parts.
 * Supports:
 *   - https://skills.sh/owner/repo/skill-name
 *   - https://skills.sh/owner/repo
 *   - https://github.com/owner/repo
 *   - owner/repo
 *   - npx skills add owner/repo --skill skill-name
 *   - https://skillsmp.com/skills/...
 */
type SkillsShParseResult = { type: 'github'; owner: string; repo: string; skillName?: string } | { type: 'skillsmp'; url: string };

function parseSkillsShInput(raw: string): SkillsShParseResult {
  let input = raw.trim();

  // Strip "npx skills add" prefix if present
  input = input.replace(/^npx\s+skills\s+add\s+/i, '');

  // Extract --skill flag
  let skillFlag: string | undefined;
  const skillFlagMatch = input.match(/--skill\s+(\S+)/);
  if (skillFlagMatch) {
    skillFlag = skillFlagMatch[1];
    input = input.replace(/--skill\s+\S+/, '').trim();
  }

  // Strip common CLI flags (-a, -g, -y, --list)
  input = input
    .replace(/\s+--list\b/g, '')
    .replace(/\s+-[agy]\s+\S*/g, '')
    .trim();

  // skills.sh URL: https://skills.sh/owner/repo or https://skills.sh/owner/repo/skill-name
  const skillsShMatch = input.match(/^https?:\/\/skills\.sh\/([^/?#]+)\/([^/?#]+)(?:\/([^/?#]+))?/);
  if (skillsShMatch) {
    return {
      type: 'github',
      owner: skillsShMatch[1],
      repo: skillsShMatch[2],
      skillName: skillsShMatch[3] || skillFlag,
    };
  }

  // SkillsMP URL
  if (/^https?:\/\/skillsmp\.com/i.test(input)) {
    return { type: 'skillsmp', url: input };
  }

  // GitHub URL: https://github.com/owner/repo (optionally with .git)
  const githubMatch = input.match(/^https?:\/\/github\.com\/([^/?#]+)\/([^/?#\s]+)/);
  if (githubMatch) {
    return {
      type: 'github',
      owner: githubMatch[1],
      repo: githubMatch[2].replace(/\.git$/, ''),
      skillName: skillFlag,
    };
  }

  // Shorthand: owner/repo
  const shorthandMatch = input.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shorthandMatch) {
    return {
      type: 'github',
      owner: shorthandMatch[1],
      repo: shorthandMatch[2],
      skillName: skillFlag,
    };
  }

  throw new Error(`Unrecognized skill URL or shorthand: "${raw}". Expected formats: owner/repo, https://skills.sh/owner/repo/skill, or https://github.com/owner/repo`);
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
 * Validate skill name for file system safety
 * 验证 skill 名称是否符合文件系统要求
 */
function validateSkillName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Skill name cannot be empty' };
  }

  // Check for invalid characters in file/directory names
  // eslint-disable-next-line no-control-regex
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
  if (invalidChars.test(name)) {
    return { valid: false, error: 'Skill name contains invalid characters (<>:"/\\|?*)' };
  }

  // Check for reserved names (Windows)
  const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reservedNames.test(name)) {
    return { valid: false, error: 'Skill name uses a reserved system name' };
  }

  // Check length (max 255 for most file systems, use 100 as safe limit)
  if (name.length > 100) {
    return { valid: false, error: 'Skill name is too long (max 100 characters)' };
  }

  return { valid: true };
}

/**
 * Parse YAML field value, handling multi-line strings (>, |)
 * 解析 YAML 字段值，处理多行字符串（>, |）
 */
function parseYamlField(yaml: string, fieldName: string): string {
  // Match the field with potential multi-line value
  const fieldPattern = new RegExp(`^${fieldName}:\\s*([>|]?)\\s*(.*)$`, 'm');
  const match = yaml.match(fieldPattern);

  if (!match) {
    console.log(`[parseYamlField] No match for field: ${fieldName}`);
    return '';
  }

  console.log(`[parseYamlField] Found ${fieldName}, operator: '${match[1]}', sameLine: '${match[2]}'`);

  const [_fullMatch, operator, sameLine] = match;

  // If there's content on the same line and no multi-line operator, return it
  if (sameLine.trim() && !operator) {
    // Remove surrounding quotes if present
    return sameLine.trim().replace(/^['"]|['"]$/g, '');
  }

  // For multi-line strings (> or |), collect subsequent indented lines
  if (operator === '>' || operator === '|') {
    const lines = yaml.split('\n');
    const fieldLineIndex = lines.findIndex((line) => line.match(fieldPattern));

    if (fieldLineIndex === -1) return '';

    // Get the indentation level of the first content line
    let firstContentLine = -1;
    let baseIndent = 0;

    for (let i = fieldLineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      // Skip empty lines
      if (line.trim() === '') continue;

      // Check if this line starts a new YAML key (not indented or at same level as field)
      if (line.match(/^\w+:/)) break;

      // This is the first content line
      firstContentLine = i;
      baseIndent = line.search(/\S/);
      break;
    }

    if (firstContentLine === -1) return '';

    // Collect all lines that are indented at or beyond the base indentation
    const contentLines: string[] = [];

    for (let i = firstContentLine; i < lines.length; i++) {
      const line = lines[i];

      // Empty lines are included
      if (line.trim() === '') {
        contentLines.push('');
        continue;
      }

      const indent = line.search(/\S/);

      // If line is not indented enough or starts a new key, stop
      if (indent < baseIndent || line.match(/^\w+:/)) break;

      // Remove base indentation
      contentLines.push(line.substring(baseIndent));
    }

    // Process according to operator
    if (operator === '>') {
      // Folded style: join lines with spaces, preserve paragraph breaks (blank lines)
      const paragraphs: string[] = [];
      let currentParagraph: string[] = [];

      for (const line of contentLines) {
        if (line.trim() === '') {
          if (currentParagraph.length > 0) {
            paragraphs.push(currentParagraph.join(' '));
            currentParagraph = [];
          }
        } else {
          currentParagraph.push(line.trim());
        }
      }

      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(' '));
      }

      const result = paragraphs.join('\n').trim();
      console.log(`[parseYamlField] Returning folded style result, length: ${result.length}, preview: ${result.substring(0, 50)}`);
      return result;
    } else {
      // Literal style (|): preserve line breaks
      const result = contentLines.join('\n').trim();
      console.log(`[parseYamlField] Returning literal style result, length: ${result.length}, preview: ${result.substring(0, 50)}`);
      return result;
    }
  }

  console.log('[parseYamlField] Returning empty string (no operator)');
  return '';
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
 *
 * Files are now stored inside assistant subdirectories:
 * assistants/{assistantId}/{assistantId}.{locale}.md
 */
async function readAssistantResource(resourceType: ResourceType, assistantId: string, locale: string, fileNamePattern: (id: string, loc: string) => string): Promise<string> {
  const assistantsDir = getAssistantsDir();
  const assistantSubDir = path.join(assistantsDir, assistantId);
  const locales = [locale, 'en-US', 'zh-CN'].filter((l, i, arr) => arr.indexOf(l) === i);

  // 1. Try assistant subdirectory first
  if (
    await fs
      .access(assistantSubDir)
      .then(() => true)
      .catch(() => false)
  ) {
    for (const loc of locales) {
      const fileName = fileNamePattern(assistantId, loc);
      try {
        return await fs.readFile(path.join(assistantSubDir, fileName), 'utf-8');
      } catch {
        // Try next locale
      }
    }
  }

  // 2. Fallback to builtin directory (legacy support)
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
 *
 * Files are now stored inside assistant subdirectories:
 * assistants/{assistantId}/{assistantId}.{locale}.md
 */
async function writeAssistantResource(resourceType: ResourceType, assistantId: string, content: string, locale: string, fileNamePattern: (id: string, loc: string) => string): Promise<boolean> {
  try {
    const assistantsDir = getAssistantsDir();
    const assistantSubDir = path.join(assistantsDir, assistantId);
    await fs.mkdir(assistantSubDir, { recursive: true });
    const fileName = fileNamePattern(assistantId, locale);
    await fs.writeFile(path.join(assistantSubDir, fileName), content, 'utf-8');
    console.log(`[fsBridge] Wrote assistant ${resourceType}: ${fileName} in ${assistantSubDir}`);
    return true;
  } catch (error) {
    console.error(`Failed to write assistant ${resourceType}:`, error);
    return false;
  }
}

/**
 * Delete assistant resource files (all locale versions)
 * 删除助手资源文件（所有语言版本）
 *
 * Files are now stored inside assistant subdirectories:
 * assistants/{assistantId}/{assistantId}.{locale}.md
 */
async function deleteAssistantResource(resourceType: ResourceType, assistantId: string, filePattern: RegExp): Promise<boolean> {
  try {
    const assistantsDir = getAssistantsDir();
    const assistantSubDir = path.join(assistantsDir, assistantId);

    // Check if assistant subdirectory exists
    try {
      await fs.access(assistantSubDir);
    } catch {
      // Directory doesn't exist, nothing to delete
      return true;
    }

    const files = await fs.readdir(assistantSubDir);
    for (const file of files) {
      if (filePattern.test(file)) {
        await fs.unlink(path.join(assistantSubDir, file));
        console.log(`[fsBridge] Deleted assistant ${resourceType}: ${file} from ${assistantId}/`);
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
  const canceledZipRequests = new Set<string>();

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

  ipcBridge.fs.cancelZip.provider(async ({ requestId }) => {
    if (!requestId) return false;
    canceledZipRequests.add(requestId);
    return true;
  });

  ipcBridge.fs.createZip.provider(async ({ path: filePath, files, requestId }) => {
    const isCanceled = () => Boolean(requestId && canceledZipRequests.has(requestId));
    try {
      const zip = new JSZip();

      for (const file of files) {
        if (isCanceled()) {
          throw new Error('Zip export canceled');
        }

        if (!file?.name) {
          continue;
        }

        if (typeof file.sourcePath === 'string' && file.sourcePath) {
          try {
            const entryStat = await fs.lstat(file.sourcePath);
            let isRegularFile = entryStat.isFile();

            // Follow symlink target only when needed and keep non-regular files out
            if (!isRegularFile && entryStat.isSymbolicLink()) {
              try {
                const targetStat = await fs.stat(file.sourcePath);
                isRegularFile = targetStat.isFile();
              } catch {
                isRegularFile = false;
              }
            }

            if (!isRegularFile) {
              continue;
            }

            // Guard against hanging reads on unusual filesystems / special files
            const abortController = new AbortController();
            const timeoutId = setTimeout(() => {
              abortController.abort();
            }, 10000);

            try {
              if (isCanceled()) {
                abortController.abort();
              }
              const fileBuffer = await fs.readFile(file.sourcePath, { signal: abortController.signal });
              if (isCanceled()) {
                throw new Error('Zip export canceled');
              }
              zip.file(file.name, fileBuffer);
            } finally {
              clearTimeout(timeoutId);
            }
          } catch (error) {
            console.warn('[fsBridge] Skip source file while creating zip:', file.sourcePath, error);
          }
          continue;
        }

        if (typeof file.content === 'string') {
          zip.file(file.name, file.content);
          continue;
        }

        if (file.content instanceof Uint8Array) {
          zip.file(file.name, Buffer.from(file.content));
          continue;
        }

        // Handle serialized Uint8Array from IPC payload
        if (file.content && typeof file.content === 'object') {
          const objectLike = file.content as Record<string, unknown>;
          const keys = Object.keys(objectLike);
          const isTypedArrayLike = keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
          if (isTypedArrayLike) {
            const values = keys
              .sort((a, b) => Number(a) - Number(b))
              .map((key) => {
                const value = objectLike[key];
                return typeof value === 'number' ? value : Number(value ?? 0);
              });
            zip.file(file.name, Buffer.from(values));
            continue;
          }
        }
      }

      const zipBuffer = await zip.generateAsync(
        {
          type: 'nodebuffer',
          compression: 'DEFLATE',
          compressionOptions: { level: 9 },
        },
        () => {
          if (isCanceled()) {
            throw new Error('Zip export canceled');
          }
        }
      );

      if (isCanceled()) {
        throw new Error('Zip export canceled');
      }
      await fs.writeFile(filePath, zipBuffer);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('canceled')) {
        console.log('[fsBridge] Zip export canceled:', requestId || '(no requestId)');
      } else {
        console.error('Failed to create zip file:', error);
      }
      return false;
    } finally {
      if (requestId) {
        canceledZipRequests.delete(requestId);
      }
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
    return deleteAssistantResource('rules', assistantId, new RegExp(`^${assistantId}\\..*\\.md$`));
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
    return deleteAssistantResource('skills', assistantId, new RegExp(`^${assistantId}-skills\\..*\\.md$`));
  });

  // 删除助手文件夹 / Delete assistant folder completely
  ipcBridge.fs.deleteAssistantFolder.provider(async ({ assistantId }) => {
    try {
      const assistantsDir = getAssistantsDir();
      const assistantSubDir = path.join(assistantsDir, assistantId);

      // Check if assistant subdirectory exists
      try {
        await fs.access(assistantSubDir);
      } catch {
        // Directory doesn't exist, nothing to delete
        return true;
      }

      // Remove the entire directory and all its contents
      await fs.rm(assistantSubDir, { recursive: true, force: true });
      console.log(`[fsBridge] Deleted assistant folder: ${assistantId}/`);
      return true;
    } catch (error) {
      console.error(`Failed to delete assistant folder:`, error);
      return false;
    }
  });

  // 获取可用 skills 列表 / List available skills from both builtin and user directories
  ipcBridge.fs.listAvailableSkills.provider(async () => {
    console.log('[fsBridge] ==================== listAvailableSkills CALLED ====================');
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
                const name = nameMatch ? nameMatch[1].trim() : '';
                const description = parseYamlField(yaml, 'description');
                if (name) {
                  skills.push({
                    name,
                    description,
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
      console.log(`[fsBridge] Reading skill info from: ${skillPath}`);

      // 验证 SKILL.md 文件存在 / Verify SKILL.md file exists
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      try {
        await fs.access(skillMdPath);
      } catch {
        return {
          success: false,
          msg: 'SKILL.md file not found. Please select a directory containing a SKILL.md file.',
        };
      }

      // 读取 SKILL.md 获取 skill 信息 / Read SKILL.md to get skill info
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      let skillName = path.basename(skillPath); // 默认使用目录名 / Default to directory name
      let skillDescription = '';

      if (!frontMatterMatch) {
        console.warn('[fsBridge] No YAML front matter found in SKILL.md');
        return {
          success: false,
          msg: 'SKILL.md is missing YAML front matter (---name/description---)',
        };
      }

      const yaml = frontMatterMatch[1];
      const nameMatch = yaml.match(/^name:\s*(.+)$/m);

      if (!nameMatch || !nameMatch[1].trim()) {
        console.warn('[fsBridge] No name field found in YAML front matter');
        return {
          success: false,
          msg: 'SKILL.md must include a "name" field in YAML front matter',
        };
      }

      skillName = nameMatch[1].trim();
      skillDescription = parseYamlField(yaml, 'description');

      // Validate skill name
      const nameValidation = validateSkillName(skillName);
      if (!nameValidation.valid) {
        return {
          success: false,
          msg: `Invalid skill name: ${nameValidation.error}`,
        };
      }

      console.log(`[fsBridge] Successfully read skill: ${skillName}`);

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

      // Validate skill name
      const nameValidation = validateSkillName(skillName);
      if (!nameValidation.valid) {
        return {
          success: false,
          msg: `Invalid skill name: ${nameValidation.error}`,
        };
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
            const name = nameMatch ? nameMatch[1].trim() : '';
            const description = parseYamlField(yaml, 'description');
            if (name) {
              skills.push({
                name,
                description,
                path: skillDir,
              });
              console.log(`[fsBridge] Found skill in subdirectory: ${name}`);
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
            const name = nameMatch ? nameMatch[1].trim() : '';
            const description = parseYamlField(yaml, 'description');
            if (name) {
              skills.push({
                name,
                description,
                path: folderPath,
              });
              console.log(`[fsBridge] Found skill in the folder itself: ${name}`);
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

  // Helper: fetch JSON from SkillsMP API
  const skillsmpApiFetch = (url: string, apiKey?: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'User-Agent': 'AionUi-SkillBrowser',
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const req = https.get(url, { headers }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error('Invalid JSON response from SkillsMP'));
            }
          } else if (res.statusCode === 401) {
            reject(new Error('Invalid or missing SkillsMP API key. Get one at skillsmp.com'));
          } else if (res.statusCode === 429) {
            reject(new Error('SkillsMP rate limit exceeded. Please wait before searching again.'));
          } else {
            reject(new Error(`SkillsMP API returned status ${res.statusCode}: ${body.slice(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('SkillsMP API request timed out'));
      });
    });
  };

  // SkillsMP skill search / 通过 SkillsMP 搜索技能
  ipcBridge.fs.searchSkillsMPSkills.provider(async ({ query, page = 1, perPage = 20, sortBy, apiKey }) => {
    try {
      const params = new URLSearchParams({
        q: query,
        page: String(page),
        limit: String(Math.min(perPage, 100)),
      });
      if (sortBy) params.set('sortBy', sortBy);

      const url = `https://skillsmp.com/api/v1/skills/search?${params.toString()}`;
      console.log('[fsBridge] Searching SkillsMP:', url);

      const result = await skillsmpApiFetch(url, apiKey);

      if (!result.success) {
        return {
          success: false,
          msg: result.error?.message || 'SkillsMP search failed',
        };
      }

      const skills = result.data?.skills || [];
      const pagination = result.data?.pagination;

      return {
        success: true,
        data: {
          items: skills.map((s: any) => ({
            id: s.id || '',
            name: s.name || '',
            description: s.description || '',
            author: s.author || undefined,
            stars: s.stars || 0,
            updatedAt: s.updatedAt || undefined,
            tags: s.tags || [],
            githubUrl: s.githubUrl || '',
            skillUrl: s.skillUrl || '',
          })),
          total_count: pagination?.total || skills.length,
          hasNext: pagination?.hasNext || false,
        },
      };
    } catch (error) {
      console.error('[fsBridge] SkillsMP search failed:', error);
      return {
        success: false,
        msg: `SkillsMP search failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  // Helper: fetch raw content from a URL (GitHub raw files, etc.)
  const fetchRawContent = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { headers: { 'User-Agent': 'AionUi-SkillBrowser' } }, (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchRawContent(res.headers.location).then(resolve, reject);
          return;
        }
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });
    });
  };

  // Helper: fetch JSON from GitHub API
  const fetchGitHubApi = (apiUrl: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const req = https.get(
        apiUrl,
        {
          headers: { 'User-Agent': 'AionUi-SkillBrowser', Accept: 'application/vnd.github.v3+json' },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(body));
              } catch {
                reject(new Error('Invalid JSON from GitHub API'));
              }
            } else {
              reject(new Error(`GitHub API returned ${res.statusCode}: ${body.slice(0, 200)}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('GitHub API request timed out'));
      });
    });
  };

  // Helper: download skill files from GitHub API (recursive directory download)
  const downloadGitHubDir = async (owner: string, repo: string, dirPath: string, branch: string, destDir: string): Promise<void> => {
    // Don't encode slashes in the path - GitHub API needs them as-is
    const encodedPath = dirPath.split('/').map(encodeURIComponent).join('/');
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`;
    const response = await fetchGitHubApi(apiUrl);
    // GitHub returns an array for directories, single object for files
    const entries: any[] = Array.isArray(response) ? response : [response];

    await fs.mkdir(destDir, { recursive: true });

    for (const entry of entries) {
      const destPath = path.join(destDir, entry.name);
      if (entry.type === 'file' && entry.download_url) {
        const content = await fetchRawContent(entry.download_url);
        await fs.writeFile(destPath, content, 'utf-8');
      } else if (entry.type === 'dir') {
        await downloadGitHubDir(owner, repo, entry.path, branch, destPath);
      }
    }
  };

  // 从 GitHub 安装 skill / Install skill from GitHub
  // Prefers GitHub API download (no git required), falls back to git clone
  ipcBridge.fs.installSkillFromGitHub.provider(async ({ cloneUrl, repoName, subPath, branch }) => {
    try {
      const userSkillsDir = getUserSkillsDir();
      await fs.mkdir(userSkillsDir, { recursive: true });

      const tempDir = path.join(os.tmpdir(), `aionui-skill-${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });

      // Parse GitHub info from cloneUrl for API-based download
      // cloneUrl format: https://github.com/{owner}/{repo}.git
      const githubMatch = cloneUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);

      if (githubMatch && subPath) {
        // Use GitHub API to download only the skill directory (fast, no git needed)
        const [, owner, repo] = githubMatch;
        const targetBranch = branch || 'main';
        console.log(`[fsBridge] Downloading skill via GitHub API: ${owner}/${repo}/${subPath} (branch: ${targetBranch})`);
        try {
          await downloadGitHubDir(owner, repo, subPath, targetBranch, tempDir);
        } catch (apiError) {
          if (!branch) {
            // Try 'master' branch if 'main' fails and no explicit branch was given
            console.log('[fsBridge] main branch failed, trying master...');
            await downloadGitHubDir(owner, repo, subPath, 'master', tempDir);
          } else {
            throw apiError;
          }
        }
      } else {
        // Fall back to git clone for repos without subPath
        console.log(`[fsBridge] Cloning repo: ${cloneUrl}`);
        await new Promise<void>((resolve, reject) => {
          execFile('git', ['clone', '--depth', '1', cloneUrl, tempDir], { timeout: 60000 }, (error) => {
            if (error) {
              reject(new Error(`Git clone failed: ${error.message}`));
            } else {
              resolve();
            }
          });
        });
      }

      // Find skill content in downloaded files
      let skillSourceDir = tempDir;
      let skillName = repoName;

      // Check tempDir for skill content, or scan subdirectories
      const dirEntries = await fs.readdir(tempDir);
      const hasMdFiles = dirEntries.some((e) => e.endsWith('.md'));

      if (!hasMdFiles && !subPath) {
        // For git clone: scan subdirectories
        const entries = await fs.readdir(tempDir, { withFileTypes: true });
        let found = false;
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name === '.git') continue;
          const subEntries = await fs.readdir(path.join(tempDir, entry.name));
          if (subEntries.some((e) => e.endsWith('.md'))) {
            skillSourceDir = path.join(tempDir, entry.name);
            found = true;
            break;
          }
        }
        if (!found) {
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
          return {
            success: false,
            msg: 'No skill files (.md) found in the repository.',
          };
        }
      }

      // Ensure SKILL.md exists; if not, generate one from .md files
      const skillMdPath = path.join(skillSourceDir, 'SKILL.md');
      let hasSkillMd = false;
      try {
        await fs.access(skillMdPath);
        hasSkillMd = true;
      } catch {
        const mdFiles = (await fs.readdir(skillSourceDir)).filter((e) => e.endsWith('.md') && e !== 'README.md');
        if (mdFiles.length > 0) {
          const mainMd = mdFiles[0];
          const content = await fs.readFile(path.join(skillSourceDir, mainMd), 'utf-8');
          const derivedName = mainMd.replace(/\.md$/, '');
          await fs.writeFile(skillMdPath, `---\nname: ${derivedName}\ndescription: Installed from GitHub\n---\n\n${content}`, 'utf-8');
          hasSkillMd = true;
        }
      }

      // Parse SKILL.md for name
      if (hasSkillMd) {
        const skillMdContent = await fs.readFile(skillMdPath, 'utf-8');
        const frontMatterMatch = skillMdContent.match(/^---\s*\n([\s\S]*?)\n---/);
        if (frontMatterMatch) {
          const yaml = frontMatterMatch[1];
          const nameMatch = yaml.match(/^name:\s*(.+)$/m);
          if (nameMatch) skillName = nameMatch[1].trim();
        }
      }

      // Validate skill name
      const nameValidation = validateSkillName(skillName);
      if (!nameValidation.valid) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        return {
          success: false,
          msg: `Invalid skill name: ${nameValidation.error}`,
        };
      }

      // Check for duplicates
      const targetDir = path.join(userSkillsDir, skillName);
      try {
        await fs.access(targetDir);
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        return {
          success: false,
          msg: `Skill "${skillName}" already exists. Remove it first to reinstall.`,
        };
      } catch {
        // Doesn't exist, good
      }

      // Copy skill (without .git directory)
      const copyWithoutGit = async (src: string, dest: string) => {
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === '.git') continue;
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            await copyWithoutGit(srcPath, destPath);
          } else {
            await fs.copyFile(srcPath, destPath);
          }
        }
      };

      await copyWithoutGit(skillSourceDir, targetDir);

      // Cleanup temp
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

      console.log(`[fsBridge] Successfully installed skill "${skillName}" to ${targetDir}`);

      return {
        success: true,
        data: { skillName, installPath: targetDir },
        msg: `Skill "${skillName}" installed successfully`,
      };
    } catch (error) {
      console.error('[fsBridge] Skill install failed:', error);
      return {
        success: false,
        msg: `Failed to install skill: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  // ============================================================================
  // Install skill from skills.sh URL or shorthand
  // Supports: skills.sh URLs, GitHub URLs, owner/repo shorthand, SkillsMP URLs
  // ============================================================================
  ipcBridge.fs.installSkillFromUrl.provider(async ({ input }) => {
    try {
      const parsed = parseSkillsShInput(input);

      if (parsed.type === 'skillsmp') {
        return { success: false, msg: 'SkillsMP URLs are not directly installable. Use the Browse SkillsMP feature instead.' };
      }

      const { owner, repo, skillName: parsedSkillName } = parsed;
      const cloneUrl = `https://github.com/${owner}/${repo}.git`;

      if (parsedSkillName) {
        // Install a specific skill from the repo's skills/ directory
        // Try common paths: skills/{name}/, {name}/, .claude/skills/{name}/, .agents/skills/{name}/
        const candidatePaths = [`skills/${parsedSkillName}`, parsedSkillName, `.claude/skills/${parsedSkillName}`, `.agents/skills/${parsedSkillName}`];

        let lastError: string | undefined;
        for (const subPath of candidatePaths) {
          try {
            const result = await ipcBridge.fs.installSkillFromGitHub.invoke({
              cloneUrl,
              repoName: parsedSkillName,
              subPath,
            });
            if (result.success && result.data) {
              return {
                success: true,
                data: { skillName: result.data.skillName, installPath: result.data.installPath },
                msg: `Skill "${result.data.skillName}" installed from ${owner}/${repo}`,
              };
            }
            lastError = result.msg;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
          }
        }

        return {
          success: false,
          msg: lastError || `Could not find skill "${parsedSkillName}" in ${owner}/${repo}`,
        };
      } else {
        // No specific skill name: try to install the repo as a single skill first,
        // then scan for multiple skills in the skills/ directory
        const result = await ipcBridge.fs.installSkillFromGitHub.invoke({
          cloneUrl,
          repoName: repo,
        });
        if (result.success && result.data) {
          return {
            success: true,
            data: { skillName: result.data.skillName, installPath: result.data.installPath },
            msg: `Skill "${result.data.skillName}" installed from ${owner}/${repo}`,
          };
        }
        return {
          success: false,
          msg: result.msg || `Failed to install skill from ${owner}/${repo}`,
        };
      }
    } catch (error) {
      console.error('[fsBridge] installSkillFromUrl failed:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 删除用户自定义 skill / Delete a custom user skill
  ipcBridge.fs.deleteCustomSkill.provider(async ({ skillName }) => {
    try {
      const userSkillsDir = getUserSkillsDir();
      const skillDir = path.join(userSkillsDir, skillName);

      // Verify it exists and is inside the user skills directory
      try {
        await fs.access(skillDir);
      } catch {
        return { success: false, msg: `Skill "${skillName}" not found in custom skills` };
      }

      // Safety: ensure the path is actually under userSkillsDir
      const resolvedSkillDir = path.resolve(skillDir);
      const resolvedUserDir = path.resolve(userSkillsDir);
      if (!resolvedSkillDir.startsWith(resolvedUserDir + path.sep)) {
        return { success: false, msg: 'Invalid skill path' };
      }

      await fs.rm(skillDir, { recursive: true, force: true });
      console.log(`[fsBridge] Deleted custom skill "${skillName}" from ${skillDir}`);
      return { success: true, msg: `Skill "${skillName}" deleted successfully` };
    } catch (error) {
      console.error('[fsBridge] Failed to delete custom skill:', error);
      return { success: false, msg: `Failed to delete skill: ${error instanceof Error ? error.message : String(error)}` };
    }
  });

  // 从 zip 文件导入 skill / Import skill from zip file
  ipcBridge.fs.importSkillZip.provider(async ({ zipPath }) => {
    try {
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(zipPath);

      // Extract to a temporary directory
      const tmpDir = path.join(getUserSkillsDir(), `_tmp_zip_${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });

      try {
        zip.extractAllTo(tmpDir, true);

        // Find all SKILL.md files recursively (up to 3 levels deep)
        const findSkillDirs = async (dir: string, depth = 0): Promise<string[]> => {
          if (depth > 3) return [];
          const dirs: string[] = [];

          // Check if current directory has SKILL.md
          try {
            await fs.access(path.join(dir, 'SKILL.md'));
            dirs.push(dir);
            return dirs; // Don't recurse into skill directories
          } catch {
            // No SKILL.md here, check subdirectories
          }

          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                const subDirs = await findSkillDirs(path.join(dir, entry.name), depth + 1);
                dirs.push(...subDirs);
              }
            }
          } catch {
            // Ignore read errors
          }

          return dirs;
        };

        const skillDirs = await findSkillDirs(tmpDir);

        if (skillDirs.length === 0) {
          return { success: false, msg: 'No valid skills found in zip file (no SKILL.md found)' };
        }

        const userSkillsDir = getUserSkillsDir();
        const importedNames: string[] = [];
        let skipped = 0;

        for (const skillDir of skillDirs) {
          const skillMdPath = path.join(skillDir, 'SKILL.md');
          const content = await fs.readFile(skillMdPath, 'utf-8');

          // Extract skill name from YAML front matter
          let skillName = path.basename(skillDir);
          const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
          if (frontMatterMatch) {
            const yaml = frontMatterMatch[1];
            const nameMatch = yaml.match(/^name:\s*(.+)$/m);
            if (nameMatch) {
              skillName = nameMatch[1].trim();
            }
          }

          // Validate skill name
          const nameValidation = validateSkillName(skillName);
          if (!nameValidation.valid) {
            skipped++;
            continue;
          }

          const targetDir = path.join(userSkillsDir, skillName);

          // Check if already exists
          try {
            await fs.access(targetDir);
            skipped++;
            continue;
          } catch {
            // Doesn't exist, proceed
          }

          await copyDirectory(skillDir, targetDir);
          importedNames.push(skillName);
        }

        if (importedNames.length === 0 && skipped > 0) {
          return { success: false, msg: 'All skills in zip already exist' };
        }

        if (importedNames.length === 0) {
          return { success: false, msg: 'No valid skills found in zip file' };
        }

        console.log(`[fsBridge] Imported ${importedNames.length} skills from zip, skipped ${skipped}`);
        return {
          success: true,
          data: { skillNames: importedNames, skipped },
          msg: `Imported ${importedNames.length} skill(s) from zip`,
        };
      } finally {
        // Clean up temp directory
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (error) {
      console.error('[fsBridge] Failed to import skill from zip:', error);
      return {
        success: false,
        msg: `Failed to import skill from zip: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  // 从 zip 文件导入助手 / Import assistant from zip file
  // Simply extract zip to assistants folder and load metadata
  ipcBridge.fs.importAssistantZip.provider(async ({ zipPath }) => {
    const tmpDir = path.join(os.tmpdir(), `assistant-import-${Date.now()}`);

    try {
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(zipPath);
      const assistantsDir = getAssistantsDir();
      await fs.mkdir(assistantsDir, { recursive: true });

      // Extract to temp directory first to read config
      await fs.mkdir(tmpDir, { recursive: true });
      zip.extractAllTo(tmpDir, true);
      console.log(`[fsBridge] Extracted to temp: ${tmpDir}`);

      // Find assistant.json or manifest.json (may be in subdirectory)
      const findConfigFile = async (dir: string, depth = 0): Promise<{ path: string; config: any; relativeDir: string } | null> => {
        if (depth > 2) return null; // Limit search depth

        // Try current directory
        for (const filename of ['assistant.json', 'manifest.json']) {
          const configPath = path.join(dir, filename);
          try {
            const configData = await fs.readFile(configPath, 'utf-8');
            const config = JSON.parse(configData);
            const relativeDir = path.relative(tmpDir, dir);
            return { path: configPath, config, relativeDir };
          } catch {
            // Continue searching
          }
        }

        // Search subdirectories
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const result = await findConfigFile(path.join(dir, entry.name), depth + 1);
              if (result) return result;
            }
          }
        } catch {
          // Ignore read errors
        }

        return null;
      };

      const configResult = await findConfigFile(tmpDir);
      if (!configResult) {
        return { success: false, msg: 'No assistant.json or manifest.json found in zip' };
      }

      const assistantConfig = configResult.config;

      if (!assistantConfig.name || !assistantConfig.name.trim()) {
        return { success: false, msg: 'Invalid config: "name" field is required' };
      }

      // Generate assistant ID from name with timestamp for uniqueness
      // Format: {sanitized-name}-{timestamp} (e.g., video-generator-1770673611169)
      const sanitizeName = (name: string) =>
        name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-');
      const baseName = assistantConfig.id ? sanitizeName(assistantConfig.id) : sanitizeName(assistantConfig.name);
      const timestamp = Date.now();
      const newId = `${baseName}-${timestamp}`;

      // Move from temp to final location
      const finalDir = path.join(assistantsDir, newId);
      const sourceDir = configResult.relativeDir ? path.join(tmpDir, configResult.relativeDir) : tmpDir;

      await fs.rename(sourceDir, finalDir);
      console.log(`[fsBridge] Moved assistant to: ${finalDir}`);

      // Update assistant.json with correct ID
      const finalConfigPath = path.join(finalDir, 'assistant.json');
      assistantConfig.id = newId;
      await fs.writeFile(finalConfigPath, JSON.stringify(assistantConfig, null, 2), 'utf-8');

      // Build workspace path (workspace/ is inside the assistant directory now)
      const workspacePath = path.join(finalDir, assistantConfig.workspacePath || 'workspace');

      // Load README.md or CLAUDE.md as assistant rules (look in assistant subdirectory)
      let hasRules = false;
      for (const ruleFile of ['CLAUDE.md', 'README.md', `${newId}.md`]) {
        const searchPaths = [
          path.join(finalDir, ruleFile), // Root of assistant dir
          path.join(workspacePath, ruleFile), // workspace/ subdirectory
        ];

        for (const rulePath of searchPaths) {
          try {
            const ruleContent = await fs.readFile(rulePath, 'utf-8');

            // Save to assistant subdirectory with locale suffix
            const ruleFileName = `${newId}.en-US.md`;
            const targetRulePath = path.join(finalDir, ruleFileName);
            await fs.writeFile(targetRulePath, ruleContent, 'utf-8');

            console.log(`[fsBridge] Imported rules from ${path.basename(rulePath)} to ${ruleFileName}`);
            hasRules = true;
            break;
          } catch {
            // Try next path
          }
        }
        if (hasRules) break;
      }

      if (!hasRules) {
        console.warn('[fsBridge] No CLAUDE.md or README.md found');
      }

      // Import skills from workspace/.claude/skills/
      const workspaceSkillsDir = path.join(workspacePath, '.claude', 'skills');
      const importedSkills: string[] = [];

      try {
        await fs.access(workspaceSkillsDir);
        const skillEntries = await fs.readdir(workspaceSkillsDir, { withFileTypes: true });
        const userSkillsDir = getUserSkillsDir();
        await fs.mkdir(userSkillsDir, { recursive: true });

        for (const skillEntry of skillEntries) {
          if (!skillEntry.isDirectory()) continue;

          const skillPath = path.join(workspaceSkillsDir, skillEntry.name);
          const skillMdPath = path.join(skillPath, 'SKILL.md');

          try {
            await fs.access(skillMdPath);
            const targetSkillPath = path.join(userSkillsDir, skillEntry.name);

            // Check if skill already exists
            try {
              await fs.access(targetSkillPath);
              console.log(`[fsBridge] Skill "${skillEntry.name}" already exists, skipping`);
            } catch {
              // Copy skill
              await copyDirectory(skillPath, targetSkillPath);
              console.log(`[fsBridge] Imported skill: ${skillEntry.name}`);
            }

            importedSkills.push(skillEntry.name);
          } catch {
            // Not a valid skill, skip
          }
        }
      } catch {
        // No skills directory
      }

      // Create assistant record
      const validAgentTypes = ['gemini', 'claude', 'codex', 'opencode'];
      const agentType = assistantConfig.presetAgentType && validAgentTypes.includes(assistantConfig.presetAgentType) ? assistantConfig.presetAgentType : 'claude';

      const newAssistant = {
        id: newId,
        name: assistantConfig.name.trim(),
        description: assistantConfig.description || '',
        avatar: assistantConfig.avatar || '🎬',
        isPreset: true,
        isBuiltin: false,
        presetAgentType: agentType,
        enabled: true,
        enabledSkills: importedSkills.length > 0 ? importedSkills : [],
        customSkillNames: importedSkills.length > 0 ? importedSkills : [],
        // Note: assistantPath and workspacePath are not set here
        // The assistant directory is now the canonical location: assistants/{newId}/
        // Workspace will be initialized via hooks from assistants/{newId}/workspace/
      };

      console.log(`[fsBridge] Successfully imported assistant "${newAssistant.name}" (${newId})`);
      console.log(`[fsBridge] Assistant directory: ${finalDir}`);
      console.log(`[fsBridge] Imported ${importedSkills.length} skills: ${importedSkills.join(', ')}`);

      return {
        success: true,
        data: { assistant: newAssistant },
        msg: `Assistant "${newAssistant.name}" imported successfully`,
      };
    } catch (error) {
      console.error('[fsBridge] Failed to import assistant from zip:', error);
      return {
        success: false,
        msg: `Failed to import assistant: ${error instanceof Error ? error.message : String(error)}`,
      };
    } finally {
      // Clean up temp directory
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });
}
