/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { FileMetadata } from './FileService';
import { getFileExtension } from './FileService';

type PasteHandler = (event: React.ClipboardEvent | ClipboardEvent) => Promise<boolean>;

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
    // 当粘贴目标是可编辑元素（input/textarea/contentEditable）时，直接交给浏览器原生行为，避免拦截其他输入框
    if (this.shouldAllowNativePaste(event)) {
      return;
    }

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

  private shouldAllowNativePaste(event: ClipboardEvent): boolean {
    const target = event.target;
    if (!target || !(target instanceof Element)) {
      return false;
    }

    const editableElement = target.closest('input, textarea, [contenteditable]');
    if (!editableElement) {
      return false;
    }

    if (editableElement instanceof HTMLInputElement || editableElement instanceof HTMLTextAreaElement) {
      return true;
    }

    if (editableElement instanceof HTMLElement) {
      if (editableElement.isContentEditable) {
        return true;
      }
      const attr = editableElement.getAttribute('contenteditable');
      return !!attr && attr.toLowerCase() !== 'false';
    }

    return false;
  }

  // 通用粘贴处理逻辑
  async handlePaste(event: React.ClipboardEvent | ClipboardEvent, supportedExts: string[], onFilesAdded: (files: FileMetadata[]) => void, onTextPaste?: (text: string) => void): Promise<boolean> {
    // 立即事件冒泡,避免全局监听器重复处理
    event.stopPropagation();
    const clipboardText = event.clipboardData?.getData('text');
    const files = event.clipboardData?.files;
    // If caller passes an empty array, treat it as "allow all file types"
    const allowAll = !supportedExts || supportedExts.length === 0;

    // 优先检查是否有文件，如果有文件则忽略文本（避免粘贴文件时同时插入文件名）
    if (files && files.length > 0) {
      // 处理文件，跳过文本处理
      const fileList: FileMetadata[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as File & { path?: string }).path;

        // 检查是否有文件路径 (Electron 环境下 File 对象会有额外的 path 属性)

        if (!filePath && file.type.startsWith('image/')) {
          // 剪贴板图片，需要检查是否支持该类型
          const fileExt = getFileExtension(file.name) || getExtensionFromMimeType(file.type);

          if (allowAll || supportedExts.includes(fileExt)) {
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

          if (allowAll || supportedExts.includes(fileExt)) {
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

          if (allowAll || supportedExts.includes(fileExt)) {
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

      // 处理完文件后，总是返回 true（阻止文本插入）
      if (fileList.length > 0) {
        onFilesAdded(fileList);
      }
      return true; // 阻止默认行为，不插入文件名文本
    }

    // 处理纯文本粘贴（只在没有文件时）
    if (clipboardText && (!files || files.length === 0)) {
      // 在 iOS 上, 让 Safari 自己处理纯文本粘贴, 以避免粘贴菜单/键盘抖动问题
      const isIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent);
      if (isIOS) {
        return false;
      }
      if (onTextPaste) {
        // 清理文本中多余的换行符，特别是末尾的换行符
        const cleanedText = clipboardText.replace(/\n\s*$/, '');
        onTextPaste(cleanedText);
        return true; // 已处理，阻止默认行为
      }
      return false; // 如果没有回调，允许默认行为
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
