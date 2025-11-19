/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface HTMLRendererProps {
  content: string;
  filePath?: string;
  containerRef?: React.RefObject<HTMLDivElement>;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
  inspectMode?: boolean; // 是否开启检查模式 / Whether inspect mode is enabled
}

// Electron webview 元素的类型定义 / Type definition for Electron webview element
interface ElectronWebView extends HTMLElement {
  src: string;
  executeJavaScript: (code: string) => Promise<void>;
  addEventListener: (event: string, listener: () => void) => void;
  removeEventListener: (event: string, listener: () => void) => void;
}

/**
 * HTML 渲染器组件
 * HTML renderer component
 *
 * 在 webview 中渲染 HTML 内容（Electron 专用标签）
 * Renders HTML content in a webview (Electron-specific tag)
 */
const HTMLRenderer: React.FC<HTMLRendererProps> = ({ content, filePath, containerRef, inspectMode = false }) => {
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

  // 处理 HTML 内容，注入 base 标签支持相对路径
  // Process HTML content, inject base tag for relative paths
  const processedHtml = useMemo(() => {
    let html = content;

    // 注入 base 标签支持相对路径 / Inject base tag for relative paths
    if (filePath) {
      const fileDir = filePath.substring(0, filePath.lastIndexOf('/') + 1);
      const baseUrl = `file://${fileDir}`;

      console.log('[HTMLRenderer] File path:', filePath);
      console.log('[HTMLRenderer] Base URL:', baseUrl);

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

    console.log('[HTMLRenderer] Processed HTML length:', html.length);
    console.log('[HTMLRenderer] HTML preview:', html.substring(0, 500));
    return html;
  }, [content, filePath]);

  // 使用 data URL 来加载内容（避免 CSP 问题）
  // Use data URL to load content (avoids CSP issues)
  const dataUrl = useMemo(() => {
    const encoded = encodeURIComponent(processedHtml);
    return `data:text/html;charset=utf-8,${encoded}`;
  }, [processedHtml]);

  // 监听 webview 加载完成
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDidFinishLoad = () => {
      webviewLoadedRef.current = true; // 标记为已加载 / Mark as loaded
      console.log('[HTMLRenderer] webview loaded successfully');
    };

    const handleDidFailLoad = (event: Event) => {
      console.error('[HTMLRenderer] webview failed to load:', event);
    };

    webview.addEventListener('did-finish-load', handleDidFinishLoad);
    webview.addEventListener('did-fail-load', handleDidFailLoad);

    return () => {
      webview.removeEventListener('did-finish-load', handleDidFinishLoad);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
    };
  }, []);

  // 生成检查模式注入脚本 / Generate inspect mode injection script
  // 使用 useMemo 缓存，只在 inspectMode 改变时重新生成 / Use useMemo to cache, only regenerate when inspectMode changes
  const inspectScript = useMemo(() => {
    return `
      (function() {
        console.log('[HTMLRenderer Inspect] Script executing, inspectMode:', ${inspectMode});

        // 移除旧的检查模式样式和监听器 / Remove old inspect mode styles and listeners
        const oldStyle = document.getElementById('inspect-mode-style');
        if (oldStyle) oldStyle.remove();

        const oldOverlay = document.getElementById('inspect-mode-overlay');
        if (oldOverlay) oldOverlay.remove();

        const oldMenu = document.getElementById('inspect-mode-menu');
        if (oldMenu) oldMenu.remove();

        // 移除旧的事件监听器 / Remove old event listeners
        const oldListeners = window.__inspectModeListeners || {};
        if (oldListeners.mousemove) {
          document.removeEventListener('mousemove', oldListeners.mousemove);
          console.log('[HTMLRenderer Inspect] Removed mousemove listener');
        }
        if (oldListeners.contextmenu) {
          document.removeEventListener('contextmenu', oldListeners.contextmenu);
          console.log('[HTMLRenderer Inspect] Removed contextmenu listener');
        }
        if (oldListeners.click) {
          document.removeEventListener('click', oldListeners.click);
          console.log('[HTMLRenderer Inspect] Removed click listener');
        }

        if (!${inspectMode}) {
          // 如果关闭检查模式，移除所有相关元素 / If inspect mode is off, remove all related elements
          document.body.style.cursor = '';
          window.__inspectModeListeners = null;
          console.log('[HTMLRenderer Inspect] Inspect mode disabled, cleaned up');
          return;
        }

        // 添加检查模式样式 / Add inspect mode styles
        const style = document.createElement('style');
        style.id = 'inspect-mode-style';
        style.textContent = \`
          .inspect-overlay {
            position: fixed;
            pointer-events: none;
            background: rgba(59, 130, 246, 0.1);
            border: 2px solid #3b82f6;
            z-index: 999999;
            transition: all 0.1s ease;
          }
          .inspect-menu {
            position: fixed;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            padding: 8px;
            z-index: 1000000;
            min-width: 180px;
          }
          .inspect-menu-item {
            padding: 8px 12px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 14px;
            color: #333;
            transition: background 0.2s;
          }
          .inspect-menu-item:hover {
            background: #f3f4f6;
          }
        \`;
        document.head.appendChild(style);

        // 创建高亮覆盖层 / Create highlight overlay
        const overlay = document.createElement('div');
        overlay.id = 'inspect-mode-overlay';
        overlay.className = 'inspect-overlay';
        overlay.style.display = 'none';
        document.body.appendChild(overlay);

        let currentElement = null;
        let contextMenu = null;

        // 隐藏右键菜单 / Hide context menu
        const hideMenu = () => {
          if (contextMenu) {
            contextMenu.remove();
            contextMenu = null;
          }
        };

        // 鼠标移动时高亮元素 / Highlight element on mouse move
        const handleMouseMove = (e) => {
          const element = document.elementFromPoint(e.clientX, e.clientY);
          if (element && element !== currentElement && element !== overlay && !element.closest('#inspect-mode-menu')) {
            currentElement = element;
            const rect = element.getBoundingClientRect();
            overlay.style.display = 'block';
            overlay.style.left = rect.left + 'px';
            overlay.style.top = rect.top + 'px';
            overlay.style.width = rect.width + 'px';
            overlay.style.height = rect.height + 'px';
          }
        };

        // 右键显示菜单 / Right-click to show menu
        const handleContextMenu = (e) => {
          e.preventDefault();
          hideMenu();

          const element = document.elementFromPoint(e.clientX, e.clientY);
          if (element && element !== overlay) {
            // 创建右键菜单 / Create context menu
            contextMenu = document.createElement('div');
            contextMenu.id = 'inspect-mode-menu';
            contextMenu.className = 'inspect-menu';
            contextMenu.style.left = e.clientX + 'px';
            contextMenu.style.top = e.clientY + 'px';

            // 复制 DOM 元素选项 / Copy DOM element option
            const copyItem = document.createElement('div');
            copyItem.className = 'inspect-menu-item';
            copyItem.textContent = '复制 DOM 元素';
            copyItem.onclick = () => {
              const html = element.outerHTML;
              // 创建临时textarea复制内容 / Create temporary textarea to copy content
              const textarea = document.createElement('textarea');
              textarea.value = html;
              textarea.style.position = 'fixed';
              textarea.style.opacity = '0';
              document.body.appendChild(textarea);
              textarea.select();
              document.execCommand('copy');
              document.body.removeChild(textarea);

              // 显示提示 / Show notification
              const notification = document.createElement('div');
              notification.textContent = '✓ 已复制 HTML';
              notification.style.cssText = \`
                position: fixed;
                top: 20px;
                right: 20px;
                background: #10b981;
                color: white;
                padding: 12px 20px;
                border-radius: 6px;
                font-size: 14px;
                z-index: 1000000;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              \`;
              document.body.appendChild(notification);
              setTimeout(() => notification.remove(), 2000);

              hideMenu();
            };

            contextMenu.appendChild(copyItem);
            document.body.appendChild(contextMenu);
          }
        };

        // 点击其他地方关闭菜单 / Click elsewhere to close menu
        const handleClick = (e) => {
          if (contextMenu && !contextMenu.contains(e.target)) {
            hideMenu();
          }
        };

        // 添加事件监听 / Add event listeners
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('click', handleClick);

        // 保存监听器引用以便后续移除 / Save listener references for later removal
        window.__inspectModeListeners = {
          mousemove: handleMouseMove,
          contextmenu: handleContextMenu,
          click: handleClick
        };

        // 修改鼠标样式 / Change cursor style
        document.body.style.cursor = 'crosshair';
      })();
    `;
  }, [inspectMode]);

  // 执行脚本注入的函数 / Function to execute script injection
  // 使用 useCallback 缓存，避免每次渲染都创建新函数 / Use useCallback to cache, avoid creating new function on each render
  const executeScript = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // executeJavaScript 返回 Promise，需要处理 / executeJavaScript returns Promise, need to handle it
    void webview
      .executeJavaScript(inspectScript)
      .then(() => {
        console.log('[HTMLRenderer] Inject inspect mode script, mode:', inspectMode);
      })
      .catch((error) => {
        console.error('[HTMLRenderer] Failed to inject inspect script:', error);
      });
  }, [inspectScript, inspectMode]);

  // 注入检查模式脚本 / Inject inspect mode script
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // 如果 webview 已经加载完成，立即执行脚本 / If webview is already loaded, execute script immediately
    if (webviewLoadedRef.current) {
      console.log('[HTMLRenderer] Webview already loaded, executing script immediately');
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

  return (
    <div ref={containerRef || divRef} className={`h-full w-full overflow-auto ${currentTheme === 'dark' ? 'bg-bg-1' : 'bg-white'}`}>
      <webview
        ref={webviewRef}
        src={dataUrl}
        className='w-full h-full border-0'
        style={{ display: 'inline-flex' }}
        // @ts-expect-error - webview 是 Electron 特有标签
        webpreferences='allowRunningInsecureContent, javascript=yes'
      />
    </div>
  );
};

export default HTMLRenderer;
