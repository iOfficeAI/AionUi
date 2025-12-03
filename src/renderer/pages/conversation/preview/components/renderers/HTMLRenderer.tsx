/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
 * HTML 渲染器组件
 * HTML renderer component
 *
 * 在 webview 中渲染 HTML 内容（Electron 专用标签）
 * Renders HTML content in a webview (Electron-specific tag)
 */
const HTMLRenderer: React.FC<HTMLRendererProps> = ({ content, filePath, containerRef, inspectMode = false, copySuccessMessage, onElementSelected }) => {
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

  // 判断是否应该直接从文件加载（支持相对资源）
  // Determine if should load directly from file (supports relative resources)
  const shouldLoadFromFile = useMemo(() => {
    if (!filePath) return false;
    // 检查 HTML 是否引用了相对资源 / Check if HTML references relative resources
    const hasRelativeResources = /<link[^>]+href=["'](?!https?:\/\/|data:|\/\/)[^"']+["']/i.test(content) || /<script[^>]+src=["'](?!https?:\/\/|data:|\/\/)[^"']+["']/i.test(content) || /<img[^>]+src=["'](?!https?:\/\/|data:|\/\/)[^"']+["']/i.test(content);
    return hasRelativeResources;
  }, [content, filePath]);

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
    let html = content;

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
  }, [content, filePath, shouldLoadFromFile]);

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

  // 监听 webview 控制台消息，捕获检查元素事件 / Listen for webview console messages to capture inspect element events
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !onElementSelected) return;

    const handleConsoleMessage = (event: Event) => {
      const consoleEvent = event as Event & { message?: string };
      const message = consoleEvent.message;

      if (typeof message === 'string' && message.startsWith('__INSPECT_ELEMENT__')) {
        try {
          const jsonStr = message.slice('__INSPECT_ELEMENT__'.length);
          const data = JSON.parse(jsonStr) as InspectedElement;
          onElementSelected(data);
        } catch (e) {
          console.warn('[HTMLRenderer] Failed to parse inspect element message:', e);
        }
      }
    };

    webview.addEventListener('console-message', handleConsoleMessage);

    return () => {
      webview.removeEventListener('console-message', handleConsoleMessage);
    };
  }, [onElementSelected]);

  return (
    <div ref={containerRef || divRef} className={`h-full w-full overflow-auto ${currentTheme === 'dark' ? 'bg-bg-1' : 'bg-white'}`}>
      {/* key 确保内容改变时 webview 重新挂载 / key ensures webview remounts when content changes */}
      <webview key={webviewSrc} ref={webviewRef} src={webviewSrc} className='w-full h-full border-0' style={{ display: 'inline-flex' }} webpreferences='allowRunningInsecureContent, javascript=yes' />
    </div>
  );
};

export default HTMLRenderer;
