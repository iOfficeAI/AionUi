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
import { usePreviewContext } from '@/renderer/context/PreviewContext';
import { useConversationContextSafe } from '@/renderer/context/ConversationContext';
import { parseFilePathFromDiff } from '@/renderer/utils/diffUtils';
import { ipcBridge } from '@/common';
import CollapsibleContent from './CollapsibleContent';

// 辅助函数：拼接路径 / Helper function: Join paths
const joinPath = (base: string, relative: string): string => {
  // 移除 base 末尾的斜杠 / Remove trailing slash from base
  const normalizedBase = base.replace(/[/\\]+$/, '');
  // 移除 relative 开头的斜杠 / Remove leading slash from relative
  const normalizedRelative = relative.replace(/^[/\\]+/, '');
  // 使用正斜杠拼接（跨平台兼容）/ Join with forward slash (cross-platform compatible)
  return `${normalizedBase}/${normalizedRelative}`;
};

// 辅助函数：获取文件扩展名 / Helper function: Get file extension
const getFileExtension = (filePath: string): string => {
  const lastDotIndex = filePath.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex === filePath.length - 1) {
    return '';
  }
  return filePath.substring(lastDotIndex + 1).toLowerCase();
};

const Diff2Html = ({ diff, className, title }: { diff: string; className?: string; title?: string }) => {
  const { theme } = useThemeContext();
  const { openPreview, closePreviewByIdentity, findPreviewTab } = usePreviewContext(); // 获取预览上下文 / Get preview context
  const conversationContext = useConversationContextSafe(); // 获取会话上下文 / Get conversation context
  const [sideBySide, setSideBySide] = useState(false);
  const [collapse, setCollapse] = useState(false);

  // 检查当前 diff 是否正在预览中 / Check if current diff is being previewed
  const diffMeta = { title };
  const fileMeta = title ? { title, fileName: title } : undefined;
  const diffTab = findPreviewTab('diff', diff, diffMeta);
  const markdownTab = fileMeta ? findPreviewTab('markdown', undefined, fileMeta) : null;
  const codeTab = fileMeta ? findPreviewTab('code', undefined, fileMeta) : null;
  const previewTab = diffTab || markdownTab || codeTab;
  const currentPreviewType = diffTab ? 'diff' : markdownTab ? 'markdown' : codeTab ? 'code' : null;
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
                console.log('[Diff2Html] Preview button clicked', { title, isCurrentlyPreviewing });

                if (isCurrentlyPreviewing && currentPreviewType) {
                  // 关闭当前文件的预览 / Close preview for this file
                  closePreviewByIdentity(currentPreviewType, currentPreviewType === 'diff' ? diff : undefined, currentPreviewType === 'diff' ? diffMeta : fileMeta);
                } else {
                  // 检测文件类型 / Detect file type
                  const isMarkdownFile = title?.toLowerCase().endsWith('.md') || title?.toLowerCase().endsWith('.markdown');
                  console.log('[Diff2Html] File type detected', { isMarkdownFile, title });

                  // 如果有工作空间上下文，尝试从工作空间读取实际文件 / If workspace context exists, try to read actual file from workspace
                  if (conversationContext?.workspace) {
                    console.log('[Diff2Html] Workspace context found', { workspace: conversationContext.workspace });

                    try {
                      // 1. 从 diff 中解析文件路径 / Parse file path from diff
                      const relativePath = parseFilePathFromDiff(diff);
                      console.log('[Diff2Html] Parsed relative path', { relativePath });

                      if (relativePath) {
                        // 2. 构建完整文件路径 / Construct full file path
                        const fullPath = joinPath(conversationContext.workspace, relativePath);
                        console.log('[Diff2Html] Full path constructed', { fullPath });

                        // 3. 读取实际文件内容 / Read actual file content
                        console.log('[Diff2Html] About to invoke readFile...', {
                          path: fullPath,
                          ipcBridgeExists: !!ipcBridge,
                          fsExists: !!ipcBridge?.fs,
                          readFileExists: !!ipcBridge?.fs?.readFile,
                          invokeExists: !!ipcBridge?.fs?.readFile?.invoke,
                        });

                        let fileContent: string;
                        try {
                          fileContent = await ipcBridge.fs.readFile.invoke({ path: fullPath });
                          console.log('[Diff2Html] File read successfully', { contentLength: fileContent.length });
                        } catch (readError) {
                          console.error('[Diff2Html] File read error (inner catch):', readError);
                          throw readError; // Re-throw to be caught by outer catch
                        }

                        // 4. 打开预览，传入文件路径和工作空间信息 / Open preview with file path and workspace info
                        if (isMarkdownFile) {
                          // Markdown 文件：以可编辑模式打开 / Markdown file: Open in editable mode
                          console.log('[Diff2Html] Opening markdown preview');
                          openPreview(fileContent, 'markdown', {
                            title,
                            fileName: title,
                            filePath: fullPath,
                            workspace: conversationContext.workspace,
                            editable: true,
                          });
                        } else {
                          // 其他文件：以代码预览模式打开 / Other files: Open in code preview mode
                          const ext = getFileExtension(relativePath);
                          console.log('[Diff2Html] Opening code preview', { ext });
                          openPreview(fileContent, 'code', {
                            title,
                            fileName: title,
                            filePath: fullPath,
                            workspace: conversationContext.workspace,
                            language: ext || 'text',
                            editable: false,
                          });
                        }
                        return; // 成功读取并打开，提前返回 / Successfully read and opened, return early
                      } else {
                        console.log('[Diff2Html] No relative path found, using fallback');
                      }
                    } catch (error) {
                      console.error('[Diff2Html] Failed to read file from workspace:', error);
                      // 如果读取失败，继续执行下面的降级逻辑 / If read fails, continue with fallback logic below
                    }
                  } else {
                    console.log('[Diff2Html] No workspace context, using fallback');
                  }

                  // 降级方案：没有工作空间或读取失败时，使用原来的方式（从 diff 提取）
                  // Fallback: If no workspace or read fails, use original method (extract from diff)
                  console.log('[Diff2Html] Using fallback method');
                  if (isMarkdownFile) {
                    // Markdown 文件：提取内容并以可编辑模式打开 / Markdown file: Extract content and open in editable mode
                    console.log('[Diff2Html] Extracting markdown content from diff');
                    const lines = diff.split('\n');
                    const contentLines: string[] = [];
                    let inDiffBlock = false;

                    for (const line of lines) {
                      if (line.startsWith('Index:') || line.match(/^={3,}/) || line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
                        inDiffBlock = true;
                        continue;
                      }

                      if (inDiffBlock) {
                        if (line.startsWith('+')) {
                          contentLines.push(line.substring(1));
                        } else if (line.startsWith('-') || line.startsWith('\\')) {
                          continue;
                        } else {
                          contentLines.push(line);
                        }
                      }
                    }

                    const cleanContent = contentLines.join('\n').trim();
                    console.log('[Diff2Html] Opening fallback markdown preview', { contentLength: cleanContent.length });
                    openPreview(cleanContent, 'markdown', { title, fileName: title, editable: true });
                  } else {
                    // 其他文件：以 diff 模式打开 / Other files: Open in diff mode
                    console.log('[Diff2Html] Opening fallback diff preview');
                    openPreview(diff, 'diff', { title, editable: false });
                  }
                  console.log('[Diff2Html] Fallback preview opened');
                }
              }}
              title={isCurrentlyPreviewing ? '关闭预览面板 / Close preview panel' : '在预览面板中查看 / View in preview panel'}
            >
              <PreviewOpen theme='outline' size='14' fill={iconColors.secondary} />
              <span className='text-12px text-t-secondary whitespace-nowrap'>{isCurrentlyPreviewing ? '关闭预览' : '查看预览'}</span>
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
