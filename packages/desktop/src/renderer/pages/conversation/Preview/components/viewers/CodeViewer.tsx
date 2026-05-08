/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAutoScroll } from '@/renderer/hooks/chat/useAutoScroll';
import { useTextSelection } from '@/renderer/hooks/ui/useTextSelection';
import { useTypingAnimation } from '@/renderer/hooks/chat/useTypingAnimation';
import { iconColors } from '@/renderer/styles/colors';
import { LARGE_TEXT_VIEWER_RENDER_LIMIT, LARGE_TEXT_VIEWER_THRESHOLD } from '../../constants';
import { Close } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import SelectionToolbar from '../renderers/SelectionToolbar';

interface CodePreviewProps {
  content: string; // 代码内容 / Code content
  language?: string; // 编程语言 / Programming language
  onClose?: () => void; // 关闭回调 / Close callback
  hideToolbar?: boolean; // 隐藏工具栏 / Hide toolbar
  viewMode?: 'source' | 'preview'; // 外部控制的视图模式 / External view mode
  onViewModeChange?: (mode: 'source' | 'preview') => void; // 视图模式改变回调 / View mode change callback
}

/**
 * 代码预览组件
 * Code preview component
 *
 * 使用 SyntaxHighlighter 渲染代码块，支持原文/预览切换和下载功能
 * Uses SyntaxHighlighter to render code block, supports source/preview toggle and download
 */
const CodePreview: React.FC<CodePreviewProps> = ({
  content,
  language = 'text',
  onClose,
  hideToolbar = false,
  viewMode: externalViewMode,
  onViewModeChange,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });
  const [internalViewMode, setInternalViewMode] = useState<'source' | 'preview'>('preview'); // 内部视图模式 / Internal view mode

  // 使用外部传入的 viewMode，否则使用内部状态 / Use external viewMode if provided, otherwise use internal state
  const viewMode = externalViewMode !== undefined ? externalViewMode : internalViewMode;

  // 对大文本禁用高亮与动画，避免 SyntaxHighlighter 导致卡顿
  // Disable highlight/animation for large texts to avoid UI freezes in SyntaxHighlighter
  const isLargeContent = content.length > LARGE_TEXT_VIEWER_THRESHOLD;

  // 对超大文本只渲染前一部分，避免切换/关闭 Tab 时销毁超大 DOM 节点造成卡顿
  // Render only the first chunk for very large text to reduce tab switch/close jank
  const renderedContent = isLargeContent ? content.slice(0, LARGE_TEXT_VIEWER_RENDER_LIMIT) : content;
  const isRenderedTruncated = renderedContent.length < content.length;

  // 🎯 使用流式打字动画 Hook / Use typing animation Hook
  const { displayedContent } = useTypingAnimation({
    content: renderedContent,
    enabled: viewMode === 'preview' && !isLargeContent, // 大文本直接展示截断内容 / Show truncated content directly for large text
    speed: 50, // 50 字符/秒 / 50 characters per second
  });

  // 🎯 使用智能自动滚动 Hook / Use auto-scroll Hook
  useAutoScroll({
    containerRef,
    content: renderedContent,
    enabled: viewMode === 'preview' && !isLargeContent, // 大文本禁用自动滚动避免额外渲染 / Disable for large text
    threshold: 200, // 距离底部 200px 以内时跟随 / Follow when within 200px from bottom
  });

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
  const { selectedText, selectionPosition, clearSelection } = useTextSelection(containerRef, !isLargeContent);

  // 下载代码文件 / Download code file
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // 根据语言设置文件扩展名 / Set file extension based on language
    const ext =
      language === 'javascript' || language === 'js'
        ? 'js'
        : language === 'typescript' || language === 'ts'
          ? 'ts'
          : language === 'python' || language === 'py'
            ? 'py'
            : language === 'java'
              ? 'java'
              : language === 'cpp' || language === 'c++'
                ? 'cpp'
                : language === 'c'
                  ? 'c'
                  : language === 'html'
                    ? 'html'
                    : language === 'css'
                      ? 'css'
                      : language === 'json'
                        ? 'json'
                        : language === 'markdown' || language === 'md'
                          ? 'md'
                          : 'txt';
    link.download = `code-${Date.now()}.${ext}`;
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
      {/* 工具栏：原文/预览切换 + 下载按钮 / Toolbar: Source/Preview toggle + Download button */}
      {!hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0'>
          <div className='flex items-center gap-4px'>
            {/* 原文按钮 / Source button */}
            <div
              className={`px-12px py-4px rd-4px cursor-pointer transition-colors text-12px ${viewMode === 'source' ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`}
              onClick={() => handleViewModeChange('source')}
            >
              {t('preview.source')}
            </div>
            {/* 预览按钮 / Preview button */}
            <div
              className={`px-12px py-4px rd-4px cursor-pointer transition-colors text-12px ${viewMode === 'preview' ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`}
              onClick={() => handleViewModeChange('preview')}
            >
              {t('preview.preview')}
            </div>
          </div>

          {/* 右侧按钮组：下载 + 关闭 / Right button group: Download + Close */}
          <div className='flex items-center gap-8px'>
            {/* 下载按钮 / Download button */}
            <div
              className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors'
              onClick={handleDownload}
              title={t('preview.downloadCode', { language: language.toUpperCase() })}
            >
              <svg
                width='14'
                height='14'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                className='text-t-secondary'
              >
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
        {isRenderedTruncated && (
          <div className='mb-12px px-10px py-8px rd-6px bg-bg-2 text-12px text-t-secondary'>
            {t('preview.largeTextTruncatedHint', { count: renderedContent.length })}
          </div>
        )}
        {viewMode === 'source' || isLargeContent ? (
          // 原文模式或大文本：显示纯文本，避免高亮器阻塞
          // Source mode or large text: render plain text to avoid highlighter blocking
          <pre className='w-full m-0 p-12px bg-bg-2 rd-8px overflow-auto font-mono text-12px text-t-primary whitespace-pre-wrap break-words'>
            {displayedContent}
          </pre>
        ) : (
          // 预览模式：语法高亮 / Preview mode: Syntax highlighting
          <SyntaxHighlighter
            style={currentTheme === 'dark' ? vs2015 : vs}
            language={language}
            PreTag='div'
            wrapLongLines={language === 'text' || language === 'txt'}
            customStyle={
              language === 'text' || language === 'txt'
                ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
                : undefined
            }
          >
            {displayedContent}
          </SyntaxHighlighter>
        )}
      </div>

      {/* 文本选择浮动工具栏 / Text selection floating toolbar */}
      {selectedText && (
        <SelectionToolbar selectedText={selectedText} position={selectionPosition} onClear={clearSelection} />
      )}
    </div>
  );
};

export default CodePreview;
