/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Left, Right, Refresh, Loading } from '@icon-park/react';

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
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const autoFitPendingRef = useRef(false);

  // Navigation state
  const [currentUrl, setCurrentUrl] = useState(url);
  const [inputUrl, setInputUrl] = useState(url);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [webviewReady, setWebviewReady] = useState(false);

  // Self-managed history stacks
  const historyBackRef = useRef<string[]>([]);
  const historyForwardRef = useRef<string[]>([]);
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

  // Reset when props.url changes
  useEffect(() => {
    historyBackRef.current = [];
    historyForwardRef.current = [];
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

  // Navigate to new URL (add to history)
  const navigateToWithHistory = useCallback(
    (targetUrl: string) => {
      const webviewEl = webviewRef.current;
      if (!webviewEl || !targetUrl) return;
      if (targetUrl === currentUrl) return;

      if (currentUrl) {
        historyBackRef.current.push(currentUrl);
      }
      historyForwardRef.current = [];

      setCurrentUrl(targetUrl);
      setInputUrl(targetUrl);
      setCanGoBack(historyBackRef.current.length > 0);
      setCanGoForward(false);

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
      const newUrl = (event as any).url;
      if (newUrl && newUrl !== currentUrl) {
        setCurrentUrl(newUrl);
        setInputUrl(newUrl);
      }
    };

    const handleDomReady = () => {
      setWebviewReady(true);
      injectClickInterceptor();

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

    webviewEl.addEventListener('did-start-loading', handleStartLoading);
    webviewEl.addEventListener('did-stop-loading', handleStopLoading);
    webviewEl.addEventListener('dom-ready', handleDomReady);
    webviewEl.addEventListener('did-navigate', handleDidNavigate as EventListener);
    webviewEl.addEventListener('did-navigate-in-page', handleDidNavigate as EventListener);
    webviewEl.addEventListener('console-message', handleConsoleMessage as EventListener);
    webviewEl.addEventListener('did-finish-load', handleDidFinishLoad);
    webviewEl.addEventListener('did-fail-load', handleDidFailLoad as EventListener);

    return () => {
      webviewEl.removeEventListener('did-start-loading', handleStartLoading);
      webviewEl.removeEventListener('did-stop-loading', handleStopLoading);
      webviewEl.removeEventListener('dom-ready', handleDomReady);
      webviewEl.removeEventListener('did-navigate', handleDidNavigate as EventListener);
      webviewEl.removeEventListener('did-navigate-in-page', handleDidNavigate as EventListener);
      webviewEl.removeEventListener('console-message', handleConsoleMessage as EventListener);
      webviewEl.removeEventListener('did-finish-load', handleDidFinishLoad);
      webviewEl.removeEventListener('did-fail-load', handleDidFailLoad as EventListener);
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

  // Back
  const handleGoBack = useCallback(() => {
    if (historyBackRef.current.length === 0) return;
    const prevUrl = historyBackRef.current.pop()!;
    historyForwardRef.current.push(currentUrl);
    setCanGoBack(historyBackRef.current.length > 0);
    setCanGoForward(true);
    setCurrentUrl(prevUrl);
    setInputUrl(prevUrl);
    if (webviewRef.current) webviewRef.current.src = prevUrl;
  }, [currentUrl]);

  // Forward
  const handleGoForward = useCallback(() => {
    if (historyForwardRef.current.length === 0) return;
    const nextUrl = historyForwardRef.current.pop()!;
    historyBackRef.current.push(currentUrl);
    setCanGoBack(true);
    setCanGoForward(historyForwardRef.current.length > 0);
    setCurrentUrl(nextUrl);
    setInputUrl(nextUrl);
    if (webviewRef.current) webviewRef.current.src = nextUrl;
  }, [currentUrl]);

  // Refresh
  const handleRefresh = useCallback(() => {
    webviewRef.current?.reload();
  }, []);

  // URL bar submit
  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      let targetUrl = inputUrl.trim();
      if (!targetUrl) return;
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }
      navigateToWithHistory(targetUrl);
    },
    [inputUrl, navigateToWithHistory]
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
  const webviewAttrs: Record<string, string> = {
    allowpopups: 'false',
    webpreferences: 'contextIsolation=no, nodeIntegration=no, nativeWindowOpen=no',
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
          <button onClick={handleGoBack} disabled={!canGoBack} className='toolbar-btn icon-btn' title='Back'>
            <Left theme='outline' size={16} />
          </button>
          <button onClick={handleGoForward} disabled={!canGoForward} className='toolbar-btn icon-btn' title='Forward'>
            <Right theme='outline' size={16} />
          </button>
          <button onClick={handleRefresh} className='toolbar-btn icon-btn' title='Refresh'>
            {isLoading ? (
              <Loading theme='outline' size={16} className='animate-spin' />
            ) : (
              <Refresh theme='outline' size={16} />
            )}
          </button>
          {isStarOffice && (
            <div className='flex items-center gap-6px ml-2px'>
              <button onClick={handleZoomReset} className='toolbar-btn' title='Reset zoom'>
                100%
              </button>
              <button onClick={handleZoomFit} className='toolbar-btn' title='Fit'>
                Fit
              </button>
              <span className='toolbar-chip'>{Math.round(zoomFactor * 100)}%</span>
            </div>
          )}
          <form onSubmit={handleUrlSubmit} className='flex-1 ml-2px'>
            <input
              type='text'
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              onFocus={(e) => e.target.select()}
              className='toolbar-input'
              placeholder='Enter URL...'
            />
          </form>
        </div>
      )}

      {/* Loading indicator (when no nav bar) */}
      {!showNavBar && isLoading && (
        <div className='absolute inset-0 flex items-center justify-center text-t-secondary text-14px z-10 pointer-events-none'>
          <span className='animate-pulse'>Loading…</span>
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
          className='border-0 absolute left-0 top-0'
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
