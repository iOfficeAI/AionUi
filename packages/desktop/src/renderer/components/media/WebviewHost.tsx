/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Left, Right, Refresh, Loading } from '@icon-park/react';
import { ipcBridge } from '@/common';
import { InternalNavTracker, shouldResetHistoryForUrlProp } from './webviewHistory';

export interface WebviewHostProps {
  /** URL to display */
  url: string;
  /** Unique key for session persistence */
  id?: string;
  /** Whether to show the navigation bar (back/forward/refresh/URL) */
  showNavBar?: boolean;
  /** Webview partition for cache/session isolation, e.g. "persist:ext-settings-feishu" */
  partition?: string;
  /** Extra class names for root container */
  className?: string;
  /** Extra styles for root container */
  style?: React.CSSProperties;
  /** Called when the page finishes loading */
  onDidFinishLoad?: () => void;
  /** Called when the page fails to load */
  onDidFailLoad?: (errorCode: number, errorDescription: string) => void;
  /**
   * Called whenever the displayed URL changes (navigation, link click, address bar).
   * Lets the owner persist the current location without polling the webview.
   */
  onUrlChange?: (url: string) => void;
  /** Called when the page reports a new document title */
  onTitleChange?: (title: string) => void;
  /** Called when the page reports favicons; receives the first (preferred) one */
  onFaviconChange?: (favicon: string) => void;
  /**
   * Overrides how raw address bar input becomes a URL.
   * Return null to ignore the input. Defaults to bare `https://` prefixing,
   * which keeps existing embedded consumers behaving exactly as before.
   */
  resolveUrlInput?: (raw: string) => string | null;
}

const MIN_ZOOM_FACTOR = 0.75;
const MAX_ZOOM_FACTOR = 1.5;

/**
 * Shared webview host component — extracted from URLViewer.
 *
 * Features:
 * - Link/window.open/form interception → internal navigation
 * - Self-managed history stacks (back / forward)
 * - Loading indicator
 * - Partition support for cache isolation
 * - Optional navigation bar (hidden by default for embedded use)
 */
