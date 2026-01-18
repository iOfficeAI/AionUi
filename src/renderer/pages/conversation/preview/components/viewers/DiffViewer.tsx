/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PreviewMetadata } from '../../context/PreviewContext';
import { useTextSelection } from '@/renderer/hooks/useTextSelection';
import { iconColors } from '@/renderer/theme/colors';
import { Close } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import remarkGfm from 'remark-gfm';
import SelectionToolbar from '../renderers/SelectionToolbar';
import { useTranslation } from 'react-i18next';
import { extractContentFromDiff } from '@/renderer/utils/diffUtils';

interface DiffPreviewProps {
  content: string; // Diff 内容 / Diff content
  metadata?: PreviewMetadata; // 元数据 / Metadata
  onClose?: () => void; // 关闭回调 / Close callback
  hideToolbar?: boolean; // 隐藏工具栏 / Hide toolbar
  viewMode?: 'source' | 'preview'; // 外部控制的视图模式 / External view mode
  onViewModeChange?: (mode: 'source' | 'preview') => void; // 视图模式改变回调 / View mode change callback
}

/**
 * Diff 预览组件
 * Diff preview component
 *
 * 使用 ReactMarkdown 渲染 Diff，支持原文/预览切换和下载功能
 * Uses ReactMarkdown to render Diff, supports source/preview toggle and download
 */
const DiffPreview: React.FC<DiffPreviewProps> = ({ content, metadata, onClose, hideToolbar = false, viewMode: externalViewMode, onViewModeChange }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });
  const [internalViewMode, setInternalViewMode] = useState<'source' | 'preview'>('preview'); // 内部视图模式 / Internal view mode

  // 使用外部传入的 viewMode，否则使用内部状态 / Use external viewMode if provided, otherwise use internal state
  const viewMode = externalViewMode !== undefined ? externalViewMode : internalViewMode;

  // 监听主题变化 / Monitor theme changes
  useEffect(() => {
    const updateTheme = () => {
      const theme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setCurrentTheme(theme);
    };

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  // 监听文本选择 / Monitor text selection
  const { selectedText, selectionPosition, clearSelection } = useTextSelection(containerRef);

  // 下载 Diff 文件 / Download Diff file
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diff-${Date.now()}.diff`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 切换视图模式 / Toggle view mode
  const handleViewModeChange = (mode: 'source' | 'preview') => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  // 提取纯净的文件内容 / Extract clean file content
  const cleanContent = extractContentFromDiff(content);

  // 判断提取的内容是否为 markdown / Check if extracted content is markdown
  const isMarkdownContent = metadata?.title?.toLowerCase().endsWith('.md') || metadata?.title?.toLowerCase().endsWith('.markdown');

  return (
    <div className='flex flex-col w-full h-full overflow-hidden'>
      {/* 工具栏：原文/预览切换 + 下载按钮 / Toolbar: Source/Preview toggle + Download button */}
      {!hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0'>
          <div className='flex items-center gap-4px'>
            {/* 原文按钮 / Source button */}
            <div className={`px-12px py-4px rd-4px cursor-pointer transition-colors text-12px ${viewMode === 'source' ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => handleViewModeChange('source')}>
              {t('preview.source')}
            </div>
            {/* 预览按钮 / Preview button */}
            <div className={`px-12px py-4px rd-4px cursor-pointer transition-colors text-12px ${viewMode === 'preview' ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => handleViewModeChange('preview')}>
              {t('preview.preview')}
            </div>
          </div>

          {/* 右侧按钮组：下载 + 关闭 / Right button group: Download + Close */}
          <div className='flex items-center gap-8px'>
            {/* 下载按钮 / Download button */}
            <div className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors' onClick={handleDownload} title={t('preview.downloadDiff')}>
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' className='text-t-secondary'>
                <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
                <polyline points='7 10 12 15 17 10' />
                <line x1='12' y1='15' x2='12' y2='3' />
              </svg>
              <span className='text-12px text-t-secondary'>{t('common.download')}</span>
            </div>
          </div>
        </div>
      )}

      {/* 内容区域 / Content area */}
      <div ref={containerRef} className='flex-1 overflow-auto p-16px'>
        {viewMode === 'source' ? (
          // 原文模式：显示提取后的纯净文件内容 / Source mode: Show extracted clean file content
          <pre className='w-full m-0 p-12px bg-bg-2 rd-8px overflow-auto font-mono text-12px text-t-primary whitespace-pre-wrap break-words'>{cleanContent}</pre>
        ) : // 预览模式：根据文件类型渲染内容 / Preview mode: Render content based on file type
        isMarkdownContent ? (
          // Markdown 文件：渲染 markdown / Markdown file: Render markdown
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                const codeContent = String(children).replace(/\n$/, '');

                // 判断是否为行内代码 / Check if it's inline code
                if (!String(children).includes('\n')) {
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }

                return (
                  <div className='my-4'>
                    <SyntaxHighlighter style={currentTheme === 'dark' ? vs2015 : vs} language={match ? match[1] : 'text'} PreTag='div'>
                      {codeContent}
                    </SyntaxHighlighter>
                  </div>
                );
              },
            }}
          >
            {cleanContent}
          </ReactMarkdown>
        ) : (
          // 其他文件：显示语法高亮的代码 / Other files: Show syntax-highlighted code
          <SyntaxHighlighter style={currentTheme === 'dark' ? vs2015 : vs} language='text' PreTag='div' showLineNumbers>
            {cleanContent}
          </SyntaxHighlighter>
        )}
      </div>

      {/* 文本选择浮动工具栏 / Text selection floating toolbar */}
      {selectedText && <SelectionToolbar selectedText={selectedText} position={selectionPosition} onClear={clearSelection} />}
    </div>
  );
};

export default DiffPreview;
