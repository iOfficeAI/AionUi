/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { joinPath } from '@/common/chat/chatLib';
import { ipcBridge } from '@/common';
import { useTextSelection } from '@/renderer/hooks/ui/useTextSelection';
import 'katex/dist/katex.min.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Streamdown } from 'streamdown';
import MarkdownEditor from '../editors/MarkdownEditor';
import SelectionToolbar from '../renderers/SelectionToolbar';
import { useContainerScroll, useContainerScrollTarget } from '../../hooks/useScrollSyncHelpers';
import { useThemeDetection } from '../../hooks';
import { getMarkdownShikiThemes, getMermaidTheme } from '../../theme';
import { convertLatexDelimiters } from '@/renderer/utils/chat/latexDelimiters';

interface MarkdownPreviewProps {
  content: string; // Markdown 内容 / Markdown content
  viewMode?: 'source' | 'preview'; // 外部控制的视图模式 / External view mode
  onViewModeChange?: (mode: 'source' | 'preview') => void; // 视图模式改变回调 / View mode change callback
  onContentChange?: (content: string) => void; // 内容改变回调 / Content change callback
  containerRef?: React.RefObject<HTMLDivElement>; // 容器引用，用于滚动同步 / Container ref for scroll sync
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void; // 滚动回调 / Scroll callback
  file_path?: string; // 当前 Markdown 文件的绝对路径 / Absolute file path of current markdown
  workspace?: string;
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
  workspace?: string;
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

const MarkdownImage: React.FC<MarkdownImageProps> = ({ src, alt, baseDir, workspace, ...props }) => {
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
      const absolutePath = isAbsoluteLocalPath(cleanedSrc)
        ? cleanedSrc
        : normalizedBase
          ? joinPath(normalizedBase, cleanedSrc)
          : cleanedSrc;

      if (!absolutePath) {
        setResolvedSrc(src);
        return;
      }

      resolveImage(absolutePath, async () => {
        const dataUrl = await ipcBridge.fs.getImageBase64.invoke({ path: absolutePath, workspace });
        return dataUrl ?? src;
      })
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
  }, [src, baseDir, resolveImage, workspace]);

  if (!resolvedSrc) {
    return alt ? <span>{alt}</span> : null;
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy='no-referrer'
      crossOrigin='anonymous'
      style={{ maxWidth: '100%', width: 'auto', height: 'auto', display: 'block', objectFit: 'contain' }}
      {...props}
    />
  );
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
 * 使用 Streamdown 原生渲染 Markdown（Shiki 代码高亮、Mermaid、KaTeX），支持原文/预览切换
 * Uses Streamdown native rendering (Shiki code highlight, Mermaid, KaTeX), supports source/preview toggle
 */
const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  viewMode: externalViewMode,
  onContentChange,
  containerRef: externalContainerRef,
  onScroll: externalOnScroll,
  file_path,
  workspace,
}) => {
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef; // 使用外部 ref 或内部 ref / Use external ref or internal ref
  const currentTheme = useThemeDetection();

  // 使用滚动同步 Hooks / Use scroll sync hooks
  useContainerScroll(containerRef, externalOnScroll);
  useContainerScrollTarget(containerRef);

  const [internalViewMode] = useState<'source' | 'preview'>('preview'); // 内部视图模式 / Internal view mode

  // 使用外部传入的 viewMode，否则使用内部状态 / Use external viewMode if provided, otherwise use internal state
  const viewMode = externalViewMode !== undefined ? externalViewMode : internalViewMode;

  // 预览源：转换 LaTeX 分隔符并重写外部媒体 URL / Preview source: convert LaTeX delimiters and rewrite external media URLs
  const previewSource = useMemo(() => convertLatexDelimiters(rewriteExternalMediaUrls(content)), [content]);

  // 监听文本选择 / Monitor text selection
  const { selectedText, selectionPosition, clearSelection } = useTextSelection(containerRef);

  const baseDir = useMemo(() => {
    if (!file_path) return undefined;
    const normalized = file_path.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash === -1) return undefined;
    return normalized.slice(0, lastSlash);
  }, [file_path]);

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
      const absolutePath = isAbsoluteLocalPath(cleanedSrc)
        ? cleanedSrc
        : normalizedBase
          ? joinPath(normalizedBase, cleanedSrc)
          : undefined;
      if (!absolutePath) {
        seen.add(img);
        return;
      }

      void ipcBridge.fs.getImageBase64
        .invoke({ path: absolutePath, workspace })
        .then((dataUrl) => {
          if (dataUrl) {
            img.src = dataUrl;
          }
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
  }, [baseDir, containerRef, viewMode, previewSource, workspace]);

  return (
    <div className='flex flex-col w-full h-full overflow-hidden'>
      {/* 内容区域 / Content area */}
      <div
        ref={containerRef}
        className={`flex-1 ${viewMode === 'source' ? 'overflow-hidden' : 'overflow-auto p-32px text-t-primary'}`}
        style={{ minWidth: 0 }}
      >
        {viewMode === 'source' ? (
          // 原文模式：使用编辑器 / Source mode: Use editor
          <MarkdownEditor value={content} onChange={(value) => onContentChange?.(value)} />
        ) : (
          // 预览模式：Streamdown 原生渲染 / Preview mode: native Streamdown
          <div
            className='aionui-markdown'
            style={{
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              width: '100%',
              maxWidth: '100%',
              minWidth: 0,
              boxSizing: 'border-box',
            }}
          >
            <Streamdown
              mode='static'
              shikiTheme={getMarkdownShikiThemes()}
              mermaid={{ config: { theme: getMermaidTheme(currentTheme) } }}
              remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
              rehypePlugins={[rehypeRaw, rehypeKatex]}
              components={{
                img({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
                  return <MarkdownImage src={src} alt={alt} baseDir={baseDir} workspace={workspace} {...props} />;
                },
              }}
            >
              {previewSource}
            </Streamdown>
          </div>
        )}
      </div>

      {/* 文本选择浮动工具栏 / Text selection floating toolbar */}
      {selectedText && (
        <SelectionToolbar selectedText={selectedText} position={selectionPosition} onClear={clearSelection} />
      )}
    </div>
  );
};

export default MarkdownPreview;
