/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewContentType } from '@/common/types/preview';
import { useConversationContextSafe } from '@/renderer/context/ConversationContext';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';
import { useCallback, useState } from 'react';

/**
 * 预览启动选项 / Preview launch options
 */
interface PreviewLaunchOptions {
  /** 相对工作区路径 / Workspace-relative path */
  relativePath?: string;
  /** 备用路径（如绝对路径）/ Fallback path (absolute or provided path) */
  originalPath?: string;
  /** 文件名 / File name */
  fileName?: string;
  /** 预览标题 / Preview title */
  title?: string;
  /** 代码语言（用于语法高亮）/ Code language (for syntax highlighting) */
  language?: string;
  /** 内容类型 / Content type */
  contentType: PreviewContentType;
  /** 是否可编辑 / Whether editable */
  editable: boolean;
  /** 若无法读取文件，使用此内容打开（可编辑）/ Use this content if file read fails (editable) */
  fallbackContent?: string;
  /** 只读 diff 内容回退 / Read-only diff fallback */
  diffContent?: string;
}

/**
 * 统一的预览面板打开逻辑
 * Shared preview launcher logic for components that need edit/preview buttons
 *
 * 处理流程 / Processing flow:
 * 1. 可编辑文件：优先读取实际文件内容 / Editable files: try reading actual file content first
 * 2. 读取失败：使用 fallbackContent 作为回退 / Read failed: use fallbackContent as fallback
 * 3. 不可编辑：显示 diffContent（只读）/ Non-editable: show diffContent (read-only)
 *
 * @returns {{ launchPreview: Function, loading: boolean }}
 */
export const usePreviewLauncher = () => {
  const conversationContext = useConversationContextSafe();
  const workspace = conversationContext?.workspace;
  const { openPreview } = usePreviewContext();
  const [loading, setLoading] = useState(false);

  /**
   * 启动预览面板 / Launch preview panel
   */
  const launchPreview = useCallback(
    async ({ relativePath, originalPath, fileName, title, language, contentType, editable, fallbackContent, diffContent }: PreviewLaunchOptions) => {
      setLoading(true);

      // 路径解析 / Path resolution
      // 优先使用工作区 + 相对路径拼接绝对路径 / Prefer workspace + relative path to build absolute path
      const absolutePath = workspace && relativePath ? `${workspace}/${relativePath}` : undefined;
      const resolvedPath = absolutePath || originalPath || relativePath || undefined;

      // 文件名和标题计算 / Compute file name and title
      const computedFileName = fileName || (relativePath ? relativePath.split(/[\\/]/).pop() || relativePath : undefined);
      const previewTitle = title || computedFileName || relativePath || contentType.toUpperCase();

      // 预览元数据 / Preview metadata
      const metadata = {
        title: previewTitle,
        fileName: computedFileName || previewTitle,
        filePath: resolvedPath,
        workspace,
        language,
      };

      try {
        // 尝试读取实际文件内容 / Try to read actual file content
        if (absolutePath || originalPath) {
          try {
            const pathToRead = absolutePath || originalPath;

            if (contentType === 'image') {
              const base64 = await ipcBridge.fs.getImageBase64.invoke({ path: pathToRead! });
              openPreview(base64, contentType, {
                ...metadata,
                editable,
              });
              return;
            }

            const binaryOnlyTypes: PreviewContentType[] = ['pdf', 'ppt', 'word', 'excel'];
            if (binaryOnlyTypes.includes(contentType)) {
              // 这类格式仅依赖文件路径渲染，不需要实际读取内容
              // These formats rely on file path; no need to read file content
              openPreview('', contentType, {
                ...metadata,
                editable,
              });
              return;
            }

            const content = await ipcBridge.fs.readFile.invoke({ path: pathToRead! });
            openPreview(content, contentType, {
              ...metadata,
              editable,
            });
            return;
          } catch (error) {
            // 读取失败，回退到 fallbackContent / Read failed, fallback to fallbackContent
            console.warn('[usePreviewLauncher] Failed to read file, fallback to provided content:', error);
          }
        }

        // 使用提供的回退内容 / Use provided fallback content
        if (typeof fallbackContent === 'string') {
          openPreview(fallbackContent, contentType, {
            ...metadata,
            editable,
          });
          return;
        }

        // 显示 diff 内容（只读）/ Show diff content (read-only)
        if (diffContent) {
          openPreview(diffContent, 'diff', {
            ...metadata,
            editable: false,
          });
          return;
        }

        // 无法打开预览 / Unable to open preview
        console.warn('[usePreviewLauncher] No content available for preview');
      } catch (error) {
        console.error('[usePreviewLauncher] Failed to open preview:', error);
      } finally {
        setLoading(false);
      }
    },
    [workspace, openPreview]
  );

  return { launchPreview, loading };
};

export type { PreviewLaunchOptions };
