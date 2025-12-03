/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import FileChangesPanel, { type FileChangeItem } from '@/renderer/components/base/FileChangesPanel';
import { usePreviewLauncher } from '@/renderer/hooks/usePreviewLauncher';
import { extractContentFromDiff } from '@/renderer/utils/diffUtils';
import { getFileTypeInfo } from '@/renderer/utils/fileType';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { WriteFileResult } from '../types';

type TurnDiffContent = Extract<CodexToolCallUpdate, { subtype: 'turn_diff' }>;

// 内部文件变更信息（包含 diff 内容）/ Internal file change info (including diff content)
interface FileChangeInfo extends FileChangeItem {
  diff: string;
}

// 支持两种数据源 / Support two data sources
export interface MessageFileChangesProps {
  /** Codex turn_diff 消息列表 / Codex turn_diff messages */
  turnDiffChanges?: TurnDiffContent[];
  /** Gemini tool_group WriteFile 结果列表 / Gemini tool_group WriteFile results */
  writeFileChanges?: WriteFileResult[];
  /** 额外的类名 / Additional class name */
  className?: string;
}

/**
 * 解析 unified diff 格式，提取文件信息和变更统计
 * Parse unified diff format, extract file info and change statistics
 */
const parseDiff = (diff: string, fileNameHint?: string): FileChangeInfo => {
  const lines = diff.split('\n');

  // 提取文件名 / Extract filename
  const gitLine = lines.find((line) => line.startsWith('diff --git'));
  let fileName = fileNameHint || 'Unknown file';
  let fullPath = fileNameHint || 'Unknown file';

  if (gitLine) {
    const match = gitLine.match(/diff --git a\/(.+) b\/(.+)/);
    if (match) {
      fullPath = match[1];
      fileName = fullPath.split('/').pop() || fullPath;
    }
  } else if (fileNameHint) {
    // 如果没有 git diff 头，使用 hint 作为文件名 / If no git diff header, use hint as filename
    fileName = fileNameHint.split('/').pop() || fileNameHint;
    fullPath = fileNameHint;
  }

  // 计算新增和删除的行数 / Calculate insertions and deletions
  let insertions = 0;
  let deletions = 0;

  for (const line of lines) {
    // 跳过 diff 头部行 / Skip diff header lines
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@') || line.startsWith('\\')) {
      continue;
    }

    // 计算新增行（以 + 开头但不是 +++）/ Count insertions (lines starting with + but not +++)
    if (line.startsWith('+')) {
      insertions++;
    }
    // 计算删除行（以 - 开头但不是 ---）/ Count deletions (lines starting with - but not ---)
    else if (line.startsWith('-')) {
      deletions++;
    }
  }

  return {
    fileName,
    fullPath,
    insertions,
    deletions,
    diff,
  };
};

/**
 * 文件变更消息组件
 * File changes message component
 *
 * 显示会话中所有已生成/修改的文件，点击可打开预览
 * Display all generated/modified files in the conversation, click to preview
 */
const MessageFileChanges: React.FC<MessageFileChangesProps> = ({ turnDiffChanges = [], writeFileChanges = [], className }) => {
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

    return Array.from(filesMap.values());
  }, [turnDiffChanges, writeFileChanges]);

  // 处理文件点击 / Handle file click
  const handleFileClick = useCallback(
    (file: FileChangeItem) => {
      // 找到对应的 FileChangeInfo 获取 diff / Find corresponding FileChangeInfo to get diff
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

  // 如果没有文件变更，不渲染 / Don't render if no file changes
  if (fileChanges.length === 0) {
    return null;
  }

  return <FileChangesPanel title={t('messages.fileChangesCount', { count: fileChanges.length })} files={fileChanges} onFileClick={handleFileClick} className={className} />;
};

export default MessageFileChanges;
