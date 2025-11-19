/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAutoScroll } from '@/renderer/hooks/useAutoScroll';
import { useTextSelection } from '@/renderer/hooks/useTextSelection';
import { useTypingAnimation } from '@/renderer/hooks/useTypingAnimation';
import { iconColors } from '@/renderer/theme/colors';
import { Close } from '@icon-park/react';
import 'katex/dist/katex.min.css';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Streamdown } from 'streamdown';
import MarkdownEditor from './MarkdownEditor';
import SelectionToolbar from './SelectionToolbar';

interface MarkdownPreviewProps {
  content: string; // Markdown 内容 / Markdown content
  onClose?: () => void; // 关闭回调 / Close callback
  hideToolbar?: boolean; // 隐藏工具栏 / Hide toolbar
  viewMode?: 'source' | 'preview'; // 外部控制的视图模式 / External view mode
  onViewModeChange?: (mode: 'source' | 'preview') => void; // 视图模式改变回调 / View mode change callback
  onContentChange?: (content: string) => void; // 内容改变回调 / Content change callback
  containerRef?: React.RefObject<HTMLDivElement>; // 容器引用，用于滚动同步 / Container ref for scroll sync
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void; // 滚动回调 / Scroll callback
}

/**
 * Markdown 预览组件
 * Markdown preview component
 *
 * 使用 ReactMarkdown 渲染 Markdown，支持原文/预览切换和下载功能
 * Uses ReactMarkdown to render Markdown, supports source/preview toggle and download
 */
const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, onClose, hideToolbar = false, viewMode: externalViewMode, onViewModeChange, onContentChange, containerRef: externalContainerRef, onScroll: externalOnScroll }) => {
  const { t } = useTranslation();
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef; // 使用外部 ref 或内部 ref / Use external ref or internal ref
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });

  // 监听容器滚动事件 / Listen to container scroll events
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !externalOnScroll) return;

    const handleScroll = () => {
      externalOnScroll(container.scrollTop, container.scrollHeight, container.clientHeight);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, externalOnScroll]);

  const [internalViewMode, setInternalViewMode] = useState<'source' | 'preview'>('preview'); // 内部视图模式 / Internal view mode

  // 使用外部传入的 viewMode，否则使用内部状态 / Use external viewMode if provided, otherwise use internal state
  const viewMode = externalViewMode !== undefined ? externalViewMode : internalViewMode;

  // 🎯 使用流式打字动画 Hook / Use typing animation Hook
  const { displayedContent, isAnimating } = useTypingAnimation({
    content,
    enabled: viewMode === 'preview', // 仅在预览模式下启用 / Only enable in preview mode
    speed: 50, // 50 字符/秒 / 50 characters per second
  });

  // 🎯 使用智能自动滚动 Hook / Use auto-scroll Hook
  useAutoScroll({
    containerRef,
    content,
    enabled: viewMode === 'preview', // 仅在预览模式下启用 / Only enable in preview mode
    threshold: 200, // 距离底部 200px 以内时跟随 / Follow when within 200px from bottom
  });

  // 监听主题变化 / Monitor theme changes
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          const theme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
          setCurrentTheme(theme);
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // 监听文本选择 / Monitor text selection
  const { selectedText, selectionPosition, clearSelection } = useTextSelection(containerRef);

  // 下载 Markdown 文件 / Download Markdown file
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `markdown-${Date.now()}.md`;
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

  return (
    <div className='flex flex-col w-full h-full overflow-hidden'>
      {/* 工具栏：Tabs 切换 + 下载按钮 / Toolbar: Tabs toggle + Download button */}
      {!hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0 border-b border-border-1'>
          {/* 左侧：原文/预览 Tabs / Left: Source/Preview Tabs */}
          <div className='flex items-center h-full gap-2px'>
            {/* 预览 Tab */}
            <div
              className={`
                flex items-center h-full px-16px cursor-pointer transition-all text-14px font-medium
                ${viewMode === 'preview' ? 'text-primary border-b-2 border-primary' : 'text-t-secondary hover:text-t-primary hover:bg-bg-3'}
              `}
              onClick={() => handleViewModeChange('preview')}
            >
              {t('preview.preview')}
            </div>
            {/* 原文 Tab */}
            <div
              className={`
                flex items-center h-full px-16px cursor-pointer transition-all text-14px font-medium
                ${viewMode === 'source' ? 'text-primary border-b-2 border-primary' : 'text-t-secondary hover:text-t-primary hover:bg-bg-3'}
              `}
              onClick={() => handleViewModeChange('source')}
            >
              {t('preview.source')}
            </div>
          </div>

          {/* 右侧按钮组：下载 + 关闭 / Right button group: Download + Close */}
          <div className='flex items-center gap-8px'>
            {/* 下载按钮 / Download button */}
            <div className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors' onClick={handleDownload} title={t('preview.downloadMarkdown')}>
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' className='text-t-secondary'>
                <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
                <polyline points='7 10 12 15 17 10' />
                <line x1='12' y1='15' x2='12' y2='3' />
              </svg>
              <span className='text-12px text-t-secondary'>{t('common.download')}</span>
            </div>

            {/* 关闭按钮 / Close button */}
            {onClose && (
              <div className='cursor-pointer p-4px hover:bg-bg-3 rd-4px transition-colors' onClick={onClose} title={t('preview.closePreview')}>
                <Close theme='outline' size='18' fill={iconColors.secondary} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 内容区域 / Content area */}
      <div ref={containerRef} className={`flex-1 ${viewMode === 'source' ? 'overflow-hidden' : 'overflow-auto p-16px'}`}>
        {viewMode === 'source' ? (
          // 原文模式：使用编辑器 / Source mode: Use editor
          <MarkdownEditor value={content} onChange={(value) => onContentChange?.(value)} />
        ) : (
          // 预览模式：渲染 Markdown / Preview mode: Render Markdown
          <Streamdown
            // 核心功能：解析不完整的 Markdown，优化流式渲染体验 / Core feature: parse incomplete Markdown for optimal streaming
            parseIncompleteMarkdown={true}
            // 启用动画效果（当正在打字时）/ Enable animation when typing
            isAnimating={isAnimating}
            remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
            rehypePlugins={[rehypeKatex]}
            components={{
              code({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
                const match = /language-(\w+)/.exec(className || '');
                const codeContent = String(children).replace(/\n$/, '');
                const language = match ? match[1] : '';
                const codeTheme = currentTheme === 'dark' ? vs2015 : vs;

                // 代码高亮 / Code highlighting
                return language ? (
                  <SyntaxHighlighter
                    // @ts-expect-error - style 属性类型定义问题
                    style={codeTheme}
                    language={language}
                    PreTag='div'
                    customStyle={{
                      margin: 0,
                      borderRadius: '8px',
                      padding: '16px',
                      fontSize: '14px',
                    }}
                    {...props}
                  >
                    {codeContent}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {displayedContent}
          </Streamdown>
        )}
      </div>

      {/* 文本选择浮动工具栏 / Text selection floating toolbar */}
      {selectedText && <SelectionToolbar selectedText={selectedText} position={selectionPosition} onClear={clearSelection} />}
    </div>
  );
};

export default MarkdownPreview;
