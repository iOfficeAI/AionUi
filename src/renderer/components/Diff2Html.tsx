/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import { Checkbox, Tooltip, Button } from '@arco-design/web-react';
import { ExpandDownOne, FoldUpOne, PreviewOpen } from '@icon-park/react';
import classNames from 'classnames';
import ReactDOM from 'react-dom';
import { iconColors } from '@/renderer/theme/colors';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import { extractContentFromDiff, parseFilePathFromDiff } from '@/renderer/utils/diffUtils';
import { getFileTypeInfo } from '@/renderer/utils/fileType';
import CollapsibleContent from './CollapsibleContent';
import { useTranslation } from 'react-i18next';
import { usePreviewLauncher } from '@/renderer/hooks/usePreviewLauncher';

const Diff2Html = ({ diff, className, title, filePath }: { diff: string; className?: string; title?: string; filePath?: string }) => {
  const { theme } = useThemeContext();
  const { t } = useTranslation();
  const { launchPreview, loading: previewLoading } = usePreviewLauncher();
  const [sideBySide, setSideBySide] = useState(false);
  const [collapse, setCollapse] = useState(false);

  const diffHtmlContent = useMemo(() => {
    return html(diff, {
      outputFormat: sideBySide ? 'side-by-side' : 'line-by-line',
      drawFileList: false,
      matching: 'lines',
      matchWordsThreshold: 0,
      maxLineLengthHighlight: 20,
      matchingMaxComparisons: 3,
      diffStyle: 'word',
      renderNothingWhenEmpty: false,
    });
  }, [diff, sideBySide]);

  // Lazy init operatorRef to avoid creating div on every render
  const operatorRef = useRef<HTMLDivElement | null>(null);
  if (!operatorRef.current) {
    operatorRef.current = document.createElement('div');
  }

  const normalizedTitle = useMemo(() => {
    if (!title) return '';
    return title.replace(/^File:\s*/i, '').trim();
  }, [title]);

  const relativePath = useMemo(() => {
    if (filePath && filePath.trim()) {
      return filePath.trim();
    }
    return parseFilePathFromDiff(diff) || normalizedTitle || '';
  }, [diff, normalizedTitle, filePath]);

  const fileName = useMemo(() => {
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

  const previewTitle = normalizedTitle || relativePath || title || fileName;
  const fileTypeInfo = useMemo(() => getFileTypeInfo(fileName), [fileName]);

  const handlePreviewClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      if (e.preventDefault) e.preventDefault();
      const { contentType, editable, language } = fileTypeInfo;
      void launchPreview({
        relativePath,
        originalPath: filePath,
        fileName,
        title: previewTitle,
        language,
        contentType,
        editable,
        fallbackContent: editable ? extractContentFromDiff(diff) : undefined,
        diffContent: diff,
      });
    },
    [diff, fileName, filePath, fileTypeInfo, launchPreview, previewTitle, relativePath]
  );

  const containerRef = useRef<HTMLDivElement>(null);

  // Re-attach operatorRef to the DOM whenever component updates
  // We remove the dependency array to ensure this runs on every render/update,
  // guaranteeing the button is always attached and styled correctly.
  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // diff2html renders file headers with class 'd2h-file-header'
    const header = el.querySelectorAll('.d2h-file-header')[0] as HTMLDivElement;
    if (header && operatorRef.current) {
      // Always enforce styles
      header.style.alignItems = 'center';
      header.style.height = '23px';

      operatorRef.current.className = 'flex items-center justify-center gap-10px';

      // Ensure operatorRef.current is appended
      if (!header.contains(operatorRef.current)) {
        header.appendChild(operatorRef.current);
      }

      const name = header.querySelector('.d2h-file-name') as HTMLDivElement;
      if (name && title) {
        name.innerHTML = title;
      }
    } else {
      console.warn('[Diff2Html] Header or operatorRef missing', { hasHeader: !!header, hasRef: !!operatorRef.current });
    }
  });

  return (
    <CollapsibleContent maxHeight={160} defaultCollapsed={true} className={className}>
      <div className='relative w-full max-w-full overflow-x-auto' style={{ WebkitOverflowScrolling: 'touch' }}>
        <div
          className={classNames('![&_.line-num1]:hidden ![&_.line-num2]:w-30px [&_td:first-child]:w-40px ![&_td:nth-child(2)>div]:pl-45px min-w-0 max-w-full [&_div.d2f-file-wrapper]:rd-[0.3rem_0.3rem_0px_0px]  [&_div.d2h-file-header]:items-center [&_div.d2h-file-header]:bg-bg-3', {
            '[&_.d2h-file-diff]:hidden [&_.d2h-files-diff]:hidden': collapse,
            'd2h-dark-color-scheme': theme === 'dark',
          })}
          ref={containerRef}
          dangerouslySetInnerHTML={{
            __html: diffHtmlContent,
          }}
        ></div>
        {operatorRef.current &&
          ReactDOM.createPortal(
            <>
              {/* side-by-side 选项 / Side-by-side option */}
              <Checkbox className='whitespace-nowrap' checked={sideBySide} onChange={(value) => setSideBySide(value)}>
                <span className='whitespace-nowrap'>side-by-side</span>
              </Checkbox>

              <Tooltip content={t('preview.openInPanelTooltip')}>
                <Button type='text' size='mini' onClick={handlePreviewClick as any} disabled={previewLoading} icon={<PreviewOpen theme='outline' size='14' fill={iconColors.secondary} />}>
                  {t('preview.preview')}
                </Button>
              </Tooltip>

              {/* 折叠按钮 / Collapse button */}
              {collapse ? <ExpandDownOne theme='outline' size='14' fill={iconColors.secondary} className='flex items-center' onClick={() => setCollapse(false)} /> : <FoldUpOne theme='outline' size='14' fill={iconColors.secondary} className='flex items-center' onClick={() => setCollapse(true)} />}
            </>,
            operatorRef.current
          )}
      </div>
    </CollapsibleContent>
  );
};
export default Diff2Html;
