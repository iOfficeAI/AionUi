/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateInspectScript } from './htmlInspectScript';

interface HTMLRendererProps {
  content: string;
  filePath?: string;
  containerRef?: React.RefObject<HTMLDivElement>;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
  inspectMode?: boolean; // 是否开启检查模式 / Whether inspect mode is enabled
  copySuccessMessage?: string;
}

// Electron webview 元素的类型定义 / Type definition for Electron webview element
interface ElectronWebView extends HTMLElement {
  src: string;
  executeJavaScript: (code: string) => Promise<void>;
}

/**
 * HTML 渲染器组件
 * HTML renderer component
 *
 * 在 webview 中渲染 HTML 内容（Electron 专用标签）
 * Renders HTML content in a webview (Electron-specific tag)
 */
const previewLog = (message: string, payload?: Record<string, unknown>) => {
  try {
    // eslint-disable-next-line no-console
    console.debug(`[HTMLPreview] ${message}`, payload || '');
  } catch (_err) {
    // noop in production builds without console
  }
};

const toFileBaseUrl = (absolutePath?: string): string | null => {
  if (!absolutePath) return null;

  // 统一路径分隔符，兼容 Windows 和 *nix / Normalize path separators across OSes
  const normalized = absolutePath.replace(/\\/g, '/');
  const lastSlashIndex = normalized.lastIndexOf('/');
  if (lastSlashIndex < 0) return null;

  const dirWithSlash = normalized.substring(0, lastSlashIndex + 1);
  if (!dirWithSlash) return null;

  const prefix = dirWithSlash.startsWith('/') ? 'file://' : 'file:///';
  const rawUrl = `${prefix}${dirWithSlash}`;
  const encodedUrl = encodeURI(rawUrl);
  previewLog('Resolved base URL', { absolutePath, normalized, baseUrl: encodedUrl });
  return encodedUrl;
};

const rewriteRelativeResourceUrls = (html: string, baseUrl?: string): string => {
  if (!baseUrl || typeof DOMParser === 'undefined') return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const targets: Array<{ selector: string; attr: string }> = [
      { selector: 'link[href]', attr: 'href' },
      { selector: 'script[src]', attr: 'src' },
      { selector: 'img[src]', attr: 'src' },
      { selector: 'video[src]', attr: 'src' },
      { selector: 'audio[src]', attr: 'src' },
      { selector: 'source[src]', attr: 'src' },
      { selector: 'iframe[src]', attr: 'src' },
    ];

    const isAbsolute = (value: string) => /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/|#)/.test(value);

    targets.forEach(({ selector, attr }) => {
      doc.querySelectorAll(selector).forEach((el) => {
        const attrValue = el.getAttribute(attr);
        if (!attrValue) return;
        if (isAbsolute(attrValue) || attrValue.startsWith('data:') || attrValue.startsWith('javascript:')) return;
        try {
          const resolved = new URL(attrValue, baseUrl).href;
          el.setAttribute(attr, resolved);
        } catch (error) {
          previewLog('Failed to resolve relative resource URL', { attr, attrValue, error: (error as Error)?.message });
        }
      });
    });

    const docType = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : '';
    const outerHTML = doc.documentElement ? doc.documentElement.outerHTML : html;
    previewLog('Rewrote relative resource URLs for HTML preview');
    return `${docType}${outerHTML}`;
  } catch (error) {
    previewLog('Failed to rewrite relative resource URLs', { error: (error as Error)?.message });
    return html;
  }
};

