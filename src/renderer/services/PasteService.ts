/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { FileMetadata } from './FileService';
import { getFileExtension } from './FileService';

type PasteHandler = (event: ClipboardEvent) => Promise<boolean>;

// MIME 类型到文件扩展名的映射
function getExtensionFromMimeType(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/svg+xml': '.svg',
  };
  return mimeMap[mimeType] || '.png'; // 默认为 .png
}

class PasteServiceClass {
  private handlers: Map<string, PasteHandler> = new Map();
  private lastFocusedComponent: string | null = null;
  private isInitialized = false;

  // 初始化全局粘贴监听
  init() {
    if (this.isInitialized) return;

    document.addEventListener('paste', this.handleGlobalPaste);
    this.isInitialized = true;
  }

  // 注册组件的粘贴处理器
  registerHandler(componentId: string, handler: PasteHandler) {
    this.handlers.set(componentId, handler);
  }

  // 注销组件的粘贴处理器
  unregisterHandler(componentId: string) {
    this.handlers.delete(componentId);
  }

  // 设置当前焦点组件
  setLastFocusedComponent(componentId: string) {
    this.lastFocusedComponent = componentId;
  }

  // 全局粘贴事件处理
  private handleGlobalPaste = async (event: ClipboardEvent) => {
    if (!this.lastFocusedComponent) return;

    const handler = this.handlers.get(this.lastFocusedComponent);
    if (handler) {
      const handled = await handler(event);
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  // 通用粘贴处理逻辑
  async handlePaste(event: ClipboardEvent, supportedExts: string[], onFilesAdded: (files: FileMetadata[]) => void, onTextAdded?: (text: string) => void, currentText?: string): Promise<boolean> {
    const clipboardText = event.clipboardData?.getData('text');
    const files = event.clipboardData?.files;

    // 如果有文本但没有文件，允许默认文本粘贴行为
    if (clipboardText && (!files || files.length === 0)) {
      if (onTextAdded) {
        onTextAdded(currentText ? currentText + clipboardText : clipboardText);
      }
      return false; // 允许默认行为继续处理文本
    }

    // 处理文件
    if (files && files.length > 0) {
      const fileList: FileMetadata[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as File & { path?: string }).path;

        // 检查是否有文件路径 (Electron 环境下 File 对象会有额外的 path 属性)

        if (!filePath && file.type.startsWith('image/')) {
          // 剪贴板图片，需要检查是否支持该类型
          const fileExt = getFileExtension(file.name) || getExtensionFromMimeType(file.type);

          if (supportedExts.includes(fileExt)) {
            try {
              const arrayBuffer = await file.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);

              // 生成简洁的文件名，如果剪贴板图片有奇怪的默认名，替换为简洁名称
              const now = new Date();
              const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;

              // 如果文件名看起来像系统生成的（包含时间戳格式），使用我们的命名
              const isSystemGenerated = file.name && /^[a-zA-Z]?_?\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(file.name);
              const fileName = file.name && !isSystemGenerated ? file.name : `pasted_image_${timeStr}${fileExt}`;

              // 创建临时文件并写入数据
              const tempPath = await ipcBridge.fs.createTempFile.invoke({ fileName });
              if (tempPath) {
                await ipcBridge.fs.writeFile.invoke({ path: tempPath, data: uint8Array });
              }

              if (tempPath) {
                fileList.push({
                  name: fileName,
                  path: tempPath,
                  size: file.size,
                  type: file.type,
                  lastModified: Date.now(),
                });
              }
            } catch (error) {
              console.error('创建临时文件失败:', error);
            }
          } else {
            // 不支持的文件类型，跳过但不报错（让后续过滤处理）
            console.warn(`Unsupported image type: ${file.type}, extension: ${fileExt}`);
          }
        } else if (filePath) {
          // 有文件路径的文件（从文件管理器拖拽的文件）
          // 检查文件类型是否支持
          const fileExt = getFileExtension(file.name);

          if (supportedExts.includes(fileExt)) {
            fileList.push({
              name: file.name,
              path: filePath,
              size: file.size,
              type: file.type,
              lastModified: file.lastModified,
            });
          } else {
            // 不支持的文件类型
            console.warn(`Unsupported file type: ${file.name}, extension: ${fileExt}`);
          }
        } else if (!file.type.startsWith('image/')) {
          // 没有文件路径的非图片文件（从文件管理器复制粘贴的文件）
          const fileExt = getFileExtension(file.name);

          if (supportedExts.includes(fileExt)) {
            // 对于复制粘贴的文件，我们需要创建临时文件
            try {
              const arrayBuffer = await file.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);

              // 使用原文件名
              const fileName = file.name;

              // 创建临时文件并写入数据
              const tempPath = await ipcBridge.fs.createTempFile.invoke({ fileName });
              if (tempPath) {
                await ipcBridge.fs.writeFile.invoke({ path: tempPath, data: uint8Array });

                fileList.push({
                  name: fileName,
                  path: tempPath,
                  size: file.size,
                  type: file.type,
                  lastModified: Date.now(),
                });
              }
            } catch (error) {
              console.error('创建临时文件失败:', error);
            }
          } else {
            console.warn(`Unsupported file type: ${file.name}, extension: ${fileExt}`);
          }
        }
      }

      // 处理完文件后，总是返回 true（因为已经 preventDefault）
      if (fileList.length > 0) {
        onFilesAdded(fileList);
      }
      return true; // 已经调用了 preventDefault，必须返回 true
    }

    return false;
  }

  // 清理资源
  destroy() {
    if (this.isInitialized) {
      document.removeEventListener('paste', this.handleGlobalPaste);
      this.handlers.clear();
      this.lastFocusedComponent = null;
      this.isInitialized = false;
    }
  }
}

// 导出单例实例
export const PasteService = new PasteServiceClass();
