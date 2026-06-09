/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Compact diff renderer used inside chat messages.
 *
 * Historically this component was built on top of `diff2html`. As of
 * AionUi 2.2 it delegates to {@link DiffView} (powered by `@pierre/diffs`)
 * which gives us:
 * - Virtualized rendering (no layout thrash on large patches)
 * - Stacked / side-by-side toggle
 * - Click-to-open-in-editor line navigation
 * - First-class Chisl theming
 *
 * The public prop surface is unchanged so call sites
 * (Workspace GitChangeList, etc.) keep working.
 */

import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { iconColors } from '@/renderer/styles/colors';
import { extractContentFromDiff, parseFilePathFromDiff } from '@/renderer/utils/file/diffUtils';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import { Button, Tooltip } from '@arco-design/web-react';
import { PreviewOpen } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreviewLauncher } from '@renderer/hooks/file/usePreviewLauncher';
import CollapsibleContent from '@renderer/components/chat/CollapsibleContent';
import DiffView from './DiffView';

const Diff2Html = ({
  diff,
  className,
  title,
  file_path,
}: {
  diff: string;
  className?: string;
  title?: string;
  file_path?: string;
}) => {
  const { theme } = useThemeContext();
  const { t } = useTranslation();
  const { launchPreview, loading: previewLoading } = usePreviewLauncher();
  const [sideBySide, setSideBySide] = useState(false);

  const normalizedTitle = useMemo(() => {
    if (!title) return '';
    return title.replace(/^File:\s*/i, '').trim();
  }, [title]);

  const pathFromDiff = useMemo(() => parseFilePathFromDiff(diff), [diff]);

  const resolvedFilePath = useMemo(() => {
    const trimmed = file_path?.trim();
    if (!trimmed) return pathFromDiff || '';
    // If we only get a basename, prefer diff-derived path for subdirectories
    if (!/[\\/]/.test(trimmed)) {
      return pathFromDiff || trimmed;
    }
    return trimmed;
  }, [file_path, pathFromDiff]);

  const relativePath = useMemo(() => {
    if (resolvedFilePath) {
      return resolvedFilePath;
    }
    return normalizedTitle || '';
  }, [normalizedTitle, resolvedFilePath]);

  const file_name = useMemo(() => {
    if (relativePath) {
      const parts = relativePath.split(/[\\/]/);
      return parts[parts.length - 1] || relativePath;
    }
    if (normalizedTitle) {
      const parts = normalizedTitle.split(/[\\/]/);
      return parts[parts.length - 1] || normalizedTitle;
    }
    return 'preview.txt';
  }, [relativePath, normalizedTitle]);

  const previewTitle = normalizedTitle || relativePath || title || file_name;
  const fileTypeInfo = useMemo(() => getFileTypeInfo(file_name), [file_name]);

  const handlePreviewClick = useCallback(
    (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      const { contentType, editable, language } = fileTypeInfo;
      void launchPreview({
        relativePath,
        originalPath: file_path,
        file_name,
        title: previewTitle,
        language,
        contentType,
        editable,
        fallbackContent: editable ? extractContentFromDiff(diff) : undefined,
        diffContent: diff,
      });
    },
    [diff, file_name, file_path, fileTypeInfo, launchPreview, previewTitle, relativePath]
  );

  // Mark `theme` as consumed so the existing CSS Module / token contract
  // is preserved when callers branch on the active Chisl color scheme.
  // The new DiffView reads `data-theme` directly, so the prop is only used
  // to keep the dependency graph explicit in this file.
  void theme;

  return (
    <CollapsibleContent maxHeight={160} defaultCollapsed={true} className={className}>
      <div className='relative w-full max-w-full overflow-x-auto' style={{ WebkitOverflowScrolling: 'touch' }}>
        <DiffView
          diff={diff}
          file_path={resolvedFilePath || undefined}
          initialSplit={sideBySide}
          onSplitChange={setSideBySide}
          // The inline preview button lives in our own toolbar (the
          // header-prefix slot), so we hide DiffView's built-in one and
          // render ours alongside it.
          className='w-full max-w-full min-w-0'
        />
        {/* Inline preview affordance — the "open in panel" action that
         *  used to live inside the diff2html file header. */}
        <div className='flex items-center gap-2 px-3 py-1 text-t-secondary'>
          <Tooltip content={t('preview.openInPanelTooltip')}>
            <Button
              type='text'
              size='mini'
              onClick={handlePreviewClick}
              disabled={previewLoading}
              icon={<PreviewOpen theme='outline' size='14' fill={iconColors.secondary} />}
            >
              {t('preview.preview')}
            </Button>
          </Tooltip>
        </div>
      </div>
    </CollapsibleContent>
  );
};
export default Diff2Html;