const HTMLRenderer: React.FC<HTMLRendererProps> = ({ content, filePath, containerRef, inspectMode = false, copySuccessMessage }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<ElectronWebView | null>(null);
  const webviewLoadedRef = useRef(false); // 跟踪 webview 是否已加载 / Track if webview is loaded
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
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

  const baseUrl = useMemo(() => {
    return toFileBaseUrl(filePath);
  }, [filePath]);

  // 处理 HTML 内容，注入 base 标签支持相对路径
  // Process HTML content, inject base tag for relative paths
  const processedHtml = useMemo(() => {
    let html = content;

    previewLog('Processing HTML content', { filePath, baseUrl, hasHead: /<head>/i.test(html), hasHtmlTag: /<html>/i.test(html) });

    if (baseUrl) {
      // 检查是否已有 base 标签 / Check if base tag exists
      if (!html.match(/<base\s+href=/i)) {
        if (html.match(/<head>/i)) {
          html = html.replace(/<head>/i, `<head><base href="${baseUrl}">`);
        } else if (html.match(/<html>/i)) {
          html = html.replace(/<html>/i, `<html><head><base href="${baseUrl}"></head>`);
        } else {
          html = `<head><base href="${baseUrl}"></head>${html}`;
        }
        previewLog('Injected <base> tag for preview', { baseUrl });
      } else {
        previewLog('HTML already contains <base> tag - skip injection', { baseUrl });
      }

      html = rewriteRelativeResourceUrls(html, baseUrl);
    }

    return html;
  }, [content, filePath, baseUrl]);

  // 使用 data URL 来加载内容（避免 CSP 问题）
  // Use data URL to load content (avoids CSP issues)
  const dataUrl = useMemo(() => {
    const encoded = encodeURIComponent(processedHtml);
    return `data:text/html;charset=utf-8,${encoded}`;
  }, [processedHtml]);

  // 当 dataUrl 改变时重置加载状态 / Reset loading state when dataUrl changes
  useEffect(() => {
    webviewLoadedRef.current = false;
  }, [dataUrl]);

  // 监听 webview 加载完成
  // 依赖 dataUrl 确保 webview 重新挂载时重新添加监听器
  // Depend on dataUrl to ensure listeners are re-added when webview remounts
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDidFinishLoad = () => {
      webviewLoadedRef.current = true; // 标记为已加载 / Mark as loaded
      previewLog('Webview finished loading', { filePath, src: webview.src });
    };

    const handleDidFailLoad = (event: Event) => {
      previewLog('Webview failed to load', { filePath, error: (event as any)?.errorDescription });
    };

    webview.addEventListener('did-finish-load', handleDidFinishLoad);
    webview.addEventListener('did-fail-load', handleDidFailLoad);

    return () => {
      webview.removeEventListener('did-finish-load', handleDidFinishLoad);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
    };
  }, [dataUrl]);

  // 生成检查模式注入脚本 / Generate inspect mode injection script
  // 使用 useMemo 缓存，只在 inspectMode 改变时重新生成 / Use useMemo to cache, only regenerate when inspectMode changes
  const copySuccessText = useMemo(() => copySuccessMessage ?? '✓ Copied HTML snippet', [copySuccessMessage]);
  const inspectScript = useMemo(() => generateInspectScript(inspectMode, { copySuccess: copySuccessText }), [inspectMode, copySuccessText]);

  // 执行脚本注入的函数 / Function to execute script injection
  // 使用 useCallback 缓存，避免每次渲染都创建新函数 / Use useCallback to cache, avoid creating new function on each render
  const executeScript = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // executeJavaScript 返回 Promise，需要处理 / executeJavaScript returns Promise, need to handle it
    void webview
      .executeJavaScript(inspectScript)
      .then(() => {
        // Script injected successfully
      })
      .catch((_error) => {
        // Failed to inject inspect script
      });
  }, [inspectScript, inspectMode]);

  // 注入检查模式脚本 / Inject inspect mode script
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // 如果 webview 已经加载完成，立即执行脚本 / If webview is already loaded, execute script immediately
    if (webviewLoadedRef.current) {
      executeScript();
    }

    // 同时监听未来的页面加载事件 / Also listen for future page loads
    const handleLoad = () => {
      previewLog('Re-inject inspect script after load', { filePath });
      executeScript();
    };

    webview.addEventListener('did-finish-load', handleLoad);

    return () => {
      webview.removeEventListener('did-finish-load', handleLoad);
    };
  }, [executeScript]);

  return (
    <div ref={containerRef || divRef} className={`h-full w-full overflow-auto ${currentTheme === 'dark' ? 'bg-bg-1' : 'bg-white'}`}>
      {/* key 确保内容改变时 webview 重新挂载 / key ensures webview remounts when content changes */}
      {/* allowfileaccessfromfiles: enable loading sibling CSS/JS assets referenced via file:// */}
      {
        // @ts-expect-error - allowfileaccessfromfiles is an Electron webview attribute not in React types
        <webview key={dataUrl} ref={webviewRef} src={dataUrl} className='w-full h-full border-0' style={{ display: 'inline-flex' }} webpreferences='allowRunningInsecureContent, javascript=yes' allowfileaccessfromfiles='true' />
      }
    </div>
  );
};

export default HTMLRenderer;