const WebviewHost: React.FC<WebviewHostProps> = ({
  url,
  id: _id,
  showNavBar = false,
  partition,
  className,
  style,
  onDidFinishLoad,
  onDidFailLoad,
  onUrlChange,
  onTitleChange,
  onFaviconChange,
  resolveUrlInput,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const autoFitPendingRef = useRef(false);

  // Callbacks are mirrored into refs so the listener effect does not re-subscribe
  // on every parent render (inline arrow props would otherwise churn it).
  const onUrlChangeRef = useRef(onUrlChange);
  onUrlChangeRef.current = onUrlChange;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const onFaviconChangeRef = useRef(onFaviconChange);
  onFaviconChangeRef.current = onFaviconChange;

  // Navigation state
  const [currentUrl, setCurrentUrl] = useState(url);
  const [inputUrl, setInputUrl] = useState(url);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [webviewReady, setWebviewReady] = useState(false);

  // 最近由本组件内部触发的导航地址集合。
  //
  // 浏览器 tab 会把「当前地址」当作 url prop 回传下来，于是内部导航会形成回环：
  // 内部导航 → onUrlChange → 父组件更新 url prop → 下面的重置 effect 触发 → 历史被清空。
  // 结果就是后退按钮永远是灰的。记住内部导航的地址，当 prop 只是这个回环的回声时
  // 就跳过重置。完整说明与「为什么要记一组而不是最后一个」见 webviewHistory.ts。
  //
  // Addresses recently navigated to from inside this component.
  //
  // A browser tab feeds its current address back down as the `url` prop, so an
  // internal navigation forms a loop: internal nav → onUrlChange → parent updates
  // the `url` prop → the reset effect below fires → history is wiped. The result is
  // a permanently greyed-out Back button. Remember the internal targets so the reset
  // can be skipped when the prop is merely the echo of that loop. See
  // webviewHistory.ts for the full rationale, including why this tracks a set
  // rather than only the most recent target.
  const internalNavRef = useRef(new InternalNavTracker());
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const isStarOfficeUrl = useCallback((targetUrl: string): boolean => {
    try {
      const parsed = new URL(targetUrl);
      const host = parsed.hostname.toLowerCase();
      const localHost = host === '127.0.0.1' || host === 'localhost';
      const knownPort = ['18791', '18888', '19000'].includes(parsed.port);
      return localHost && knownPort;
    } catch {
      return false;
    }
  }, []);

  const isStarOffice = isStarOfficeUrl(currentUrl);

  // Single funnel for URL change notifications: every navigation path
  // (address bar, link click, back/forward, did-navigate) lands on currentUrl,
  // so watching it here avoids sprinkling callbacks across each handler.
  useEffect(() => {
    if (!currentUrl) return;
    onUrlChangeRef.current?.(currentUrl);
  }, [currentUrl]);

  // Reset when props.url changes
  useEffect(() => {
    // 只有「外部」换址才该清空历史（换 tab、换预览文件）。判断逻辑抽到
    // shouldResetHistoryForUrlProp，那里有完整的回环说明与单测。
    //
    // Only an *external* address change should clear history (switching tabs or
    // preview targets). The decision lives in shouldResetHistoryForUrlProp, which
    // carries the full explanation of the loop and its unit tests.
    if (!shouldResetHistoryForUrlProp(url, internalNavRef.current)) return;
    internalNavRef.current.clear();
    setCanGoBack(false);
    setCanGoForward(false);
    setCurrentUrl(url);
    setInputUrl(url);
    setIsLoading(true);
    setZoomFactor(1);
    setWebviewReady(false);
    autoFitPendingRef.current = isStarOfficeUrl(url);
  }, [url]);

  useEffect(() => {
    const webviewEl = webviewRef.current as any;
    if (!webviewReady || !webviewEl?.setZoomFactor) return;
    try {
      webviewEl.setZoomFactor(isStarOffice ? zoomFactor : 1);
    } catch {
      // Ignore zoom timing errors
    }
  }, [isStarOffice, zoomFactor, webviewReady]);

  /**
   * 主动导航到新地址 / Navigate to a new address.
   *
   * 历史由 webview 自己维护，这里只需要发起导航；按钮状态在 did-navigate 里统一同步。
   * The webview owns the history, so this only triggers the navigation — button state
   * is synced centrally in did-navigate.
   */
  const navigateToWithHistory = useCallback(
    (targetUrl: string) => {
      const webviewEl = webviewRef.current;
      if (!webviewEl || !targetUrl) return;
      if (targetUrl === currentUrl) return;

      // 标记为内部导航，避免 url prop 回环触发历史重置
      // Mark as internal so the url-prop echo cannot trigger a history reset.
      internalNavRef.current.record(targetUrl);
      setCurrentUrl(targetUrl);
      setInputUrl(targetUrl);

      webviewEl.src = targetUrl;
    },
    [currentUrl]
  );

  // Webview event listeners
  useEffect(() => {
    const webviewEl = webviewRef.current;
    if (!webviewEl) return;

    const handleStartLoading = () => setIsLoading(true);
    const handleStopLoading = () => {
      setIsLoading(false);
    };

    /**
     * 把按钮的可用状态对齐 webview 的真实历史。
     * Align the buttons' enabled state with the webview's real history.
     */
    const syncNavState = () => {
      setCanGoBack(Boolean(webviewEl.canGoBack?.()));
      setCanGoForward(Boolean(webviewEl.canGoForward?.()));
    };

    // Inject script to intercept links / window.open / form submissions
    const injectClickInterceptor = () => {
      webviewEl
        .executeJavaScript(
          `
        (function() {
          if (window.__webviewHostInjected) return;
          window.__webviewHostInjected = true;

          document.addEventListener('click', function(e) {
            let target = e.target;
            while (target && target.tagName !== 'A') {
              target = target.parentElement;
            }
            if (target && target.tagName === 'A') {
              const href = target.href;
              if (href && /^https?:/i.test(href)) {
                e.preventDefault();
                e.stopPropagation();
                window.postMessage({ type: '__WEBVIEW_HOST_NAVIGATE__', url: href }, '*');
              }
            }
          }, true);

          const originalOpen = window.open;
          window.open = function(url) {
            if (url && /^https?:/i.test(url)) {
              window.postMessage({ type: '__WEBVIEW_HOST_NAVIGATE__', url: url }, '*');
              return null;
            }
            return originalOpen.apply(this, arguments);
          };

          document.addEventListener('submit', function(e) {
            const form = e.target;
            if (form && form.action && /^https?:/i.test(form.action)) {
              e.preventDefault();
              window.postMessage({ type: '__WEBVIEW_HOST_NAVIGATE__', url: form.action }, '*');
            }
          }, true);
        })();
        true;
      `
        )
        .catch(() => {});
    };

    const handleConsoleMessage = (event: Electron.ConsoleMessageEvent) => {
      try {
        if (event.message.includes('__WEBVIEW_HOST_NAVIGATE__')) {
          const match = event.message.match(/"url":"([^"]+)"/);
          if (match && match[1]) {
            navigateToWithHistory(match[1]);
          }
          return;
        }

        if (event.message.includes('__AIONUI_WEBVIEW_ZOOM__')) {
          const match = event.message.match(/"deltaY":(-?\d+(\.\d+)?)/);
          if (match && match[1]) {
            const deltaY = Number(match[1]);
            const step = deltaY < 0 ? 0.08 : -0.08;
            setZoomFactor((prev) => {
              const next = Number((prev + step).toFixed(2));
              return Math.max(MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM_FACTOR, next));
            });
          }
          return;
        }

        if (event.message.includes('__AIONUI_WEBVIEW_ZOOM_RESET__')) {
          setZoomFactor(1);
        }
      } catch {
        // Ignore parse errors
      }
    };

    const handleDidNavigate = (event: Event & { url?: string }) => {
      const newUrl = event.url;
      if (newUrl && newUrl !== currentUrl) {
        internalNavRef.current.record(newUrl);
        setCurrentUrl(newUrl);
        setInputUrl(newUrl);
      }
      syncNavState();
    };

    const handleDomReady = () => {
      setWebviewReady(true);
      syncNavState();
      injectClickInterceptor();

      /**
       * 把这个 webview 的 webContents id 报给主进程，让单目标 CDP 通道附加到它。
       *
       * 放在 dom-ready 里：此时 getWebContentsId() 才可用，而且每次导航/切 tab 后都会
       * 再触发一次，正好让通道跟着用户当前看的页面走。失败只记日志不打扰用户 ——
       * Agent 操作浏览器本就是可选能力，不该因为它挡住正常浏览。
       *
       * Report this webview's webContents id so the single-target CDP bridge can attach.
       * Done on dom-ready because getWebContentsId() is only valid by then, and because it
       * fires again after navigation or a tab switch, which keeps the bridge pointed at the
       * page the user is actually viewing. Failures are logged only: agent browser control
       * is optional and must not block ordinary browsing.
       */
      try {
        const webContentsId = webviewEl.getWebContentsId?.();
        if (typeof webContentsId === 'number') {
          void ipcBridge.application.reportBrowserWebContentsId.invoke({ webContentsId }).then((res) => {
            if (!res.success && res.msg) console.warn('[browser] agent control unavailable:', res.msg);
          });
        }
      } catch (error) {
        console.warn('[browser] could not report webContents id:', error);
      }

      // Inject viewport meta for responsive pages
      webviewEl
        .executeJavaScript(
          `
        (function() {
          let viewport = document.querySelector('meta[name="viewport"]');
          if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            document.head.appendChild(viewport);
          }
        })();
        true;
      `
        )
        .catch(() => {});

      // Set up message listener inside webview
      webviewEl
        .executeJavaScript(
          `
        window.addEventListener('message', function(e) {
          if (e.data && e.data.type === '__WEBVIEW_HOST_NAVIGATE__') {
            console.log('__WEBVIEW_HOST_NAVIGATE__', JSON.stringify(e.data));
          }
        });
        true;
      `
        )
        .catch(() => {});

      if (isStarOfficeUrl(currentUrl)) {
        webviewEl
          .executeJavaScript(
            `
          (function() {
            if (window.__aionuiZoomInjected) return true;
            window.__aionuiZoomInjected = true;
            window.addEventListener('wheel', function(e) {
              if (!(e.ctrlKey || e.metaKey)) return;
              e.preventDefault();
              console.log('__AIONUI_WEBVIEW_ZOOM__', JSON.stringify({ deltaY: e.deltaY }));
            }, { passive: false, capture: true });
            window.addEventListener('keydown', function(e) {
              if (!(e.ctrlKey || e.metaKey)) return;
              if (e.key === '0') {
                e.preventDefault();
                console.log('__AIONUI_WEBVIEW_ZOOM_RESET__');
              }
            }, { capture: true });
            return true;
          })();
          true;
        `
          )
          .catch(() => {});
      }

      if (isStarOfficeUrl(currentUrl) && autoFitPendingRef.current) {
        window.setTimeout(() => {
          const currentWebview = webviewRef.current;
          const currentContent = contentRef.current;
          if (!currentWebview || !currentContent) return;
          void currentWebview
            .executeJavaScript(
              `
            (() => {
              try {
                const stage = document.getElementById('main-stage');
                const body = document.body;
                const doc = document.documentElement;
                const width = Math.max(stage?.scrollWidth || 0, body?.scrollWidth || 0, doc?.scrollWidth || 0, window.innerWidth || 0);
                return { width };
              } catch (e) {
                return { width: window.innerWidth || 0 };
              }
            })();
          `
            )
            .then((result: any) => {
              const stageWidth = Number(result?.width || 0);
              if (!stageWidth) return;
              const next = Number((currentContent.clientWidth / stageWidth).toFixed(2));
              setZoomFactor(Math.max(MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM_FACTOR, next)));
              autoFitPendingRef.current = false;
            })
            .catch(() => {});
        }, 120);
      }
    };

    const handleDidFinishLoad = () => {
      setIsLoading(false);
      onDidFinishLoad?.();
    };

    const handleDidFailLoad = (event: any) => {
      setIsLoading(false);
      onDidFailLoad?.(event.errorCode, event.errorDescription);
    };

    const handlePageTitleUpdated = (event: Event & { title?: string }) => {
      if (event.title) onTitleChangeRef.current?.(event.title);
    };

    const handlePageFaviconUpdated = (event: Event & { favicons?: string[] }) => {
      const favicons = event.favicons;
      if (Array.isArray(favicons) && favicons[0]) onFaviconChangeRef.current?.(favicons[0]);
    };

    webviewEl.addEventListener('did-start-loading', handleStartLoading);
    webviewEl.addEventListener('did-stop-loading', handleStopLoading);
    webviewEl.addEventListener('dom-ready', handleDomReady);
    webviewEl.addEventListener('did-navigate', handleDidNavigate as EventListener);
    webviewEl.addEventListener('did-navigate-in-page', handleDidNavigate as EventListener);
    webviewEl.addEventListener('console-message', handleConsoleMessage as EventListener);
    webviewEl.addEventListener('did-finish-load', handleDidFinishLoad);
    webviewEl.addEventListener('did-fail-load', handleDidFailLoad as EventListener);
    webviewEl.addEventListener('page-title-updated', handlePageTitleUpdated as EventListener);
    webviewEl.addEventListener('page-favicon-updated', handlePageFaviconUpdated as EventListener);

    return () => {
      webviewEl.removeEventListener('did-start-loading', handleStartLoading);
      webviewEl.removeEventListener('did-stop-loading', handleStopLoading);
      webviewEl.removeEventListener('dom-ready', handleDomReady);
      webviewEl.removeEventListener('did-navigate', handleDidNavigate as EventListener);
      webviewEl.removeEventListener('did-navigate-in-page', handleDidNavigate as EventListener);
      webviewEl.removeEventListener('console-message', handleConsoleMessage as EventListener);
      webviewEl.removeEventListener('did-finish-load', handleDidFinishLoad);
      webviewEl.removeEventListener('did-fail-load', handleDidFailLoad as EventListener);
      webviewEl.removeEventListener('page-title-updated', handlePageTitleUpdated as EventListener);
      webviewEl.removeEventListener('page-favicon-updated', handlePageFaviconUpdated as EventListener);
    };
  }, [navigateToWithHistory, currentUrl, onDidFinishLoad, onDidFailLoad, isStarOfficeUrl]);

  // Resize observer for content area
  useEffect(() => {
    const contentEl = contentRef.current;
    const webviewEl = webviewRef.current;
    if (!contentEl || !webviewEl) return;

    const resize = () => {
      const contentRect = contentEl.getBoundingClientRect();
      if (contentRect.width > 0 && contentRect.height > 0) {
        webviewEl.style.width = `${contentRect.width}px`;
        webviewEl.style.height = `${contentRect.height}px`;
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(contentEl);

    return () => observer.disconnect();
  }, []);

  const handleZoomReset = useCallback(() => {
    if (!isStarOffice) return;
    setZoomFactor(1);
  }, [isStarOffice]);

  const handleZoomFit = useCallback(() => {
    const currentWebview = webviewRef.current;
    const currentContent = contentRef.current;
    if (!isStarOffice || !currentWebview || !currentContent) return;
    void currentWebview
      .executeJavaScript(
        `
      (() => {
        try {
          const stage = document.getElementById('main-stage');
          const body = document.body;
          const doc = document.documentElement;
          const width = Math.max(stage?.scrollWidth || 0, body?.scrollWidth || 0, doc?.scrollWidth || 0, window.innerWidth || 0);
          return { width };
        } catch (e) {
          return { width: window.innerWidth || 0 };
        }
      })();
    `
      )
      .then((result: any) => {
        const stageWidth = Number(result?.width || 0);
        if (!stageWidth) return;
        const next = Number((currentContent.clientWidth / stageWidth).toFixed(2));
        setZoomFactor(Math.max(MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM_FACTOR, next)));
      })
      .catch(() => {});
  }, [isStarOffice]);

  const handleOuterWheelZoom = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!isStarOffice) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const step = event.deltaY < 0 ? 0.08 : -0.08;
      setZoomFactor((prev) => {
        const next = Number((prev + step).toFixed(2));
        return Math.max(MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM_FACTOR, next));
      });
    },
    [isStarOffice]
  );

  /**
   * 后退 / 前进直接交给 webview 自己的历史。
   *
   * 之前是手写两个地址栈 + 手动改 src。这在浏览器 tab 上是坏的：webview 自己的历史
   * 与手写栈是两份状态，重定向、页内跳转、prop 回环都会让它们对不上，出现「按钮亮着
   * 但点了没反应」（canGoBack 为 true，而栈已经被清空）。webview 本来就维护着一份
   * 准确的历史，用它就不存在同步问题。
   *
   * Delegate Back/Forward to the webview's own history instead of hand-rolled URL
   * stacks plus manual `src` assignment. The stacks were a second copy of state that
   * redirects, in-page routing, and prop echoes could desync from the real history,
   * producing an enabled-but-dead button (canGoBack true, stack already cleared).
   * The webview already tracks this accurately, so there is nothing to keep in sync.
   */
  const handleGoBack = useCallback(() => {
    const webviewEl = webviewRef.current;
    if (!webviewEl?.canGoBack?.()) return;
    webviewEl.goBack();
  }, []);

  const handleGoForward = useCallback(() => {
    const webviewEl = webviewRef.current;
    if (!webviewEl?.canGoForward?.()) return;
    webviewEl.goForward();
  }, []);

  // Refresh
  const handleRefresh = useCallback(() => {
    webviewRef.current?.reload();
  }, []);

  // URL bar submit
  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const raw = inputUrl.trim();
      if (!raw) return;
      if (resolveUrlInput) {
        const resolved = resolveUrlInput(raw);
        if (!resolved) return;
        navigateToWithHistory(resolved);
        return;
      }
      const targetUrl = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
      navigateToWithHistory(targetUrl);
    },
    [inputUrl, navigateToWithHistory, resolveUrlInput]
  );

  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setInputUrl(currentUrl);
        (e.target as HTMLInputElement).blur();
      }
    },
    [currentUrl]
  );

  // Build webview attributes
  /**
   * 这个 webview 渲染任意外部网页，所以三个开关都按「不信任页面」来设。
   *
   * contextIsolation=yes 是刻意打开的：Electron 官方建议即使关掉 nodeIntegration 也保持
   * 隔离，多一层纵深。我们不依赖与页面共享 JS 上下文 —— 注入脚本和宿主之间靠
   * postMessage → console.log → 'console-message' 事件通信（见 handleConsoleMessage），
   * 全程在页面世界里，隔离开着照样成立。别为了图方便把它关回 no：那样以后任何
   * preload / IPC 暴露都会被不可信页面直接摸到。
   *
   * This webview renders arbitrary external pages, so all three flags assume the page is
   * untrusted. contextIsolation is deliberately on: Electron recommends keeping it even
   * with nodeIntegration off, for defence in depth. Nothing here needs a shared JS context
   * with the page — the injected script talks to the host via
   * postMessage → console.log → the 'console-message' event (see handleConsoleMessage),
   * which stays entirely in the page world and works with isolation enabled. Do not flip
   * this back to `no` for convenience: any future preload or IPC surface would then be
   * directly reachable by untrusted pages.
   */
  const webviewAttrs: Record<string, string> = {
    allowpopups: 'false',
    webpreferences: 'contextIsolation=yes, nodeIntegration=no, nativeWindowOpen=no',
  };
  if (partition) {
    webviewAttrs.partition = partition;
  }

  return (
    <div ref={containerRef} className={`h-full w-full flex flex-col ${className ?? ''}`} style={style}>
      {showNavBar && (
        <style>
          {`
            .aion-url-viewer-toolbar {
              --viewer-border: var(--color-border-2);
              --viewer-border-hover: var(--color-border-3);
              --viewer-bg: var(--color-bg-3);
              --viewer-bg-hover: var(--color-fill-2);
              --viewer-text: var(--color-text-2);
              --viewer-text-muted: var(--color-text-3);
            }
            .aion-url-viewer-toolbar .toolbar-btn {
              -webkit-appearance: none;
              appearance: none;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              height: 30px;
              min-width: 30px;
              padding: 0 10px;
              border-radius: 10px;
              border: 1px solid var(--viewer-border);
              background: var(--viewer-bg);
              color: var(--viewer-text);
              line-height: 1;
              font-size: 12px;
              transition: all 150ms ease;
              cursor: pointer;
            }
            .aion-url-viewer-toolbar .toolbar-btn.icon-btn {
              width: 30px;
              min-width: 30px;
              padding: 0;
            }
            .aion-url-viewer-toolbar .toolbar-btn:hover:not(:disabled) {
              background: var(--viewer-bg-hover);
              border-color: var(--viewer-border-hover);
            }
            .aion-url-viewer-toolbar .toolbar-btn:active:not(:disabled) {
              transform: translateY(0.5px);
            }
            .aion-url-viewer-toolbar .toolbar-btn:focus-visible {
              outline: none;
              border-color: rgb(var(--primary-6));
              box-shadow: 0 0 0 2px rgba(var(--primary-6), 0.12);
            }
            .aion-url-viewer-toolbar .toolbar-btn:disabled {
              opacity: 0.55;
              cursor: not-allowed;
              color: var(--viewer-text-muted);
              background: var(--color-bg-2);
            }
            .aion-url-viewer-toolbar .toolbar-chip {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              height: 30px;
              min-width: 48px;
              padding: 0 10px;
              border-radius: 10px;
              border: 1px solid var(--viewer-border);
              background: var(--color-bg-2);
              color: var(--viewer-text-muted);
              font-size: 11px;
              line-height: 1;
            }
            .aion-url-viewer-toolbar .toolbar-input {
              -webkit-appearance: none;
              appearance: none;
              /* box-sizing 必须显式声明：width:100% 配 padding + border 时，
                 content-box 会把左右各 13px（12px padding + 1px border）加在
                 100% 之外，整行被顶宽 26px 而溢出预览框右边缘。
                 box-sizing must be explicit: with width:100% plus padding and
                 border, content-box adds 13px per side (12px padding + 1px
                 border) on top of the 100%, widening the row by 26px so it
                 overflows the preview panel's right edge. */
              box-sizing: border-box;
              width: 100%;
              height: 30px;
              padding: 0 12px;
              border-radius: 10px;
              border: 1px solid var(--viewer-border);
              background: var(--viewer-bg);
              color: var(--color-text-1);
              font-size: 12px;
              line-height: 30px;
              transition: all 150ms ease;
            }
            .aion-url-viewer-toolbar .toolbar-input:hover {
              border-color: var(--viewer-border-hover);
            }
            .aion-url-viewer-toolbar .toolbar-input:focus {
              outline: none;
              border-color: rgb(var(--primary-6));
              box-shadow: 0 0 0 2px rgba(var(--primary-6), 0.12);
            }
          `}
        </style>
      )}
      {/* Navigation bar (optional) */}
      {showNavBar && (
        <div className='aion-url-viewer-toolbar flex items-center gap-6px h-40px px-10px bg-bg-2 border-b border-border-1 flex-shrink-0'>
          <button
            onClick={handleGoBack}
            disabled={!canGoBack}
            className='toolbar-btn icon-btn'
            title={t('common.historyBack')}
          >
            <Left theme='outline' size={16} />
          </button>
          <button
            onClick={handleGoForward}
            disabled={!canGoForward}
            className='toolbar-btn icon-btn'
            title={t('common.forward')}
          >
            <Right theme='outline' size={16} />
          </button>
          <button onClick={handleRefresh} className='toolbar-btn icon-btn' title={t('common.refresh')}>
            {isLoading ? (
              <Loading theme='outline' size={16} className='animate-spin' />
            ) : (
              <Refresh theme='outline' size={16} />
            )}
          </button>
          {isStarOffice && (
            <div className='flex items-center gap-6px ms-2px'>
              <button onClick={handleZoomReset} className='toolbar-btn' title='Reset zoom'>
                100%
              </button>
              <button onClick={handleZoomFit} className='toolbar-btn' title='Fit'>
                Fit
              </button>
              <span className='toolbar-chip'>{Math.round(zoomFactor * 100)}%</span>
            </div>
          )}
          <form onSubmit={handleUrlSubmit} className='flex-1 ms-2px'>
            <input
              type='text'
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              onFocus={(e) => e.target.select()}
              className='toolbar-input'
              placeholder={t('preview.browser.addressPlaceholder')}
            />
          </form>
        </div>
      )}

      {/* Loading indicator (when no nav bar) */}
      {!showNavBar && isLoading && (
        <div className='absolute inset-0 flex items-center justify-center text-t-secondary text-14px z-10 pointer-events-none'>
          <span className='animate-pulse'>{t('preview.loading')}</span>
        </div>
      )}

      {/* Webview content area */}
      <div
        ref={contentRef}
        className='flex-1 overflow-hidden relative'
        style={{ minHeight: 0 }}
        onWheel={handleOuterWheelZoom}
      >
        <webview
          ref={webviewRef as any}
          src={currentUrl}
          className='border-0 absolute start-0 top-0'
          style={{
            opacity: !showNavBar && isLoading ? 0 : 1,
            transition: 'opacity 150ms ease-in',
          }}
          {...webviewAttrs}
        />
      </div>
    </div>
  );
};

export default WebviewHost;
