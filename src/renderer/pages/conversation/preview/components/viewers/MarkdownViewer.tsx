/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { joinPath } from '@/common/chatLib';
import { ipcBridge } from '@/common';
import { useAutoScroll } from '@/renderer/hooks/useAutoScroll';
import { useTextSelection } from '@/renderer/hooks/useTextSelection';
import { useTypingAnimation } from '@/renderer/hooks/useTypingAnimation';
import { iconColors } from '@/renderer/theme/colors';
import { Close } from '@icon-park/react';
import 'katex/dist/katex.min.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Streamdown } from 'streamdown';
import MarkdownEditor from '../editors/MarkdownEditor';
import SelectionToolbar from '../renderers/SelectionToolbar';
import { useContainerScroll, useContainerScrollTarget } from '../../hooks/useScrollSyncHelpers';

interface MarkdownPreviewProps {
  content: string; // Markdown 内容 / Markdown content
  onClose?: () => void; // 关闭回调 / Close callback
  hideToolbar?: boolean; // 隐藏工具栏 / Hide toolbar
  viewMode?: 'source' | 'preview'; // 外部控制的视图模式 / External view mode
  onViewModeChange?: (mode: 'source' | 'preview') => void; // 视图模式改变回调 / View mode change callback
  onContentChange?: (content: string) => void; // 内容改变回调 / Content change callback
  containerRef?: React.RefObject<HTMLDivElement>; // 容器引用，用于滚动同步 / Container ref for scroll sync
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void; // 滚动回调 / Scroll callback
  filePath?: string; // 当前 Markdown 文件的绝对路径 / Absolute file path of current markdown
}

const isDataOrRemoteUrl = (value?: string): boolean => {
  if (!value) return false;
  return /^(https?:|data:|blob:|file:)/i.test(value);
};

const isAbsoluteLocalPath = (value?: string): boolean => {
  if (!value) return false;
  return /^([a-zA-Z]:\\|\\\\|\/)/.test(value);
};

interface MarkdownImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  baseDir?: string;
}

