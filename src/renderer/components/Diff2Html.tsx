/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import { html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import { Checkbox } from '@arco-design/web-react';
import { ExpandDownOne, FoldUpOne, PreviewOpen } from '@icon-park/react';
import classNames from 'classnames';
import ReactDOM from 'react-dom';
import { iconColors } from '@/renderer/theme/colors';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import { usePreviewContext, getContentTypeByExtension } from '@/renderer/pages/conversation/preview';
import CollapsibleContent from './CollapsibleContent';
import { useTranslation } from 'react-i18next';

const Diff2Html = ({ diff, className, title }: { diff: string; className?: string; title?: string }) => {
  const { theme } = useThemeContext();
  const { t } = useTranslation();
  const { openPreview, closePreviewByIdentity, findPreviewTab } = usePreviewContext(); // 获取预览上下文 / Get preview context
  const [sideBySide, setSideBySide] = useState(false);
  const [collapse, setCollapse] = useState(false);

  // 检查当前 diff 是否正在预览中 / Check if current diff is being previewed
  const fileMeta = title ? { title, fileName: title } : undefined;
  const contentType = title ? getContentTypeByExtension(title) : 'code';
  const previewTab = fileMeta ? findPreviewTab(contentType, undefined, fileMeta) : null;
  const isCurrentlyPreviewing = !!previewTab;
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
  const operatorRef = useRef<HTMLDivElement>(document.createElement('div'));

  return (
    <CollapsibleContent maxHeight={160} defaultCollapsed={true} className={className}>
      <div className='relative w-full max-w-full overflow-x-auto' style={{ WebkitOverflowScrolling: 'touch' }}>
        <div
          className={classNames('![&_.line-num1]:hidden ![&_.line-num2]:w-30px [&_td:first-child]:w-40px ![&_td:nth-child(2)>div]:pl-45px min-w-0 max-w-full [&_div.d2f-file-wrapper]:rd-[0.3rem_0.3rem_0px_0px]  [&_div.d2h-file-header]:items-center [&_div.d2h-file-header]:bg-bg-3', {
            '[&_.d2h-file-diff]:hidden [&_.d2h-files-diff]:hidden': collapse,
            'd2h-dark-color-scheme': theme === 'dark',
          })}
          ref={(el) => {
            if (!el) return;
            const header = el.querySelectorAll('.d2h-file-header')[0] as HTMLDivElement;
            if (header) {
              header.style.alignItems = 'center';
              header.style.height = '23px';
              operatorRef.current.className = 'flex items-center justify-center gap-10px';
              header.appendChild(operatorRef.current);
              const name = header.querySelector('.d2h-file-name') as HTMLDivElement;
              if (name && title) {
                name.innerHTML = title;
              }
            }
          }}
          dangerouslySetInnerHTML={{
            __html: diffHtmlContent,
          }}
        ></div>
        {ReactDOM.createPortal(
          <>
            {/* 预览按钮 / Preview button */}
            <div
              className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-3 transition-colors'
              onClick={() => {
                if (isCurrentlyPreviewing) {
                  // 关闭当前文件的预览 / Close preview for this file
                  closePreviewByIdentity(contentType, undefined, fileMeta);
                } else {
                  // 直接预览 diff 内容 / Preview diff content directly
                  openPreview(diff, 'diff', {
                    title: title || 'Diff',
                    fileName: title,
                    editable: false,
                  });
                }
              }}
              title={isCurrentlyPreviewing ? t('preview.closePreview') : t('preview.preview')}
            >
              <PreviewOpen theme='outline' size='14' fill={iconColors.secondary} />
              <span className='text-12px text-t-secondary whitespace-nowrap'>{isCurrentlyPreviewing ? t('preview.closePreview') : t('preview.preview')}</span>
            </div>

            {/* 原有的 side-by-side 选项 / Original side-by-side option */}
            <Checkbox className='whitespace-nowrap' checked={sideBySide} onChange={(value) => setSideBySide(value)}>
              <span className='whitespace-nowrap'>side-by-side</span>
            </Checkbox>

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
