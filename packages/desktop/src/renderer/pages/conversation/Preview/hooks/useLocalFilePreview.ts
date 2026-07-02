/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewContentType } from '@/common/types/office/preview';
import type { LocalFileLinkReference } from '@/renderer/components/Markdown/markdownUtils';
import {
  LARGE_TEXT_PREVIEW_MAX_LENGTH,
  LARGE_TEXT_PREVIEW_THRESHOLD,
} from '@/renderer/pages/conversation/Preview/constants';
import { getContentTypeByExtension } from '@/renderer/pages/conversation/Preview/fileUtils';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import { useCallback } from 'react';

const getFileNameFromPath = (file_path: string): string => {
  const normalized = file_path.replace(/\\/g, '/');
  return normalized.split('/').pop() || file_path;
};

const getPreviewLanguage = (file_name: string): string => {
  const dotIndex = file_name.lastIndexOf('.');
  return dotIndex >= 0 ? file_name.slice(dotIndex + 1).toLowerCase() : '';
};

const shouldReadPreviewContent = (contentType: PreviewContentType): boolean =>
  !['pdf', 'word', 'excel', 'ppt'].includes(contentType);

export const useLocalFilePreview = (workspace?: string) => {
  const { openPreview } = usePreviewContext();

  return useCallback(
    async (file_path: string, reference?: LocalFileLinkReference) => {
      const fileName = getFileNameFromPath(file_path);
      const contentType = getContentTypeByExtension(fileName);
      let content = '';
      let isLargeTextTruncated = false;

      try {
        const metadata = await ipcBridge.fs.getFileMetadata.invoke({ path: file_path, workspace });
        if (metadata == null) throw null;

        if (contentType === 'image') {
          const imageContent = await ipcBridge.fs.getImageBase64.invoke({ path: file_path, workspace });
          if (imageContent == null) throw null;
          content = imageContent;
        } else if (shouldReadPreviewContent(contentType)) {
          const textContent = await ipcBridge.fs.readFile.invoke({ path: file_path, workspace });
          if (textContent == null) throw null;
          content = textContent;

          if (contentType === 'code' && content.length > LARGE_TEXT_PREVIEW_THRESHOLD) {
            content = content.slice(0, LARGE_TEXT_PREVIEW_MAX_LENGTH);
            isLargeTextTruncated = true;
          }
        }

        openPreview(
          content,
          contentType,
          {
            title: fileName,
            file_name: fileName,
            file_path,
            workspace,
            language: getPreviewLanguage(fileName),
            truncated: isLargeTextTruncated,
            targetLine: reference?.line,
            targetColumn: reference?.column,
            editable: contentType === 'markdown' || contentType === 'image' || isLargeTextTruncated ? false : undefined,
          },
          { replace: true }
        );
      } catch {
        openPreview(
          '',
          contentType,
          {
            title: fileName,
            file_name: fileName,
            file_path,
            workspace,
            language: getPreviewLanguage(fileName),
            targetLine: reference?.line,
            targetColumn: reference?.column,
            editable: false,
            missingFile: true,
          },
          { replace: true }
        );
      }
    },
    [openPreview, workspace]
  );
};