const useImageResolverCache = () => {
  const cacheRef = useRef(new Map<string, string>());
  const inflightRef = useRef(new Map<string, Promise<string>>());

  const resolve = useCallback((key: string, loader: () => Promise<string>): Promise<string> => {
    const cache = cacheRef.current;
    if (cache.has(key)) {
      return Promise.resolve(cache.get(key)!);
    }

    const inflight = inflightRef.current;
    if (inflight.has(key)) {
      return inflight.get(key)!;
    }

    const promise = loader()
      .then((result) => {
        cache.set(key, result);
        return result;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, promise);
    return promise;
  }, []);

  return resolve;
};

const MarkdownImage: React.FC<MarkdownImageProps> = ({ src, alt, baseDir, ...props }) => {
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(undefined);
  const resolveImage = useImageResolverCache();

  useEffect(() => {
    let cancelled = false;

    const loadImage = () => {
      if (!src) {
        setResolvedSrc(undefined);
        return;
      }

      if (isDataOrRemoteUrl(src)) {
        if (/^https?:/i.test(src)) {
          resolveImage(src, () => ipcBridge.fs.fetchRemoteImage.invoke({ url: src }))
            .then((dataUrl) => {
              if (!cancelled) {
                setResolvedSrc(dataUrl);
              }
            })
            .catch((error) => {
              console.error('[MarkdownPreview] Failed to fetch remote image:', src, error);
              if (!cancelled) {
                setResolvedSrc(src);
              }
            });
          return;
        }
        setResolvedSrc(src);
        return;
      }

      const normalizedBase = baseDir ? baseDir.replace(/\\/g, '/') : undefined;
      const cleanedSrc = src.replace(/\\/g, '/');
      const absolutePath = isAbsoluteLocalPath(cleanedSrc) ? cleanedSrc : normalizedBase ? joinPath(normalizedBase, cleanedSrc) : cleanedSrc;

      if (!absolutePath) {
        setResolvedSrc(src);
        return;
      }

      resolveImage(absolutePath, () => ipcBridge.fs.getImageBase64.invoke({ path: absolutePath }))
        .then((dataUrl) => {
          if (!cancelled) {
            setResolvedSrc(dataUrl);
          }
        })
        .catch((error) => {
          console.error('[MarkdownPreview] Failed to load local image:', { src, absolutePath, error });
          if (!cancelled) {
            setResolvedSrc(src);
          }
        });
    };

    loadImage();

    return () => {
      cancelled = true;
    };
  }, [src, baseDir]);

  if (!resolvedSrc) {
    return alt ? <span>{alt}</span> : null;
  }

  return <img src={resolvedSrc} alt={alt} referrerPolicy='no-referrer' crossOrigin='anonymous' style={{ maxWidth: '100%', width: 'auto', height: 'auto', display: 'block', objectFit: 'contain' }} {...props} />;
};

const encodeHtmlAttribute = (value: string) => value.replace(/&(?!#?[a-z0-9]+;)/gi, '&amp;');

const rewriteExternalMediaUrls = (markdown: string): string => {
  const githubWikiRegex = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/wiki\/([^\s)"'>]+)/gi;
  const rewriteWiki = markdown.replace(githubWikiRegex, (_match, owner, repo, rest) => {
    return `https://raw.githubusercontent.com/wiki/${owner}/${repo}/${rest}`;
  });
  return rewriteWiki.replace(/<(img|a)\b[^>]*>/gi, (tag) => {
    return tag.replace(/(src|href)\s*=\s*(["'])([^"']*)(\2)/gi, (match, attr, quote, value, closingQuote) => {
      return `${attr}=${quote}${encodeHtmlAttribute(value)}${closingQuote}`;
    });
  });
};

/**
 * Markdown 预览组件
 * Markdown preview component
 *
 * 使用 ReactMarkdown 渲染 Markdown，支持原文/预览切换和下载功能
 * Uses ReactMarkdown to render Markdown, supports source/preview toggle and download
 */
// 该函数参数较多，保持单行可以让 Prettier 控制格式，同时使用 eslint-disable 规避长度限制
// This line has many props; keep it single-line for Prettier and silence max-len warning explicitly
// eslint-disable-next-line max-len
const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, onClose, hideToolbar = false, viewMode: externalViewMode, onViewModeChange, onContentChange, containerRef: externalContainerRef, onScroll: externalOnScroll, filePath }) => {
  const { t } = useTranslation();
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef; // 使用外部 ref 或内部 ref / Use external ref or internal ref
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });

  // 使用滚动同步 Hooks / Use scroll sync hooks
  useContainerScroll(containerRef, externalOnScroll);
  useContainerScrollTarget(containerRef);

  const [internalViewMode, setInternalViewMode] = useState<'source' | 'preview'>('preview'); // 内部视图模式 / Internal view mode

  // 使用外部传入的 viewMode，否则使用内部状态 / Use external viewMode if provided, otherwise use internal state
  const viewMode = externalViewMode !== undefined ? externalViewMode : internalViewMode;

  // 🎯 使用流式打字动画 Hook / Use typing animation Hook
  const previewSource = useMemo(() => rewriteExternalMediaUrls(content), [content]);

  const { displayedContent, isAnimating } = useTypingAnimation({
    content: previewSource,
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

  const baseDir = useMemo(() => {
    if (!filePath) return undefined;
    const normalized = filePath.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash === -1) return undefined;
    return normalized.slice(0, lastSlash);
  }, [filePath]);

  useEffect(() => {
    if (viewMode !== 'preview') return;
    const container = containerRef.current;
    if (!container) return;

    const seen = new WeakSet<HTMLImageElement>();

    const resolveLocalImage = (img: HTMLImageElement) => {
      if (!img || seen.has(img)) return;
      const rawAttr = img.getAttribute('src') || '';
      if (!rawAttr || isDataOrRemoteUrl(rawAttr)) {
        seen.add(img);
        return;
      }

      const normalizedBase = baseDir ? baseDir.replace(/\\/g, '/') : undefined;
      const cleanedSrc = rawAttr.replace(/\\/g, '/');
      const absolutePath = isAbsoluteLocalPath(cleanedSrc) ? cleanedSrc : normalizedBase ? joinPath(normalizedBase, cleanedSrc) : undefined;
      if (!absolutePath) {
        seen.add(img);
        return;
      }

      void ipcBridge.fs.getImageBase64
        .invoke({ path: absolutePath })
        .then((dataUrl) => {
          img.src = dataUrl;
        })
        .catch((error) => {
          console.error('[MarkdownPreview] Failed to inline rendered image:', { rawAttr, absolutePath, error });
        })
        .finally(() => {
          seen.add(img);
        });
    };

    const scanImages = () => {
      const images = container.querySelectorAll('img');
      images.forEach((img) => {
        resolveLocalImage(img as HTMLImageElement);
      });
    };

    scanImages();

    const observer = new MutationObserver(() => {
      scanImages();
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, [baseDir, containerRef, viewMode, displayedContent]);

  return (
    <div className='flex flex-col w-full h-full overflow-hidden'>
      {/* 工具栏：Tabs 切换 + 下载按钮 / Toolbar: Tabs toggle + Download button */}
      {!hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0 border-b border-border-1 overflow-x-auto'>
          <div className='flex items-center justify-between gap-12px w-full' style={{ minWidth: 'max-content' }}>
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
            <div className='flex items-center gap-8px flex-shrink-0'>
              {/* 下载按钮 / Download button */}
              <div className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors' onClick={handleDownload} title={t('preview.downloadMarkdown')}>
                <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' className='text-t-secondary'>
                  <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
                  <polyline points='7 10 12 15 17 10' />
                  <line x1='12' y1='15' x2='12' y2='3' />
                </svg>
                <span className='text-12px text-t-secondary'>{t('common.download')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 内容区域 / Content area */}
      <div ref={containerRef} className={`flex-1 ${viewMode === 'source' ? 'overflow-hidden' : 'overflow-auto p-32px'}`} style={{ minWidth: 0 }}>
        {viewMode === 'source' ? (
          // 原文模式：使用编辑器 / Source mode: Use editor
          <MarkdownEditor value={content} onChange={(value) => onContentChange?.(value)} />
        ) : (
          // 预览模式：渲染 Markdown / Preview mode: Render Markdown
          <div style={{ wordWrap: 'break-word', overflowWrap: 'break-word', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
            <Streamdown
              // 核心功能：解析不完整的 Markdown，优化流式渲染体验 / Core feature: parse incomplete Markdown for optimal streaming
              parseIncompleteMarkdown={true}
              // 启用动画效果（当正在打字时）/ Enable animation when typing
              isAnimating={isAnimating}
              remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
              rehypePlugins={[rehypeRaw, rehypeKatex]}
              components={{
                img({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
                  return <MarkdownImage src={src} alt={alt} baseDir={baseDir} {...props} />;
                },
                table({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) {
                  return (
                    <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
                      <table {...props}>{children}</table>
                    </div>
                  );
                },
                pre({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
                  return (
                    <pre style={{ maxWidth: '100%', overflowX: 'auto' }} {...props}>
                      {children}
                    </pre>
                  );
                },
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
                        maxWidth: '100%',
                        overflow: 'auto',
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
          </div>
        )}
      </div>

      {/* 文本选择浮动工具栏 / Text selection floating toolbar */}
      {selectedText && <SelectionToolbar selectedText={selectedText} position={selectionPosition} onClear={clearSelection} />}
    </div>
  );
};

export default MarkdownPreview;
