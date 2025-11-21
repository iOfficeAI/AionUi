/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface HTMLRendererProps {
  content: string;
  filePath?: string;
  workspace?: string;
  containerRef?: React.RefObject<HTMLDivElement>;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
  inspectMode?: boolean; // 是否开启检查模式 / Whether inspect mode is enabled
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
const HTMLRenderer: React.FC<HTMLRendererProps> = ({ content, filePath, workspace, containerRef, inspectMode = false }) => {
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

  const resourceBaseDir = useMemo(() => {
    const normalizeDir = (dir?: string) => {
      if (!dir) return undefined;
      const normalized = dir.replace(/\\/g, '/');
      if (!normalized) return undefined;
      return normalized.endsWith('/') ? normalized : `${normalized}/`;
    };

    if (filePath) {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const lastSlash = normalizedPath.lastIndexOf('/');
      if (lastSlash >= 0) {
        return normalizeDir(normalizedPath.slice(0, lastSlash + 1));
      }
    }

    return normalizeDir(workspace);
  }, [filePath, workspace]);

  const resourceBaseUrl = useMemo(() => {
    if (!resourceBaseDir) return undefined;
    const normalized = resourceBaseDir.replace(/\\/g, '/');
    const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return `file://${encodeURI(withLeadingSlash)}`;
  }, [resourceBaseDir]);

  // 处理 HTML 内容，注入 base 标签支持相对路径
  // Process HTML content, inject base tag for relative paths
  const processedHtml = useMemo(() => {
    let html = content;

    if (resourceBaseUrl) {
      if (!html.match(/<base\s+href=/i)) {
        if (html.match(/<head[^>]*>/i)) {
          html = html.replace(/<head[^>]*>/i, (match) => `${match}<base href="${resourceBaseUrl}">`);
        } else if (html.match(/<html[^>]*>/i)) {
          html = html.replace(/<html[^>]*>/i, (match) => `${match}<head><base href="${resourceBaseUrl}"></head>`);
        } else {
          html = `<head><base href="${resourceBaseUrl}"></head>${html}`;
        }
      }
    }

    return html;
  }, [content, resourceBaseUrl]);

  const [webviewSrc, setWebviewSrc] = useState<string>('');
  const tempFileRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const updatePreview = async () => {
      try {
        if (!tempFileRef.current) {
          const baseName = filePath?.split(/[\\/]/).pop() || 'preview.html';
          tempFileRef.current = await ipcBridge.fs.createTempFile.invoke({ fileName: baseName });
        }

        if (!tempFileRef.current) return;

        await ipcBridge.fs.writeFile.invoke({ path: tempFileRef.current, data: processedHtml });
        if (!cancelled) {
          const timestamp = Date.now();
          setWebviewSrc(`file://${tempFileRef.current}?ts=${timestamp}`);
          webviewLoadedRef.current = false;
        }
      } catch (error) {
        console.error('[HTMLRenderer] Failed to prepare preview file:', error);
      }
    };

    void updatePreview();

    return () => {
      cancelled = true;
    };
  }, [processedHtml, filePath, workspace]);

  // 监听 webview 加载完成
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
  }, []);

  // 生成检查模式注入脚本 / Generate inspect mode injection script
  // 使用 useMemo 缓存，只在 inspectMode 改变时重新生成 / Use useMemo to cache, only regenerate when inspectMode changes
  const assetPatchScript = useMemo(() => {
    if (!resourceBaseUrl) return '';
    const baseJson = JSON.stringify(resourceBaseUrl);
    return `
      (function() {
        try {
          const baseHref = ${baseJson};
          function ensureBase() {
            let baseEl = document.querySelector('base');
            if (!baseEl) {
              baseEl = document.createElement('base');
              if (document.head) {
                document.head.prepend(baseEl);
              } else if (document.documentElement) {
                const head = document.createElement('head');
                document.documentElement.insertBefore(head, document.documentElement.firstChild);
                head.appendChild(baseEl);
              }
            }
            if (baseEl) {
              baseEl.setAttribute('href', baseHref);
            }
          }

          function rewriteAttribute(selector, attribute) {
            const toAbsoluteUrl = (value) => {
              if (!value) return null;
              const trimmed = value.trim();
              if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('#')) return null;
              if (/^[a-zA-Z]+:/.test(trimmed) || trimmed.startsWith('//') || trimmed.startsWith('file://') || trimmed.startsWith('about:') || trimmed.startsWith('chrome:')) return trimmed;
              try {
                return new URL(trimmed, baseHref).href;
              } catch (error) {
                return null;
              }
            };

            document.querySelectorAll(selector).forEach((element) => {
              const currentValue = element.getAttribute(attribute);
              const absolute = toAbsoluteUrl(currentValue);
              if (absolute && absolute !== currentValue) {
                element.setAttribute(attribute, absolute);
              }
            });
          }

          ensureBase();
          rewriteAttribute('img[src]', 'src');
          rewriteAttribute('link[rel="stylesheet"][href]', 'href');
          rewriteAttribute('link[as="style"][href]', 'href');
          rewriteAttribute('source[src]', 'src');
          rewriteAttribute('video[src]', 'src');
          rewriteAttribute('audio[src]', 'src');
          rewriteAttribute('iframe[src]', 'src');
        } catch (error) {
          console.error('[HTMLRenderer] Failed to patch relative assets:', error);
        }
      })();
    `;
  }, [resourceBaseUrl]);

  const inspectScript = useMemo(() => {
    return `
      (function() {

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
        }
        if (oldListeners.contextmenu) {
          document.removeEventListener('contextmenu', oldListeners.contextmenu);
        }
        if (oldListeners.click) {
          document.removeEventListener('click', oldListeners.click);
        }

        if (!${inspectMode}) {
          // 如果关闭检查模式，移除所有相关元素 / If inspect mode is off, remove all related elements
          document.body.style.cursor = '';
          window.__inspectModeListeners = null;
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

  const combinedScript = useMemo(() => {
    return `${assetPatchScript}${inspectScript}`;
  }, [assetPatchScript, inspectScript]);

  // 执行脚本注入的函数 / Function to execute script injection
  // 使用 useCallback 缓存，避免每次渲染都创建新函数 / Use useCallback to cache, avoid creating new function on each render
  const executeScript = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // executeJavaScript 返回 Promise，需要处理 / executeJavaScript returns Promise, need to handle it
    if (!combinedScript.trim()) return;

    void webview
      .executeJavaScript(combinedScript)
      .then(() => {
        // Script injected successfully
      })
      .catch((_error) => {
        // Failed to inject inspect script
      });
  }, [combinedScript]);

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

  return (
    <div ref={containerRef || divRef} className={`h-full w-full overflow-auto ${currentTheme === 'dark' ? 'bg-bg-1' : 'bg-white'}`}>
      {/* key 确保内容改变时 webview 重新挂载 / key ensures webview remounts when content changes */}
      {webviewSrc && <webview key={webviewSrc} ref={webviewRef} src={webviewSrc} className='w-full h-full border-0' style={{ display: 'inline-flex' }} webpreferences='allowRunningInsecureContent, allowFileAccessFromFileUrls, javascript=yes' />}
    </div>
  );
};

export default HTMLRenderer;
