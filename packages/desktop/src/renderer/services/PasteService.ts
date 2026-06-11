/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FileMetadata } from './FileService';
import { getFileExtension, UPLOAD_ABORTED_ERROR, uploadFileViaHttp } from './FileService';
import { trackUpload, type UploadSource } from '@/renderer/hooks/file/useUploadState';

/**
 * Upload pasted bytes to the backend via HTTP multipart and return the absolute
 * file path stored on disk. Works the same in Electron and WebUI — the backend
 * is always reached over HTTP (the Electron preload injects `window.__backendPort`
 * so requests land on `http://127.0.0.1:<port>`; WebUI hits same-origin).
 *
 * Returns `null` when the upload is cancelled by the user (via the per-file
 * cancel button or a conversation switch); other errors propagate.
 */
async function createTempFile(
  file_name: string,
  data: Uint8Array,
  contentType: string,
  conversation_id?: string,
  source: UploadSource = 'sendbox'
): Promise<string | null> {
  const arrayBuf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuf], { type: contentType });
  const file = new File([blob], file_name, { type: contentType });
  const controller = new AbortController();
  const tracker = trackUpload(file.size, {
    source,
    name: file_name,
    conversationId: conversation_id || undefined,
    onAbort: () => controller.abort(),
  });
  try {
    return await uploadFileViaHttp(file, conversation_id || '', tracker.onProgress, undefined, {
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.message === UPLOAD_ABORTED_ERROR) {
      return null;
    }
    throw error;
  } finally {
    tracker.finish();
  }
}

type PasteHandler = (event: React.ClipboardEvent | ClipboardEvent) => Promise<boolean>;

/**
 * Per-SendBox counter used to assign stable names to clipboard images. The
 * hook owns one instance and passes it into `handlePaste`, so sequence
 * numbers persist across multiple paste actions within the same mount.
 */
export type ImageCounter = { next: () => number };

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

// 浏览器把剪贴板图片默认命名成 image.png / image.jpg 之类，这种名字
// 跟 MIME 一一对应、没有实际语义，应视为系统默认名并由我们重命名。
const BROWSER_DEFAULT_IMAGE_NAME_RE = /^image\.(png|jpe?g|gif|webp|bmp|svg)$/i;
// 我们自己旧版本的默认名，形如 `2024-01-02_03-04-05` 前缀。
const LEGACY_SYSTEM_GENERATED_NAME_RE = /^[a-zA-Z]?_?\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/;

function isSystemGeneratedImageName(name: string | undefined | null): boolean {
  if (!name) return true;
  return LEGACY_SYSTEM_GENERATED_NAME_RE.test(name) || BROWSER_DEFAULT_IMAGE_NAME_RE.test(name);
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
  async handlePaste(
    event: React.ClipboardEvent | ClipboardEvent,
    supportedExts: string[],
    onFilesAdded: (files: FileMetadata[]) => void,
    onTextPaste?: (text: string) => void,
    conversation_id?: string,
    source: UploadSource = 'sendbox',
    imageCounter?: ImageCounter
  ): Promise<boolean> {
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
      const usedFileNames = new Set<string>();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const file_path = (file as File & { path?: string }).path;

        // 检查是否有文件路径 (Electron 环境下 File 对象会有额外的 path 属性)

        if (!file_path && file.type.startsWith('image/')) {
          // 剪贴板图片，需要检查是否支持该类型
          const fileExt = getFileExtension(file.name) || getExtensionFromMimeType(file.type);

          if (allowAll || supportedExts.includes(fileExt)) {
            try {
              const arrayBuffer = await file.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);

              // Generate a concise filename; replace system-generated default names.
              // 剪贴板里的图片通常叫 `image.png` 这种 MIME 默认名，优先按调用方传入的
              // imageCounter 递增序号命名（跨多次粘贴保持唯一）；没给 counter 时退回
              // 到时间戳兜底。
              const isSystemGenerated = isSystemGeneratedImageName(file.name);
              let file_name: string;
              if (!isSystemGenerated && file.name) {
                file_name = file.name;
              } else if (imageCounter) {
                file_name = `image-${imageCounter.next()}${fileExt}`;
              } else {
                const now = new Date();
                const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
                file_name = `pasted_image_${timeStr}${fileExt}`;
              }
              // Ensure unique filename within the same paste batch to prevent
              // collisions when multiple images are pasted simultaneously
              if (usedFileNames.has(file_name)) {
                const extIdx = file_name.lastIndexOf('.');
                const baseName = extIdx > 0 ? file_name.slice(0, extIdx) : file_name;
                const ext = extIdx > 0 ? file_name.slice(extIdx) : fileExt;
                let counter = 2;
                while (usedFileNames.has(`${baseName}_${counter}${ext}`)) {
                  counter++;
                }
                file_name = `${baseName}_${counter}${ext}`;
              }
              usedFileNames.add(file_name);

              // 上传到后端并拿回绝对路径（Electron / WebUI 都走 HTTP multipart）
              const tempPath = await createTempFile(file_name, uint8Array, file.type, conversation_id, source);

              if (tempPath) {
                fileList.push({
                  name: file_name,
                  path: tempPath,
                  size: file.size,
                  type: file.type,
                  lastModified: Date.now(),
                });
              }
            } catch (error) {
              if (error instanceof Error && error.message === 'FILE_TOO_LARGE') {
                throw error;
              }
              console.error('创建临时文件失败:', error);
            }
          } else {
            // 不支持的文件类型，跳过但不报错（让后续过滤处理）
            console.warn(`Unsupported image type: ${file.type}, extension: ${fileExt}`);
          }
        } else if (file_path) {
          // 有文件路径的文件（从文件管理器拖拽的文件）
          // 检查文件类型是否支持
          const fileExt = getFileExtension(file.name);

          if (allowAll || supportedExts.includes(fileExt)) {
            fileList.push({
              name: file.name,
              path: file_path,
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

              // Ensure unique filename within the same paste batch
              let file_name = file.name;
              if (usedFileNames.has(file_name)) {
                const extIdx = file_name.lastIndexOf('.');
                const baseName = extIdx > 0 ? file_name.slice(0, extIdx) : file_name;
                const ext = extIdx > 0 ? file_name.slice(extIdx) : fileExt;
                let counter = 2;
                while (usedFileNames.has(`${baseName}_${counter}${ext}`)) {
                  counter++;
                }
                file_name = `${baseName}_${counter}${ext}`;
              }
              usedFileNames.add(file_name);

              const tempPath = await createTempFile(
                file_name,
                uint8Array,
                file.type || 'application/octet-stream',
                conversation_id,
                source
              );
              if (tempPath) {
                fileList.push({
                  name: file_name,
                  path: tempPath,
                  size: file.size,
                  type: file.type,
                  lastModified: Date.now(),
                });
              }
            } catch (error) {
              if (error instanceof Error && error.message === 'FILE_TOO_LARGE') {
                throw error;
              }
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
