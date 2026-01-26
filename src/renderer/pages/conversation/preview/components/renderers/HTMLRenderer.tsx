/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { useTypingAnimation } from '@/renderer/hooks/useTypingAnimation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScrollSyncTarget } from '../../hooks/useScrollSyncHelpers';
import { generateInspectScript } from './htmlInspectScript';

/** 选中元素的数据结构 / Selected element data structure */
export interface InspectedElement {
  /** 完整 HTML / Full HTML */
  html: string;
  /** 简化标签名 / Simplified tag name */
  tag: string;
}

interface HTMLRendererProps {
  content: string;
  filePath?: string;
  containerRef?: React.RefObject<HTMLDivElement>;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
  inspectMode?: boolean; // 是否开启检查模式 / Whether inspect mode is enabled
  copySuccessMessage?: string;
  /** 元素选中回调 / Element selected callback */
  onElementSelected?: (element: InspectedElement) => void;
}

// Electron webview 元素的类型定义 / Type definition for Electron webview element
interface ElectronWebView extends HTMLElement {
  src: string;
  executeJavaScript: (code: string) => Promise<void>;
}

/**
 * 解析相对路径为绝对路径 / Resolve relative path to absolute path
 * @param basePath 基础文件路径 / Base file path
 * @param relativePath 相对路径 / Relative path
 * @returns 绝对路径 / Absolute path
 */
function resolveRelativePath(basePath: string, relativePath: string): string {
  // 去除协议前缀 / Remove protocol prefix
  const cleanBasePath = basePath.replace(/^file:\/\//, '');
  const baseDir = cleanBasePath.substring(0, cleanBasePath.lastIndexOf('/') + 1) || cleanBasePath.substring(0, cleanBasePath.lastIndexOf('\\') + 1);

  // 如果相对路径已经是绝对路径，直接返回 / If relative path is already absolute, return directly
  if (relativePath.startsWith('/') || /^[a-zA-Z]:/.test(relativePath)) {
    return relativePath;
  }

  // 处理 ./ 和 ../ / Handle ./ and ../
  const parts = baseDir.replace(/\\/g, '/').split('/').filter(Boolean);
  const relParts = relativePath.replace(/\\/g, '/').split('/');

  for (const part of relParts) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.') {
      parts.push(part);
    }
  }

  // 保留 Windows 盘符格式 / Preserve Windows drive letter format
  if (/^[a-zA-Z]:/.test(baseDir)) {
    return parts.join('/');
  }
  return '/' + parts.join('/');
}

/**
 * 内联化 HTML 中的相对资源（用于 browser iframe）
 * Inline relative resources in HTML (for browser iframe)
 *
 * - img src -> base64 data URL
 * - link href (CSS) -> inline <style> tag
 * - script src -> inline <script> tag
 *
 * @param html HTML 内容 / HTML content
 * @param basePath 基础文件路径 / Base file path
 * @returns 处理后的 HTML / Processed HTML
 */
