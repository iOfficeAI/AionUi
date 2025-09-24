/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 统一的更新系统配置
 * 
 * 集中管理所有更新相关的配置、常量和默认值
 */

export const UPDATE_CONFIG = {
  // GitHub 配置
  GITHUB: {
    REPO: 'iOfficeAI/AionUi',
    API_BASE: 'https://api.github.com',
    USER_AGENT: 'AionUi-UpdateChecker/1.0',
    TIMEOUT: 10000, // 10秒
  },

  // 缓存配置
  CACHE: {
    EXPIRY_TIME: 5 * 60 * 1000, // 5分钟
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000, // 1秒
  },

  // 下载配置
  DOWNLOAD: {
    CHUNK_SIZE: 1024 * 1024, // 1MB
    MAX_PARALLEL_DOWNLOADS: 3,
    TIMEOUT: 30 * 60 * 1000, // 30分钟
    RETRY_DELAY: 2000, // 2秒
  },

  // 版本配置
  VERSION: {
    CHECK_INTERVAL: 24 * 60 * 60 * 1000, // 24小时
  },

  // 平台配置
  PLATFORMS: {
    SUPPORTED: ['darwin', 'win32', 'linux'] as const,
    ARCHITECTURES: ['x64', 'arm64', 'ia32', 'armv7l'] as const,
    FILE_EXTENSIONS: {
      darwin: 'dmg',
      win32: 'exe', 
      linux: 'AppImage'
    } as const,
  },

  // 错误配置
  ERRORS: {
    MAX_CONSECUTIVE_FAILURES: 5,
    FAILURE_BACKOFF_MULTIPLIER: 2,
    MAX_BACKOFF_TIME: 60 * 60 * 1000, // 1小时
  }
} as const;

/**
 * 更新错误类型
 */
export enum UpdateErrorType {
  NETWORK_ERROR = 'network_error',
  PARSE_ERROR = 'parse_error',
  VALIDATION_ERROR = 'validation_error',
  DOWNLOAD_ERROR = 'download_error',
  INSTALLATION_ERROR = 'installation_error',
  PERMISSION_ERROR = 'permission_error',
  DISK_SPACE_ERROR = 'disk_space_error',
  CHECKSUM_ERROR = 'checksum_error',
  SIGNATURE_ERROR = 'signature_error',
  TIMEOUT_ERROR = 'timeout_error',
  CANCELLED_ERROR = 'cancelled_error',
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * 更新状态类型
 */
export enum UpdateStatusType {
  IDLE = 'idle',
  CHECKING = 'checking', 
  AVAILABLE = 'available',
  NOT_AVAILABLE = 'not_available',
  DOWNLOADING = 'downloading',
  DOWNLOADED = 'downloaded',
  INSTALLING = 'installing',
  INSTALLED = 'installed',
  ERROR = 'error',
  CANCELLED = 'cancelled'
}

/**
 * 平台类型
 */
export type PlatformType = typeof UPDATE_CONFIG.PLATFORMS.SUPPORTED[number];
export type ArchitectureType = typeof UPDATE_CONFIG.PLATFORMS.ARCHITECTURES[number];

/**
 * 更新配置接口
 */
export interface UpdateOptions {
  checkOnStartup?: boolean;
  autoDownload?: boolean;
  autoInstall?: boolean;
  allowPrerelease?: boolean;
  silentMode?: boolean;
  checkInterval?: number;
  maxRetries?: number;
  timeout?: number;
}

/**
 * 默认更新选项
 */
export const DEFAULT_UPDATE_OPTIONS: UpdateOptions = {
  checkOnStartup: true,
  autoDownload: false,
  autoInstall: false,
  allowPrerelease: false,
  silentMode: false,
  checkInterval: UPDATE_CONFIG.VERSION.CHECK_INTERVAL,
  maxRetries: UPDATE_CONFIG.CACHE.MAX_RETRIES,
  timeout: UPDATE_CONFIG.GITHUB.TIMEOUT,
};

/**
 * 工具函数：获取平台的文件扩展名
 */
export function getFileExtensionForPlatform(platform: PlatformType): string {
  return UPDATE_CONFIG.PLATFORMS.FILE_EXTENSIONS[platform];
}

/**
 * 工具函数：检查平台是否支持
 */
export function isSupportedPlatform(platform: string): platform is PlatformType {
  return UPDATE_CONFIG.PLATFORMS.SUPPORTED.includes(platform as PlatformType);
}

/**
 * 工具函数：检查架构是否支持
 */
export function isSupportedArchitecture(arch: string): arch is ArchitectureType {
  return UPDATE_CONFIG.PLATFORMS.ARCHITECTURES.includes(arch as ArchitectureType);
}

/**
 * 工具函数：生成文件名模式
 */
export function generateFilenamePattern(
  appName: string,
  version: string,
  platform: PlatformType,
  arch: ArchitectureType
): string {
  const extension = getFileExtensionForPlatform(platform);
  return `${appName}-${version}-${platform}-${arch}.${extension}`;
}

/**
 * 工具函数：解析文件名获取平台和架构信息
 */
export function parseFilename(filename: string): {
  platform?: PlatformType;
  arch?: ArchitectureType;
  version?: string;
} | null {
  // 匹配格式: AppName-version-platform-arch.ext
  const pattern = /^.*?-(.+?)-(darwin|win32|linux)-(x64|arm64|ia32|armv7l)\./;
  const match = filename.match(pattern);
  
  if (!match) return null;
  
  const [, version, platform, arch] = match;
  
  if (!isSupportedPlatform(platform) || !isSupportedArchitecture(arch)) {
    return null;
  }
  
  return { version, platform, arch };
}

/**
 * 工具函数：格式化字节数为可读格式
 * 
 * 统一的字节格式化函数，替换所有重复实现
 * 
 * @param bytes - 字节数
 * @param precision - 小数点精度，默认为1位
 * @returns 格式化的字符串，如 "1.5 MB"
 */
export function formatBytes(bytes: number, precision = 1): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  
  if (bytes === 0) return '0 B';
  if (bytes < 0) return '0 B';
  
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  
  // 对于字节单位，不显示小数点
  if (i === 0) {
    return `${Math.round(size)} ${units[i]}`;
  }
  
  return `${size.toFixed(precision)} ${units[i]}`;
}

/**
 * 工具函数：格式化速度为可读格式
 * 
 * 基于 formatBytes 的速度格式化函数
 * 
 * @param bytesPerSecond - 每秒字节数
 * @param precision - 小数点精度，默认为1位
 * @returns 格式化的速度字符串，如 "1.5 MB/s"
 */
export function formatSpeed(bytesPerSecond: number, precision = 1): string {
  const formattedBytes = formatBytes(bytesPerSecond, precision);
  return `${formattedBytes}/s`;
}