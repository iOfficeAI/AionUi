/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import FileChangesPanel, { type FileChangeItem } from '@/renderer/components/base/FileChangesPanel';
import { usePreviewLauncher } from '@/renderer/hooks/file/usePreviewLauncher';
import { extractContentFromDiff, parseDiff, type FileChangeInfo } from '@/renderer/utils/file/diffUtils';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { WriteFileResult } from './types';

export { parseDiff, type FileChangeInfo } from '@/renderer/utils/file/diffUtils';

export interface MessageFileChangesProps {
  writeFileChanges?: WriteFileResult[];
  className?: string;
  diffsChanges?: FileChangeInfo[];
}

const MessageFileChanges: React.FC<MessageFileChangesProps> = ({
  writeFileChanges = [],
  diffsChanges = [],
  className,
}) => {
  const { t } = useTranslation();
  const { launchPreview } = usePreviewLauncher();

  const fileChanges = useMemo(() => {
    return Array.from(new Map(diffsChanges.map((fileInfo) => [fileInfo.fullPath, fileInfo])).values()).concat(
      writeFileChanges.flatMap((change) => {
        if (!change.file_diff) {
          return [];
        }
        return [parseDiff(change.file_diff, change.file_name)];
      })
    );
  }, [diffsChanges, writeFileChanges]);

  const handleFileClick = useCallback(
    (file: FileChangeItem) => {
      const fileInfo = fileChanges.find((candidate) => candidate.fullPath === file.fullPath);
      if (!fileInfo) return;

      const { contentType, editable, language } = getFileTypeInfo(fileInfo.file_name);

      void launchPreview({
        relativePath: fileInfo.fullPath,
        file_name: fileInfo.file_name,
        contentType,
        editable,
        language,
        fallbackContent: editable ? extractContentFromDiff(fileInfo.diff) : undefined,
        diffContent: fileInfo.diff,
      });
    },
    [fileChanges, launchPreview]
  );

  const handleDiffClick = useCallback(
    (file: FileChangeItem) => {
      const fileInfo = fileChanges.find((candidate) => candidate.fullPath === file.fullPath);
      if (!fileInfo) return;

      void launchPreview({
        file_name: fileInfo.file_name,
        contentType: 'diff',
        editable: false,
        language: 'diff',
        diffContent: fileInfo.diff,
      });
    },
    [fileChanges, launchPreview]
  );

  if (fileChanges.length === 0) {
    return null;
  }

  return (
    <FileChangesPanel
      title={t('messages.fileChangesCount', { count: fileChanges.length })}
      files={fileChanges}
      onFileClick={handleFileClick}
      onDiffClick={handleDiffClick}
      className={className}
    />
  );
};

export default React.memo(MessageFileChanges);
