/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FileChangeItem } from '@/renderer/components/base/FileChangesPanel';
import { usePreviewLauncher } from '@/renderer/hooks/usePreviewLauncher';
import { extractContentFromDiff } from '@/renderer/utils/diffUtils';
import { getFileTypeInfo } from '@/renderer/utils/fileType';
import { useCallback } from 'react';

interface DiffPreviewHandlersOptions {
  /** Diff text content */
  diffText: string;
  /** Display file name (base name) */
  displayName: string;
  /** Full/relative file path (used for workspace resolution) */
  filePath?: string;
  /** Optional preview panel title */
  title?: string;
}

/**
 * Shared hook for file preview and diff preview click handlers
 *
 * Used by components that display FileChangesPanel and need
 * handleFileClick (open file preview) and handleDiffClick (open diff view)
 */
export const useDiffPreviewHandlers = ({ diffText, displayName, filePath, title }: DiffPreviewHandlersOptions) => {
  const { launchPreview } = usePreviewLauncher();

  const handleFileClick = useCallback(
    (_file: FileChangeItem) => {
      const { contentType, editable, language } = getFileTypeInfo(displayName);
      void launchPreview({
        relativePath: filePath || displayName,
        fileName: displayName,
        title,
        contentType,
        editable,
        language,
        fallbackContent: editable ? extractContentFromDiff(diffText) : undefined,
        diffContent: diffText,
      });
    },
    [diffText, displayName, filePath, title, launchPreview]
  );

  const handleDiffClick = useCallback(
    (_file: FileChangeItem) => {
      void launchPreview({
        fileName: displayName,
        title,
        contentType: 'diff',
        editable: false,
        language: 'diff',
        diffContent: diffText,
      });
    },
    [diffText, displayName, title, launchPreview]
  );

  return { handleFileClick, handleDiffClick };
};
