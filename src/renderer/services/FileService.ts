/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { trackUpload, type UploadSource } from '@/renderer/hooks/file/useUploadState';
import { isElectronDesktop } from '@/renderer/utils/platform';

/** Max upload size in MB — keep in sync with server-side MAX_UPLOAD_SIZE in apiRoutes.ts */
export const MAX_UPLOAD_SIZE_MB = 30;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

/**
 * Upload a file to the server via HTTP multipart (WebUI mode).
 * Conversation-bound uploads go to the workspace uploads directory; pre-conversation uploads go to temp storage.
 *
 * @param onProgress Optional callback receiving upload percentage (0-100).
 */
export async function uploadFileViaHttp(
  file: File,
  conversationId?: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error('FILE_TOO_LARGE');
  }
  const formData = new FormData();
  formData.append('file', file);
  if (conversationId) {
    formData.append('conversationId', conversationId);
  }

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.withCredentials = true;

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status === 413) {
        reject(new Error('FILE_TOO_LARGE'));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        return;
      }
      try {
        const result = JSON.parse(xhr.responseText) as { success: boolean; data?: { path: string } };
        if (!result.success || !result.data) {
          reject(new Error('Upload failed: server returned unsuccessful response'));
        } else {
          resolve(result.data.path);
        }
      } catch {
        reject(new Error('Upload failed: invalid server response'));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed: network error'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    xhr.send(formData);
  });
}
// Simple formatBytes implementation moved from deleted updateConfig
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ===== 文件类型支持配置 =====
// 注意：当前为预先设计的架构，支持所有文件类型
// 以下常量为将来可能的文件类型过滤功能预留

/** 支持的图片文件扩展名 */
export const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];

/** 支持的文档文件扩展名 */
export const documentExts = ['.pdf', '.doc', '.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods'];

/** 支持的文本文件扩展名 */
export const textExts = [
  '.txt',
  '.md',
  '.json',
  '.xml',
  '.csv',
  '.log',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.html',
  '.css',
  '.scss',
  '.py',
  '.java',
  '.cpp',
  '.c',
  '.h',
  '.go',
  '.rs',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.conf',
  '.config',
];

/** 所有支持的文件扩展名（预先设计，当前实际接受所有文件类型） */
export const allSupportedExts = [...imageExts, ...documentExts, ...textExts];

// 文件元数据接口
export interface FileMetadata {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: number;
}

/**
 * 检查文件是否被支持
 * 注意：当前实现为预先设计的架构，支持所有文件类型
 * supportedExts 参数预留给将来的文件类型过滤功能
 *
 * @param _fileName 文件名（预留参数）
 * @param _supportedExts 支持的文件扩展名数组（预留参数）
 * @returns 总是返回 true，表示支持所有文件类型
 */
export function isSupportedFile(_fileName: string, _supportedExts: string[]): boolean {
  return true; // 预先设计：当前支持所有文件类型
}

// 获取文件扩展名
export function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex > -1 ? fileName.substring(lastDotIndex).toLowerCase() : '';
}

import { AIONUI_TIMESTAMP_REGEX } from '@/common/config/constants';

// 清理AionUI时间戳后缀，返回原始文件名
export function cleanAionUITimestamp(fileName: string): string {
  return fileName.replace(AIONUI_TIMESTAMP_REGEX, '$1');
}

// 从文件路径获取清理后的文件名（用于UI显示）
export function getCleanFileName(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).pop() || '';
  return cleanAionUITimestamp(fileName);
}

// 从文件路径数组获取清理后的文件名数组（用于消息格式化）
export function getCleanFileNames(filePaths: string[]): string[] {
  return filePaths.map(getCleanFileName);
}

/**
 * 过滤支持的文件
 * 注意：由于 isSupportedFile 当前总是返回 true，此函数实际不会过滤任何文件
 * 这是预先设计的架构，为将来的文件类型过滤功能预留
 *
 * @param files 文件元数据数组
 * @param supportedExts 支持的文件扩展名数组（预留参数）
 * @returns 当前返回所有文件，未进行过滤
 */
