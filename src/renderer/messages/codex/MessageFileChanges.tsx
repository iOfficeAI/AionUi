/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import FileChangesPanel, { type FileChangeItem } from '@/renderer/components/base/FileChangesPanel';
import { usePreviewLauncher } from '@/renderer/hooks/usePreviewLauncher';
import { extractContentFromDiff, parseDiff, type FileChangeInfo } from '@/renderer/utils/diffUtils';
import { getFileTypeInfo } from '@/renderer/utils/fileType';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { WriteFileResult } from '../types';

// Re-export for backwards compatibility
export { parseDiff, type FileChangeInfo } from '@/renderer/utils/diffUtils';

type TurnDiffContent = Extract<CodexToolCallUpdate, { subtype: 'turn_diff' }>;

// 支持两种数据源 / Support two data sources
export interface MessageFileChangesProps {
  /** Codex turn_diff 消息列表 / Codex turn_diff messages */
  turnDiffChanges?: TurnDiffContent[];
  /** Gemini tool_group WriteFile 结果列表 / Gemini tool_group WriteFile results */
  writeFileChanges?: WriteFileResult[];
  /** 额外的类名 / Additional class name */
  className?: string;

  diffsChanges?: FileChangeInfo[];
}

/**
 * 文件变更消息组件
 * File changes message component
 *
 * 显示会话中所有已生成/修改的文件，点击可打开预览
 * Display all generated/modified files in the conversation, click to preview
 */
const MessageFileChanges: React.FC<MessageFileChangesProps> = ({ turnDiffChanges = [], writeFileChanges = [], diffsChanges = [], className }) => {
  const { t } = useTranslation();
  const { launchPreview } = usePreviewLauncher();

  // 解析所有文件变更 / Parse all file changes
  const fileChanges = useMemo(() => {
    const filesMap = new Map<string, FileChangeInfo>();

    // 处理 Codex turn_diff 消息 / Process Codex turn_diff messages
    for (const change of turnDiffChanges) {
      const fileInfo = parseDiff(change.data.unified_diff);
      filesMap.set(fileInfo.fullPath, fileInfo);
    }

    // 处理 Gemini WriteFile 结果 / Process Gemini WriteFile results
    for (const change of writeFileChanges) {
      if (change.fileDiff) {
        const fileInfo = parseDiff(change.fileDiff, change.fileName);
        filesMap.set(fileInfo.fullPath, fileInfo);
      }
    }

    return Array.from(filesMap.values()).concat(diffsChanges);
  }, [turnDiffChanges, writeFileChanges, diffsChanges]);

  // 点击预览按钮 → 打开文件预览 / Click preview button → open file preview
  const handleFileClick = useCallback(
    (file: FileChangeItem) => {
      const fileInfo = fileChanges.find((f) => f.fullPath === file.fullPath);
      if (!fileInfo) return;

      const { contentType, editable, language } = getFileTypeInfo(fileInfo.fileName);

      void launchPreview({
        relativePath: fileInfo.fullPath,
        fileName: fileInfo.fileName,
        contentType,
        editable,
        language,
        fallbackContent: editable ? extractContentFromDiff(fileInfo.diff) : undefined,
        diffContent: fileInfo.diff,
      });
    },
    [fileChanges, launchPreview]
  );

  // 点击变更统计 → 打开 diff 对比视图 / Click change stats → open diff comparison view
  const handleDiffClick = useCallback(
    (file: FileChangeItem) => {
      const fileInfo = fileChanges.find((f) => f.fullPath === file.fullPath);
      if (!fileInfo) return;

      void launchPreview({
        fileName: fileInfo.fileName,
        contentType: 'diff',
        editable: false,
        language: 'diff',
        diffContent: fileInfo.diff,
      });
    },
    [fileChanges, launchPreview]
  );

  // 如果没有文件变更，不渲染 / Don't render if no file changes
  if (fileChanges.length === 0) {
    return null;
  }

  return <FileChangesPanel title={t('messages.fileChangesCount', { count: fileChanges.length })} files={fileChanges} onFileClick={handleFileClick} onDiffClick={handleDiffClick} className={className} />;
};

export default React.memo(MessageFileChanges);
