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
import { usePreviewContext } from '../../context/PreviewContext';
import { useConversationContextSafe } from '@/renderer/context/ConversationContext';
import { parseFilePathFromDiff } from '@/renderer/utils/diffUtils';
import { ipcBridge } from '@/common';
import CollapsibleContent from '@/renderer/components/CollapsibleContent';
import { useTranslation } from 'react-i18next';
import { joinPath } from '@/common/chatLib';
import { getContentTypeByExtension, getFileExtension } from '../../utils/fileUtils';

const Diff2Html = ({ diff, className, title }: { diff: string; className?: string; title?: string }) => {
  const { theme } = useThemeContext();
  const { t } = useTranslation();
  const { openPreview, closePreviewByIdentity, findPreviewTab } = usePreviewContext(); // 获取预览上下文 / Get preview context
  const conversationContext = useConversationContextSafe(); // 获取会话上下文 / Get conversation context
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
              onClick={async () => {
                console.log('[Diff2Html] Preview button clicked', { title, isCurrentlyPreviewing, contentType });

                if (isCurrentlyPreviewing) {
                  // 关闭当前文件的预览 / Close preview for this file
                  closePreviewByIdentity(contentType, undefined, fileMeta);
                } else {
                  // 如果有工作空间上下文，尝试从工作空间读取实际文件 / If workspace context exists, try to read actual file from workspace
                  if (conversationContext?.workspace) {
                    try {
                      // 1. 从 diff 中解析文件路径 / Parse file path from diff
                      const relativePath = parseFilePathFromDiff(diff);

                      if (relativePath) {
                        // 2. 构建完整文件路径 / Construct full file path
                        const fullPath = joinPath(conversationContext.workspace, relativePath);

                        // 3. 根据文件类型确定如何处理 / Determine how to handle based on file type
                        if (contentType === 'image') {
                          // 图片文件：读取为 base64 / Image files: Read as base64
                          const imageData = await ipcBridge.fs.getImageBase64.invoke({ path: fullPath });
                          openPreview(imageData, 'image', {
                            title,
                            fileName: title,
                            filePath: fullPath,
                            editable: false,
                          });
                        } else if (contentType === 'pdf' || contentType === 'word' || contentType === 'ppt' || contentType === 'excel') {
                          // Office 文档和 PDF：直接传递文件路径 / Office documents and PDF: Pass file path directly
                          openPreview('', contentType, {
                            title,
                            fileName: title,
                            filePath: fullPath,
                            editable: false,
                          });
                        } else {
                          // 文本文件（markdown, html, code）：读取内容 / Text files (markdown, html, code): Read content
                          const fileContent = await ipcBridge.fs.readFile.invoke({ path: fullPath });

                          const ext = getFileExtension(relativePath);
                          openPreview(fileContent, contentType, {
                            title,
                            fileName: title,
                            filePath: fullPath,
                            language: contentType === 'code' ? ext || 'text' : undefined,
                            editable: false, // 只读预览 / Read-only preview
                          });
                        }
                        return; // 成功读取并打开，提前返回 / Successfully read and opened, return early
                      }
                    } catch (error) {
                      console.error('[Diff2Html] Failed to read file from workspace:', error);
                      // 读取失败时不显示预览 / Don't show preview on read failure
                    }
                  }
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
