/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import FileChangesPanel, { type FileChangeItem } from '@/renderer/components/base/FileChangesPanel';
import { usePreviewLauncher } from '@/renderer/hooks/usePreviewLauncher';
import { parseDiff } from '../MessageFileChanges';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type TurnDiffContent = Extract<CodexToolCallUpdate, { subtype: 'turn_diff' }>;

const TurnDiffDisplay: React.FC<{ content: TurnDiffContent }> = ({ content }) => {
  const { t } = useTranslation();
  const { launchPreview } = usePreviewLauncher();
  const { data } = content;
  const { unified_diff } = data;

  const fileInfo = useMemo(() => parseDiff(unified_diff), [unified_diff]);

  const handleFileClick = useCallback(
    (_file: FileChangeItem) => {
      void launchPreview({
        relativePath: fileInfo.fullPath,
        fileName: fileInfo.fileName,
        contentType: 'diff',
        editable: false,
        language: 'diff',
        diffContent: unified_diff,
      });
    },
    [fileInfo, launchPreview, unified_diff]
  );

  return <FileChangesPanel title={t('messages.fileChangesCount', { count: 1 })} files={[fileInfo]} onFileClick={handleFileClick} defaultExpanded={true} />;
};

export default TurnDiffDisplay;
