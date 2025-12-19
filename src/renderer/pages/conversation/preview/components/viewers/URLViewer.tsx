/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Left, Right, Refresh, Loading } from '@icon-park/react';

interface URLViewerProps {
  /** URL to display */
  url: string;
  /** Optional title for the page */
  title?: string;
}

/**
 * URL 预览组件 - 用于在应用内预览网页
 * URL Preview component - for previewing web pages within the app
 *
 * 使用 webview 标签加载外部 URL，支持：
 * Uses webview tag to load external URLs, supports:
 * - 前进/后退导航（自管理历史栈）/ Forward/back navigation (self-managed history stack)
 * - 刷新页面 / Refresh page
 * - 地址栏编辑 / URL editing
 * - 拦截所有链接点击，在内部导航 / Intercept all link clicks, navigate internally
 */
const URLViewer: React.FC<URLViewerProps> = ({ url }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);

  // 导航状态 / Navigation state
  const [currentUrl, setCurrentUrl] = useState(url);
  const [inputUrl, setInputUrl] = useState(url);
  const [isLoading, setIsLoading] = useState(true);

  // 自管理的历史记录栈 / Self-managed history stacks
  const historyBackRef = useRef<string[]>([]);
  const historyForwardRef = useRef<string[]>([]);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // 当 props.url 变化时重置 / Reset when props.url changes
  useEffect(() => {
    historyBackRef.current = [];
    historyForwardRef.current = [];
    setCanGoBack(false);
    setCanGoForward(false);
    setCurrentUrl(url);
    setInputUrl(url);
  }, [url]);

  // 导航到新 URL（添加到历史）/ Navigate to new URL (add to history)
  const navigateToWithHistory = useCallback(
    (targetUrl: string) => {
      const webviewEl = webviewRef.current;
      if (!webviewEl || !targetUrl) return;

      // 如果 URL 相同，不做处理 / If URL is same, do nothing
      if (targetUrl === currentUrl) return;

      // 将当前 URL 加入后退栈 / Add current URL to back stack
      if (currentUrl) {
        historyBackRef.current.push(currentUrl);
      }
      // 清空前进栈 / Clear forward stack
      historyForwardRef.current = [];

      setCurrentUrl(targetUrl);
      setInputUrl(targetUrl);
      setCanGoBack(historyBackRef.current.length > 0);
      setCanGoForward(false);

      webviewEl.src = targetUrl;
    },
    [currentUrl]
  );

  // 监听 webview 事件 / Listen to webview events
  useEffect(() => {
    const webviewEl = webviewRef.current;
    if (!webviewEl) return;

    const handleStartLoading = () => setIsLoading(true);
    const handleStopLoading = () => setIsLoading(false);

    // 注入脚本拦截所有链接点击 / Inject script to intercept all link clicks
    const injectClickInterceptor = () => {
      webviewEl
        .executeJavaScript(
          `
        (function() {
          // 避免重复注入 / Avoid duplicate injection
          if (window.__urlViewerInjected) return;
          window.__urlViewerInjected = true;

          // 拦截所有点击事件 / Intercept all click events
          document.addEventListener('click', function(e) {
            let target = e.target;
            // 向上查找 a 标签 / Find anchor tag upwards
            while (target && target.tagName !== 'A') {
              target = target.parentElement;
            }
            if (target && target.tagName === 'A') {
              const href = target.href;
              if (href && /^https?:/i.test(href)) {
                e.preventDefault();
                e.stopPropagation();
                // 发送消息到主进程 / Send message to main process
                window.postMessage({ type: '__URL_VIEWER_NAVIGATE__', url: href }, '*');
              }
            }
          }, true);

          // 拦截 window.open / Intercept window.open
          const originalOpen = window.open;
          window.open = function(url) {
            if (url && /^https?:/i.test(url)) {
              window.postMessage({ type: '__URL_VIEWER_NAVIGATE__', url: url }, '*');
              return null;
            }
            return originalOpen.apply(this, arguments);
          };

          // 拦截表单提交 / Intercept form submission
          document.addEventListener('submit', function(e) {
            const form = e.target;
            if (form && form.action && /^https?:/i.test(form.action)) {
              e.preventDefault();
              window.postMessage({ type: '__URL_VIEWER_NAVIGATE__', url: form.action }, '*');
            }
          }, true);
        })();
        true;
      `
        )
        .catch(() => {
          // 忽略注入失败 / Ignore injection failure
        });
    };

    // 监听来自 webview 的消息 / Listen to messages from webview
    const handleIpcMessage = (event: Electron.IpcMessageEvent) => {
      if (event.channel === 'navigate') {
        const url = event.args?.[0];
        if (url && typeof url === 'string') {
          navigateToWithHistory(url);
        }
      }
    };

    // 监听 console-message 来接收导航请求 / Listen to console-message to receive navigation requests
    const handleConsoleMessage = (event: Electron.ConsoleMessageEvent) => {
      // 检查是否是我们的导航消息 / Check if it's our navigation message
      try {
        if (event.message.includes('__URL_VIEWER_NAVIGATE__')) {
          const match = event.message.match(/"url":"([^"]+)"/);
          if (match && match[1]) {
            navigateToWithHistory(match[1]);
          }
        }
      } catch {
        // 忽略解析错误 / Ignore parse errors
      }
    };

    // 使用 did-navigate 来同步实际 URL / Use did-navigate to sync actual URL
    const handleDidNavigate = (event: Event & { url?: string }) => {
      const newUrl = (event as any).url;
      if (newUrl && newUrl !== currentUrl) {
        // 外部导航（如重定向），更新状态但不添加历史 / External navigation (like redirect), update state without adding history
        setCurrentUrl(newUrl);
        setInputUrl(newUrl);
      }
    };

    // DOM 准备好后注入脚本 / Inject script after DOM ready
    const handleDomReady = () => {
      injectClickInterceptor();

      // 注入 viewport meta 标签以改善移动端适配 / Inject viewport meta tag for better mobile adaptation
      webviewEl
        .executeJavaScript(
          `
        (function() {
          // 检查是否已有 viewport meta / Check if viewport meta exists
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

      // 设置 webview 内部的消息监听 / Setup message listener inside webview
      webviewEl
        .executeJavaScript(
          `
        window.addEventListener('message', function(e) {
          if (e.data && e.data.type === '__URL_VIEWER_NAVIGATE__') {
            console.log('__URL_VIEWER_NAVIGATE__', JSON.stringify(e.data));
          }
        });
        true;
      `
        )
        .catch(() => {});
    };

    webviewEl.addEventListener('did-start-loading', handleStartLoading);
    webviewEl.addEventListener('did-stop-loading', handleStopLoading);
    webviewEl.addEventListener('dom-ready', handleDomReady);
    webviewEl.addEventListener('did-navigate', handleDidNavigate as EventListener);
    webviewEl.addEventListener('did-navigate-in-page', handleDidNavigate as EventListener);
    webviewEl.addEventListener('ipc-message', handleIpcMessage as EventListener);
    webviewEl.addEventListener('console-message', handleConsoleMessage as EventListener);

    return () => {
      webviewEl.removeEventListener('did-start-loading', handleStartLoading);
      webviewEl.removeEventListener('did-stop-loading', handleStopLoading);
      webviewEl.removeEventListener('dom-ready', handleDomReady);
      webviewEl.removeEventListener('did-navigate', handleDidNavigate as EventListener);
      webviewEl.removeEventListener('did-navigate-in-page', handleDidNavigate as EventListener);
      webviewEl.removeEventListener('ipc-message', handleIpcMessage as EventListener);
      webviewEl.removeEventListener('console-message', handleConsoleMessage as EventListener);
    };
  }, [navigateToWithHistory, currentUrl]);

  // 监听内容区域尺寸变化 / Monitor content area size changes
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

  // 后退 / Go back
  const handleGoBack = useCallback(() => {
    if (historyBackRef.current.length === 0) return;

    const prevUrl = historyBackRef.current.pop()!;
    // 将当前 URL 加入前进栈 / Add current URL to forward stack
    historyForwardRef.current.push(currentUrl);

    setCanGoBack(historyBackRef.current.length > 0);
    setCanGoForward(true);
    setCurrentUrl(prevUrl);
    setInputUrl(prevUrl);

    if (webviewRef.current) {
      webviewRef.current.src = prevUrl;
    }
  }, [currentUrl]);

  // 前进 / Go forward
  const handleGoForward = useCallback(() => {
    if (historyForwardRef.current.length === 0) return;

    const nextUrl = historyForwardRef.current.pop()!;
    // 将当前 URL 加入后退栈 / Add current URL to back stack
    historyBackRef.current.push(currentUrl);

    setCanGoBack(true);
    setCanGoForward(historyForwardRef.current.length > 0);
    setCurrentUrl(nextUrl);
    setInputUrl(nextUrl);

    if (webviewRef.current) {
      webviewRef.current.src = nextUrl;
    }
  }, [currentUrl]);

  // 刷新 / Refresh
  const handleRefresh = useCallback(() => {
    webviewRef.current?.reload();
  }, []);

  // 地址栏提交 / URL bar submit
  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      let targetUrl = inputUrl.trim();
      if (!targetUrl) return;

      // 自动补全协议 / Auto-complete protocol
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }

      navigateToWithHistory(targetUrl);
    },
    [inputUrl, navigateToWithHistory]
  );

  // 地址栏按键处理 / URL bar key handling
  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setInputUrl(currentUrl);
        (e.target as HTMLInputElement).blur();
      }
    },
    [currentUrl]
  );

  return (
    <div ref={containerRef} className='h-full w-full flex flex-col bg-bg-1'>
      {/* 导航栏 / Navigation bar */}
      <div className='flex items-center gap-4px h-36px px-8px bg-bg-2 border-b border-border-1 flex-shrink-0'>
        {/* 后退按钮 / Back button */}
        <button onClick={handleGoBack} disabled={!canGoBack} className={`flex items-center justify-center w-28px h-28px transition-colors ${canGoBack ? 'hover:bg-bg-3 cursor-pointer text-t-secondary' : 'cursor-not-allowed text-t-quaternary'}`} title={t('common.back', { defaultValue: 'Back' })}>
          <Left theme='outline' size={16} />
        </button>

        {/* 前进按钮 / Forward button */}
        <button onClick={handleGoForward} disabled={!canGoForward} className={`flex items-center justify-center w-28px h-28px transition-colors ${canGoForward ? 'hover:bg-bg-3 cursor-pointer text-t-secondary' : 'cursor-not-allowed text-t-quaternary'}`} title={t('common.forward', { defaultValue: 'Forward' })}>
          <Right theme='outline' size={16} />
        </button>

        {/* 刷新按钮 / Refresh button */}
        <button onClick={handleRefresh} className='flex items-center justify-center w-28px h-28px hover:bg-bg-3 transition-colors cursor-pointer text-t-secondary' title={t('common.refresh', { defaultValue: 'Refresh' })}>
          {isLoading ? <Loading theme='outline' size={16} className='animate-spin' /> : <Refresh theme='outline' size={16} />}
        </button>

        {/* 地址栏 / URL bar */}
        <form onSubmit={handleUrlSubmit} className='flex-1 ml-4px'>
          <input type='text' value={inputUrl} onChange={(e) => setInputUrl(e.target.value)} onKeyDown={handleUrlKeyDown} onFocus={(e) => e.target.select()} className='w-full h-26px pl-4px pr-0 rd-4px bg-bg-3 border border-border-1 text-12px text-t-primary outline-none focus:border-primary transition-colors' placeholder='Enter URL...' />
        </form>
      </div>

      {/* Webview 内容区域 / Webview content area */}
      <div ref={contentRef} className='flex-1 overflow-hidden bg-white relative' style={{ minHeight: 0 }}>
        <webview
          ref={webviewRef as any}
          src={currentUrl}
          className='border-0 absolute left-0 top-0'
          // @ts-expect-error webview attributes not typed
          allowpopups='false'
          webpreferences='contextIsolation=no, nodeIntegration=no, nativeWindowOpen=no'
        />
      </div>
    </div>
  );
};

export default URLViewer;
