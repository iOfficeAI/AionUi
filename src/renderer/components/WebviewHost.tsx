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
const WebviewHost: React.FC<WebviewHostProps> = ({ url, id, showNavBar = false, partition, className, style, onDidFinishLoad, onDidFailLoad }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);

  // Navigation state
  const [currentUrl, setCurrentUrl] = useState(url);
  const [inputUrl, setInputUrl] = useState(url);
  const [isLoading, setIsLoading] = useState(true);

  // Self-managed history stacks
  const historyBackRef = useRef<string[]>([]);
  const historyForwardRef = useRef<string[]>([]);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Reset when props.url changes
  useEffect(() => {
    historyBackRef.current = [];
    historyForwardRef.current = [];
    setCanGoBack(false);
    setCanGoForward(false);
    setCurrentUrl(url);
    setInputUrl(url);
    setIsLoading(true);
  }, [url]);

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
  }, [navigateToWithHistory, currentUrl, onDidFinishLoad, onDidFailLoad]);

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
      {/* Navigation bar (optional) */}
      {showNavBar && (
        <div className='flex items-center gap-4px h-36px px-8px bg-bg-2 border-b border-border-1 flex-shrink-0'>
          <button onClick={handleGoBack} disabled={!canGoBack} className={`flex items-center justify-center w-28px h-28px transition-colors ${canGoBack ? 'hover:bg-bg-3 cursor-pointer text-t-secondary' : 'cursor-not-allowed text-t-quaternary'}`} title='Back'>
            <Left theme='outline' size={16} />
          </button>
          <button onClick={handleGoForward} disabled={!canGoForward} className={`flex items-center justify-center w-28px h-28px transition-colors ${canGoForward ? 'hover:bg-bg-3 cursor-pointer text-t-secondary' : 'cursor-not-allowed text-t-quaternary'}`} title='Forward'>
            <Right theme='outline' size={16} />
          </button>
          <button onClick={handleRefresh} className='flex items-center justify-center w-28px h-28px hover:bg-bg-3 transition-colors cursor-pointer text-t-secondary' title='Refresh'>
            {isLoading ? <Loading theme='outline' size={16} className='animate-spin' /> : <Refresh theme='outline' size={16} />}
          </button>
          <form onSubmit={handleUrlSubmit} className='flex-1 ml-4px'>
            <input type='text' value={inputUrl} onChange={(e) => setInputUrl(e.target.value)} onKeyDown={handleUrlKeyDown} onFocus={(e) => e.target.select()} className='w-full h-26px pl-4px pr-0 rd-4px bg-bg-3 border border-border-1 text-12px text-t-primary outline-none focus:border-primary transition-colors' placeholder='Enter URL...' />
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
      <div ref={contentRef} className='flex-1 overflow-hidden relative' style={{ minHeight: 0 }}>
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