export function filterSupportedFiles(files: FileMetadata[], supportedExts: string[]): FileMetadata[] {
  return files.filter((file) => isSupportedFile(file.name, supportedExts));
}

// 从拖拽事件中提取文件 (纯工具函数，不处理业务逻辑)
export function getFilesFromDropEvent(event: DragEvent): FileMetadata[] {
  const files: FileMetadata[] = [];

  if (!event.dataTransfer?.files) {
    return files;
  }

  for (let i = 0; i < event.dataTransfer.files.length; i++) {
    const file = event.dataTransfer.files[i];
    // 在 Electron 环境中，拖拽文件会有额外的 path 属性
    const electronFile = file as File & { path?: string };

    files.push({
      name: file.name,
      path: electronFile.path || '', // 原始路径，可能为空
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    });
  }

  return files;
}

// 从拖拽事件中提取文本
export function getTextFromDropEvent(event: DragEvent): string {
  return event.dataTransfer?.getData('text/plain') || '';
}

// 格式化文件大小（使用统一的formatBytes实现）
export function formatFileSize(bytes: number): string {
  return formatBytes(bytes, 2); // 保持2位精度以兼容之前的行为
}

/**
 * 检查是否为图片文件
 * 注意：由于 isSupportedFile 当前总是返回 true，此函数实际总是返回 true
 * 预先设计的架构，为将来的文件类型判断功能预留
 * 当前未被使用，保留供将来扩展
 */
export function isImageFile(fileName: string): boolean {
  return isSupportedFile(fileName, imageExts);
}

/**
 * 检查是否为文档文件
 * 注意：由于 isSupportedFile 当前总是返回 true，此函数实际总是返回 true
 * 预先设计的架构，为将来的文件类型判断功能预留
 * 当前未被使用，保留供将来扩展
 */
export function isDocumentFile(fileName: string): boolean {
  return isSupportedFile(fileName, documentExts);
}

/**
 * 检查是否为文本文件
 * 注意：由于 isSupportedFile 当前总是返回 true，此函数实际总是返回 true
 * 预先设计的架构，为将来的文件类型判断功能预留
 * 当前未被使用，保留供将来扩展
 */
export function isTextFile(fileName: string): boolean {
  return isSupportedFile(fileName, textExts);
}

class FileServiceClass {
  /**
   * Process files from drag and drop events, creating temporary files for files without valid paths.
   * In WebUI mode, uploads files via HTTP to the conversation workspace uploads directory.
   */
  async processDroppedFiles(
    files: FileList,
    conversationId?: string,
    source: UploadSource = 'sendbox'
  ): Promise<FileMetadata[]> {
    const processedFiles: FileMetadata[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // In Electron environment, dragged files have additional path property
      const electronFile = file as File & { path?: string };

      let filePath = electronFile.path || '';

      // If no valid path (WebUI or some dragged files may not have paths), create temporary file
      if (!filePath) {
        try {
          if (!isElectronDesktop()) {
            // WebUI: upload via HTTP multipart to the conversation workspace uploads directory
            const tracker = trackUpload(file.size, source);
            try {
              filePath = await uploadFileViaHttp(file, conversationId || '', tracker.onProgress);
            } finally {
              tracker.finish();
            }
          } else {
            // Electron: use IPC to create temp file
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const tempPath = await ipcBridge.fs.createTempFile.invoke({ fileName: file.name });
            if (tempPath) {
              await ipcBridge.fs.writeFile.invoke({ path: tempPath, data: uint8Array });
              filePath = tempPath;
            }
          }
        } catch (error) {
          // Re-throw size errors so caller can show user-facing toast
          if (error instanceof Error && error.message === 'FILE_TOO_LARGE') {
            throw error;
          }
          console.error('Failed to create temp file for dragged file:', error);
          continue;
        }
      }

      processedFiles.push({
        name: file.name,
        path: filePath,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      });
    }

    return processedFiles;
  }
}

export const FileService = new FileServiceClass();
