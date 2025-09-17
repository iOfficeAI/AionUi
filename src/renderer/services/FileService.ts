/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';

// 支持的文件类型常量
export const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
export const documentExts = ['.pdf', '.doc', '.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods'];
export const textExts = ['.txt', '.md', '.json', '.xml', '.csv', '.log', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.scss', '.py', '.java', '.cpp', '.c', '.h', '.go', '.rs', '.yml', '.yaml', '.toml', '.ini', '.conf', '.config'];

export const allSupportedExts = [...imageExts, ...documentExts, ...textExts];

// 文件元数据接口
export interface FileMetadata {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: number;
}

// 检查文件是否被支持 (支持所有文件类型)
export function isSupportedFile(fileName: string, supportedExts: string[]): boolean {
  return true; // 支持所有文件类型
}

// 获取文件扩展名
export function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex > -1 ? fileName.substring(lastDotIndex).toLowerCase() : '';
}

// 清理AionUI时间戳后缀，返回原始文件名
export function cleanAionUITimestamp(fileName: string): string {
  return fileName.replace(/_aionui_\d{13}(\.\w+)?$/, '$1');
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

// 过滤支持的文件
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

// 格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// 检查是否为图片文件
export function isImageFile(fileName: string): boolean {
  return isSupportedFile(fileName, imageExts);
}

// 检查是否为文档文件
export function isDocumentFile(fileName: string): boolean {
  return isSupportedFile(fileName, documentExts);
}

// 检查是否为文本文件
export function isTextFile(fileName: string): boolean {
  return isSupportedFile(fileName, textExts);
}

class FileServiceClass {
  /**
   * Process files from drag and drop events, creating temporary files for files without valid paths
   */
  async processDroppedFiles(files: FileList): Promise<FileMetadata[]> {
    const processedFiles: FileMetadata[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // In Electron environment, dragged files have additional path property
      const electronFile = file as File & { path?: string };

      let filePath = electronFile.path || '';

      // If no valid path (some dragged files may not have paths), create temporary file
      if (!filePath) {
        try {
          // Read file content
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);

          // Create temporary file
          const tempPath = await ipcBridge.fs.createTempFile.invoke({ fileName: file.name });
          if (tempPath) {
            await ipcBridge.fs.writeFile.invoke({ path: tempPath, data: uint8Array });
            filePath = tempPath;
          }
        } catch (error) {
          console.error('Failed to create temp file for dragged file:', error);
          // Skip failed files instead of using invalid paths
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