async function inlineRelativeResources(html: string, basePath: string): Promise<string> {
  let result = html;

  // 1. 处理 <img src="relative"> -> base64 / Handle <img src="relative"> -> base64
  const imgRegex = /<img([^>]*)\ssrc=["'](?!https?:\/\/|data:|\/\/)([^"']+)["']([^>]*)>/gi;
  const imgMatches = [...result.matchAll(imgRegex)];

  for (const match of imgMatches) {
    const [fullMatch, before, src, after] = match;
    try {
      const absolutePath = resolveRelativePath(basePath, src);
      const dataUrl = await ipcBridge.fs.getImageBase64.invoke({ path: absolutePath });
      if (dataUrl) {
        // getImageBase64 已经返回完整的 data URL / getImageBase64 already returns complete data URL
        const newTag = `<img${before} src="${dataUrl}"${after}>`;
        result = result.replace(fullMatch, newTag);
      }
    } catch (e) {
      console.warn('[HTMLRenderer] Failed to inline image:', src, e);
    }
  }

  // 2. 处理 <link href="relative" rel="stylesheet"> -> <style> / Handle CSS links -> inline <style>
  const linkRegex = /<link([^>]*)\shref=["'](?!https?:\/\/|data:|\/\/)([^"']+)["']([^>]*)>/gi;
  const linkMatches = [...result.matchAll(linkRegex)];

  for (const match of linkMatches) {
    const [fullMatch, _before, href, _after] = match;
    // 检查是否为 stylesheet / Check if it's a stylesheet
    const isStylesheet = /rel=["']stylesheet["']/i.test(fullMatch) || href.endsWith('.css');
    if (isStylesheet) {
      try {
        const absolutePath = resolveRelativePath(basePath, href);
        const cssContent = await ipcBridge.fs.readFile.invoke({ path: absolutePath });
        if (cssContent) {
          // 替换 CSS 中的相对 url() 引用为 base64 / Replace relative url() references in CSS with base64
          let processedCss = cssContent;
          const cssUrlRegex = /url\(["']?(?!https?:\/\/|data:|\/\/)([^"')]+)["']?\)/gi;
          const cssUrlMatches = [...processedCss.matchAll(cssUrlRegex)];

          for (const urlMatch of cssUrlMatches) {
            const [urlFullMatch, urlPath] = urlMatch;
            try {
              // CSS 文件的基础路径 / Base path for CSS file
              const cssBasePath = absolutePath;
              const resourcePath = resolveRelativePath(cssBasePath, urlPath);
              const dataUrl = await ipcBridge.fs.getImageBase64.invoke({ path: resourcePath });
              if (dataUrl) {
                // getImageBase64 已经返回完整的 data URL / getImageBase64 already returns complete data URL
                processedCss = processedCss.replace(urlFullMatch, `url("${dataUrl}")`);
              }
            } catch (e) {
              console.warn('[HTMLRenderer] Failed to inline CSS resource:', urlPath, e);
            }
          }

          const styleTag = `<style>${processedCss}</style>`;
          result = result.replace(fullMatch, styleTag);
        }
      } catch (e) {
        console.warn('[HTMLRenderer] Failed to inline CSS:', href, e);
      }
    }
  }

  // 3. 处理 <script src="relative"> -> inline <script> / Handle script tags -> inline
  const scriptRegex = /<script([^>]*)\ssrc=["'](?!https?:\/\/|data:|\/\/)([^"']+)["']([^>]*)><\/script>/gi;
  const scriptMatches = [...result.matchAll(scriptRegex)];

  for (const match of scriptMatches) {
    const [fullMatch, before, src, after] = match;
    try {
      const absolutePath = resolveRelativePath(basePath, src);
      const scriptContent = await ipcBridge.fs.readFile.invoke({ path: absolutePath });
      if (scriptContent) {
        // 保留其他属性（如 type, defer, async 等，但 async/defer 对 inline 无效）
        // Keep other attributes (like type, but defer/async don't work for inline)
        const attrsToKeep = (before + after).replace(/\s*(defer|async)\s*/gi, '');
        const scriptTag = `<script${attrsToKeep}>${scriptContent}</script>`;
        result = result.replace(fullMatch, scriptTag);
      }
    } catch (e) {
      console.warn('[HTMLRenderer] Failed to inline script:', src, e);
    }
  }

  return result;
}

/**
 * HTML 渲染器组件
 * HTML renderer component
 *
 * 在 iframe/webview 中渲染 HTML 内容（自动检测环境）
 * Renders HTML content in iframe/webview (auto-detect environment)
 */
const HTMLRenderer: React.FC<HTMLRendererProps> = ({ content, filePath, containerRef, onScroll, inspectMode = false, copySuccessMessage, onElementSelected }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<ElectronWebView | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const webviewLoadedRef = useRef(false); // 跟踪 webview 是否已加载 / Track if webview is loaded
  const isSyncingScrollRef = useRef(false); // 防止滚动同步循环 / Prevent scroll sync loops
  const [webviewContentHeight, setWebviewContentHeight] = useState(0); // webview 内容高度 / webview content height
  const [inlinedHtmlContent, setInlinedHtmlContent] = useState<string>(''); // 内联化后的 HTML（用于 browser iframe）/ Inlined HTML (for browser iframe)
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });

  // 检测是否在 Electron 环境 / Detect if in Electron environment
  const isElectron = useMemo(() => typeof window !== 'undefined' && window.electronAPI !== undefined, []);

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

  // 判断是否应该直接从文件加载（支持相对资源）- 仅 Electron 环境
  // Determine if should load directly from file (supports relative resources) - Electron only
  const shouldLoadFromFile = useMemo(() => {
    if (!isElectron || !filePath) return false;
    // 检查 HTML 是否引用了相对资源 / Check if HTML references relative resources
    const hasRelativeResources = /<link[^>]+href=["'](?!https?:\/\/|data:|\/\/)[^"']+["']/i.test(content) || /<script[^>]+src=["'](?!https?:\/\/|data:|\/\/)[^"']+["']/i.test(content) || /<img[^>]+src=["'](?!https?:\/\/|data:|\/\/)[^"']+["']/i.test(content);
    return hasRelativeResources;
  }, [content, filePath, isElectron]);

  // 检查是否有相对资源（用于 browser inline 处理）
  // Check if has relative resources (for browser inline processing)
  const hasRelativeResources = useMemo(() => {
    return /<link[^>]+href=["'](?!https?:\/\/|data:|\/\/)[^"']+["']/i.test(content) || /<script[^>]+src=["'](?!https?:\/\/|data:|\/\/)[^"']+["']/i.test(content) || /<img[^>]+src=["'](?!https?:\/\/|data:|\/\/)[^"']+["']/i.test(content);
  }, [content]);

  // 流式打字动画：HTML 预览在使用 data URL 渲染时也能获得流式体验
  // Typing animation: provide streaming experience when rendering via data URL
  const { displayedContent } = useTypingAnimation({
    content,
    enabled: !shouldLoadFromFile && !hasRelativeResources,
    speed: 40,
  });

  const htmlContent = useMemo(() => (shouldLoadFromFile ? content : displayedContent), [shouldLoadFromFile, content, displayedContent]);

  // 在 browser 环境下，当有相对资源时进行内联化处理
  // In browser environment, inline relative resources when present
  useEffect(() => {
    if (isElectron) {
      // Electron 环境不需要内联化，使用 webview 加载
      // Electron environment doesn't need inlining, uses webview loading
      return;
    }

    if (!hasRelativeResources || !filePath) {
      // 没有相对资源或没有文件路径，使用原始内容
      // No relative resources or no file path, use original content
      setInlinedHtmlContent(content);
      return;
    }

    // Browser 环境且有相对资源，进行内联化处理
    // Browser environment with relative resources, perform inlining
    let cancelled = false;
    inlineRelativeResources(content, filePath)
      .then((inlined) => {
        if (!cancelled) {
          setInlinedHtmlContent(inlined);
        }
      })
      .catch((e) => {
        console.warn('[HTMLRenderer] Failed to inline resources:', e);
        if (!cancelled) {
          setInlinedHtmlContent(content); // 回退到原始内容 / Fallback to original content
        }
      });

    return () => {
      cancelled = true;
    };
  }, [content, filePath, isElectron, hasRelativeResources]);

  // 用于 browser iframe 的最终 HTML 内容
  // Final HTML content for browser iframe
  const browserHtmlContent = useMemo(() => {
    if (hasRelativeResources && filePath) {
      return inlinedHtmlContent || content; // 在内联化完成前显示原始内容 / Show original content before inlining completes
    }
    return displayedContent;
  }, [hasRelativeResources, filePath, inlinedHtmlContent, content, displayedContent]);

  // 计算 webview 的 src
  // Calculate webview src
  const webviewSrc = useMemo(() => {
    // 如果有相对资源引用且有文件路径，直接用 file:// URL 加载
    // If has relative resource references and has file path, load directly via file:// URL
    if (shouldLoadFromFile && filePath) {
      return `file://${filePath}`;
    }

    // 否则使用 data URL（适用于动态生成的 HTML 或没有外部资源的情况）
    // Otherwise use data URL (for dynamically generated HTML or no external resources)
    let html = htmlContent;

    // 注入 base 标签支持相对路径 / Inject base tag for relative paths
    if (filePath) {
      const fileDir = filePath.substring(0, filePath.lastIndexOf('/') + 1);
      const baseUrl = `file://${fileDir}`;

      // 检查是否已有 base 标签 / Check if base tag exists
      if (!html.match(/<base\s+href=/i)) {
        if (html.match(/<head>/i)) {
          html = html.replace(/<head>/i, `<head><base href="${baseUrl}">`);
        } else if (html.match(/<html>/i)) {
          html = html.replace(/<html>/i, `<html><head><base href="${baseUrl}"></head>`);
        } else {
          html = `<head><base href="${baseUrl}"></head>${html}`;
        }
      }
    }

    const encoded = encodeURIComponent(html);
    return `data:text/html;charset=utf-8,${encoded}`;
  }, [htmlContent, filePath, shouldLoadFromFile]);

  // 当 webviewSrc 改变时重置加载状态 / Reset loading state when webviewSrc changes
  useEffect(() => {
    webviewLoadedRef.current = false;
  }, [webviewSrc]);

  // 监听 webview 加载完成
  // 依赖 webviewSrc 确保 webview 重新挂载时重新添加监听器
  // Depend on webviewSrc to ensure listeners are re-added when webview remounts
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDidFinishLoad = () => {
      webviewLoadedRef.current = true; // 标记为已加载 / Mark as loaded
    };

    const handleDidFailLoad = (_event: Event) => {
      // Handle webview load failure
    };

    webview.addEventListener('did-finish-load', handleDidFinishLoad);
    webview.addEventListener('did-fail-load', handleDidFailLoad);

    return () => {
      webview.removeEventListener('did-finish-load', handleDidFinishLoad);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
    };
  }, [webviewSrc]);

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
      executeScript();
    };

    webview.addEventListener('did-finish-load', handleLoad);

    return () => {
      webview.removeEventListener('did-finish-load', handleLoad);
    };
  }, [executeScript]);

  // 监听 webview 控制台消息，捕获检查元素事件和滚动事件
  // Listen for webview console messages to capture inspect element events and scroll events
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleConsoleMessage = (event: Event) => {
      const consoleEvent = event as Event & { message?: string };
      const message = consoleEvent.message;

      if (typeof message === 'string') {
        // 处理检查元素消息 / Handle inspect element message
        if (message.startsWith('__INSPECT_ELEMENT__') && onElementSelected) {
          try {
            const jsonStr = message.slice('__INSPECT_ELEMENT__'.length);
            const data = JSON.parse(jsonStr) as InspectedElement;
            onElementSelected(data);
          } catch (e) {
            console.warn('[HTMLRenderer] Failed to parse inspect element message:', e);
          }
        }
        // 处理滚动消息 / Handle scroll message
        else if (message.startsWith('__SCROLL_SYNC__') && onScroll) {
          if (isSyncingScrollRef.current) return; // 防止循环 / Prevent loop
          try {
            const jsonStr = message.slice('__SCROLL_SYNC__'.length);
            const data = JSON.parse(jsonStr) as { scrollTop: number; scrollHeight: number; clientHeight: number };
            onScroll(data.scrollTop, data.scrollHeight, data.clientHeight);
          } catch (e) {
            console.warn('[HTMLRenderer] Failed to parse scroll message:', e);
          }
        }
        // 处理内容高度消息 / Handle content height message
        else if (message.startsWith('__CONTENT_HEIGHT__')) {
          try {
            const height = parseInt(message.slice('__CONTENT_HEIGHT__'.length), 10);
            if (!isNaN(height) && height > 0) {
              setWebviewContentHeight(height);
            }
          } catch (e) {
            console.warn('[HTMLRenderer] Failed to parse content height message:', e);
          }
        }
      }
    };

    webview.addEventListener('console-message', handleConsoleMessage);

    return () => {
      webview.removeEventListener('console-message', handleConsoleMessage);
    };
  }, [onElementSelected, onScroll]);

  // 注入滚动监听脚本 / Inject scroll listener script
  const scrollSyncScript = useMemo(
    () => `
    (function() {
      if (window.__scrollSyncInitialized) return;
      window.__scrollSyncInitialized = true;

      // 发送内容高度 / Send content height
      function sendContentHeight() {
        const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        console.log('__CONTENT_HEIGHT__' + scrollHeight);
      }

      // 初始发送 / Initial send
      sendContentHeight();

      // 监听内容变化 / Listen for content changes
      const resizeObserver = new ResizeObserver(sendContentHeight);
      resizeObserver.observe(document.body);

      let scrollTimeout;
      window.addEventListener('scroll', function() {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(function() {
          const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
          const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
          const clientHeight = window.innerHeight || document.documentElement.clientHeight;
          console.log('__SCROLL_SYNC__' + JSON.stringify({ scrollTop, scrollHeight, clientHeight }));
        }, 16); // ~60fps throttle
      }, { passive: true });
    })();
  `,
    []
  );

  // 注入滚动同步脚本 / Inject scroll sync script
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !onScroll) return;

    const injectScrollSync = () => {
      void webview.executeJavaScript(scrollSyncScript).catch(() => {});
    };

    if (webviewLoadedRef.current) {
      injectScrollSync();
    }

    webview.addEventListener('did-finish-load', injectScrollSync);

    return () => {
      webview.removeEventListener('did-finish-load', injectScrollSync);
    };
  }, [scrollSyncScript, onScroll]);

  // 监听外部滚动同步请求 / Listen for external scroll sync requests
  const handleTargetScroll = useCallback((targetPercent: number) => {
    const webview = webviewRef.current;
    if (!webview || !webviewLoadedRef.current) return;

    void webview
      .executeJavaScript(
        `
          (function() {
            const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
            const clientHeight = window.innerHeight || document.documentElement.clientHeight;
            const targetScroll = ${targetPercent} * (scrollHeight - clientHeight);
            window.scrollTo({ top: targetScroll, behavior: 'auto' });
          })();
        `
      )
      .catch(() => {});
  }, []);
  // 使用外部 containerRef 或内部 divRef / Use external containerRef or internal divRef
  const effectiveContainerRef = containerRef || divRef;
  useScrollSyncTarget(effectiveContainerRef, handleTargetScroll);

  // 监听容器滚动，同步到 webview / Listen to container scroll, sync to webview
  useEffect(() => {
    const container = containerRef?.current || divRef.current;
    if (!container) return;

    const handleContainerScroll = () => {
      if (isSyncingScrollRef.current) return;

      const webview = webviewRef.current;
      if (!webview || !webviewLoadedRef.current) return;

      isSyncingScrollRef.current = true;
      const scrollPercentage = container.scrollTop / (container.scrollHeight - container.clientHeight || 1);

      void webview
        .executeJavaScript(
          `
          (function() {
            const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
            const clientHeight = window.innerHeight || document.documentElement.clientHeight;
            const targetScroll = ${scrollPercentage} * (scrollHeight - clientHeight);
            window.scrollTo({ top: targetScroll, behavior: 'auto' });
          })();
        `
        )
        .catch(() => {})
        .finally(() => {
          setTimeout(() => {
            isSyncingScrollRef.current = false;
          }, 50);
        });
    };

    container.addEventListener('scroll', handleContainerScroll);
    return () => container.removeEventListener('scroll', handleContainerScroll);
  }, [containerRef]);

  // 计算代理滚动层的高度 / Calculate proxy scroll layer height
  const proxyHeight = webviewContentHeight > 0 ? webviewContentHeight : '100%';

  return (
    <div ref={containerRef || divRef} className={`h-full w-full overflow-auto relative ${currentTheme === 'dark' ? 'bg-bg-1' : 'bg-white'}`}>
      {isElectron ? (
        <>
          {/* 代理滚动层：使容器可滚动 / Proxy scroll layer: makes container scrollable */}
          <div style={{ height: proxyHeight, width: '100%', pointerEvents: 'none' }} />
          {/* webview 固定在容器顶部 / webview fixed at container top */}
          {/* key 确保内容改变时 webview 重新挂载 / key ensures webview remounts when content changes */}
          <webview
            key={webviewSrc}
            ref={webviewRef}
            src={webviewSrc}
            className='w-full border-0'
            style={{
              display: 'inline-flex',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              height: '100%',
            }}
            webpreferences='allowRunningInsecureContent, javascript=yes'
          />
        </>
      ) : (
        <iframe
          ref={iframeRef}
          srcDoc={browserHtmlContent}
          className='w-full h-full border-0'
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
          }}
          sandbox='allow-scripts allow-same-origin allow-forms allow-popups allow-modals'
        />
      )}
    </div>
  );
};

export default HTMLRenderer;
