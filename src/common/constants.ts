/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AionUI应用程序共用常量
 */

// ===== 文件处理相关常量 =====

/** 临时文件时间戳分隔符 */
export const AIONUI_TIMESTAMP_SEPARATOR = '_aionui_';

/** 用于匹配和清理时间戳后缀的正则表达式 */
export const AIONUI_TIMESTAMP_REGEX = /_aionui_\d{13}(\.\w+)?$/;

// ===== 媒体类型相关常量 =====

/** 支持的图片文件扩展名 */
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'] as const;

/** 文件扩展名到MIME类型的映射 */
export const MIME_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.svg': 'image/svg+xml',
};

/** MIME类型到文件扩展名的映射 */
export const MIME_TO_EXT_MAP: Record<string, string> = {
  jpeg: '.jpg',
  jpg: '.jpg',
  png: '.png',
  gif: '.gif',
  webp: '.webp',
  bmp: '.bmp',
  tiff: '.tiff',
  'svg+xml': '.svg',
};

/** 默认图片文件扩展名 */
export const DEFAULT_IMAGE_EXTENSION = '.png';

// ===== App / Protocol Metadata =====

export const APP_CLIENT_NAME = 'AionUi';

// Prefer reading package.json version; fallback to '0.0.0' when unavailable
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const APP_CLIENT_VERSION: string = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg: any = require('../../package.json');
    return typeof pkg?.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

// Codex MCP protocol version (server handshake)
export const CODEX_MCP_PROTOCOL_VERSION = '2024-11-05' as const;
