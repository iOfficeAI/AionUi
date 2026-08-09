/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { joinPath } from '@/common/chat/chatLib';
import { localFileRef } from '@/common/types/chatFile';
import type { PreviewContentType } from '@/common/types/office/preview';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { resolvePreviewPayload, upgradeFileRef } from '@/renderer/utils/file/previewPayload';
import { getCurrentProject } from '@/renderer/pages/conversation/explorer/currentProjectStore';
import { classifyPreviewError, type PreviewErrorKind } from '@/renderer/utils/previewError';
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
  file_name?: string;
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
  const [errorKind, setErrorKind] = useState<PreviewErrorKind | null>(null);

  /**
   * 启动预览面板 / Launch preview panel
   */
  const launchPreview = useCallback(
    async ({
      relativePath,
      originalPath,
      file_name,
      title,
      language,
      contentType,
      editable,
      fallbackContent,
      diffContent,
    }: PreviewLaunchOptions) => {
      setLoading(true);
      setErrorKind(null);

      // 路径解析 / Path resolution
      // 优先使用工作区 + 相对路径拼接绝对路径 / Prefer workspace + relative path to build absolute path
      const absolutePath = workspace && relativePath ? joinPath(workspace, relativePath) : undefined;
      const resolvedPath = absolutePath || originalPath || relativePath || undefined;
      // Backend-host absolute path (agent workspace file, no pe identity) → a Local
      // ChatFileRef for content I/O over /api/fs/content. Only when we have an
      // absolute-ish path to read (a bare relativePath can't resolve on the backend).
      const readPath = absolutePath || originalPath;
      // Upgraded to a project identity where possible, so a file opened from a tool
      // card and the same file opened from the explorer are one tab, and this one can
      // receive change signals too.
      const fileRef = readPath ? await upgradeFileRef(localFileRef(readPath), getCurrentProject()) : undefined;

      // 文件名和标题计算 / Compute file name and title
      const computedFileName =
        file_name || (relativePath ? relativePath.split(/[\\/]/).pop() || relativePath : undefined);
      const previewTitle = title || computedFileName || relativePath || contentType.toUpperCase();

      // 预览元数据 / Preview metadata
      const metadata = {
        title: previewTitle,
        file_name: computedFileName || previewTitle,
        fileRef,
        file_path: resolvedPath,
        workspace,
        language,
      };

      // 1. 乐观预览：如果有回退内容（如 Diff 中提取的内容），立即显示 / Optimistic preview: Show fallback content immediately if available
      let hasOpened = false;
      if (typeof fallbackContent === 'string') {
        openPreview(fallbackContent, contentType, {
          ...metadata,
          editable,
        });
        hasOpened = true;
      }

      try {
        // 2. 尝试读取实际文件内容（覆盖乐观预览） / Try to read actual file content (override optimistic preview)
        if (fileRef) {
          try {
            // 单一判定点：取一次 metadata 拿到 size（判上限）与 lastModified（保存时的
            // If-Match 条件），超限则完全不读内容。
            // Single decision point: one metadata call yields size (ceiling check)
            // and lastModified (the save-time If-Match); oversized files are never read.
            const payload = await resolvePreviewPayload(fileRef, contentType);

            openPreview(payload.content, contentType, {
              ...metadata,
              // 超限文件只读：没有内容可编辑，也没有半截内容可被写回。
              // Oversized files are read-only: no content to edit, and no partial
              // content that could be written back over the full file.
              editable: payload.oversized ? false : editable,
              oversized: payload.oversized,
              sizeBytes: payload.sizeBytes,
              thresholdBytes: payload.thresholdBytes,
              lastModified: payload.lastModified,
            });
            return;
          } catch (error) {
            // 读取失败，如果已经显示了乐观预览，则只记录警告
            // Read failed, log warning if optimistic preview is already shown
            setErrorKind(classifyPreviewError(error));
            if (!hasOpened) {
              return;
            }
          }
        }

        // 3. 如果尚未打开且没有成功读取文件，处理回退情况 / If not opened and file read failed, handle fallback cases
        if (!hasOpened) {
          // 显示 diff 内容（只读）/ Show diff content (read-only)
          if (diffContent) {
            openPreview(diffContent, 'diff', {
              ...metadata,
              editable: false,
            });
            return;
          }
        }
      } catch (error) {
        setErrorKind(classifyPreviewError(error));
        console.error('[usePreviewLauncher] Failed to open preview:', error);
      } finally {
        setLoading(false);
      }
    },
    [workspace, openPreview]
  );

  return { launchPreview, loading, errorKind };
};

export type { PreviewLaunchOptions };
