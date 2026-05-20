/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Message } from '@arco-design/web-react';
import { Left, Right, Refresh, Loading, Click, Close, ArrowLeft } from '@icon-park/react';
import { ipcBridge } from '@/common';
import Basket from './Basket';
import { FALLBACK_DEV_URL, fetchProjectDevUrl } from './devUrl';
import { estimatePayloadBytes, formatForChat, mergePicked, nextId, normalizeUrl } from './helpers';
import { buildPickerScript, EXIT_MARKER_NAME, PICK_MARKER_NAME } from './pickerScript';
import { MAX_BASKET_ITEMS, MAX_OUTER_HTML, MAX_PAYLOAD_BYTES, MAX_TEXT, type PickedElement } from './types';

const HOME_URL = FALLBACK_DEV_URL;

const DevBrowser: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromConversationId = searchParams.get('from');
  const initialUrlParam = searchParams.get('url');
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const initialUrl = initialUrlParam && /^https?:\/\//i.test(initialUrlParam) ? initialUrlParam : HOME_URL;
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(true);
  const [webviewReady, setWebviewReady] = useState(false);
  const [picking, setPicking] = useState(false);

  const historyBackRef = useRef<string[]>([]);
  const historyForwardRef = useRef<string[]>([]);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const [items, setItems] = useState<PickedElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const navigateTo = useCallback(
    (target: string) => {
      const webviewEl = webviewRef.current;
      if (!webviewEl || !target || target === currentUrl) return;
      historyBackRef.current.push(currentUrl);
      historyForwardRef.current = [];
      setCanGoBack(true);
      setCanGoForward(false);
      setCurrentUrl(target);
      setInputUrl(target);
      webviewEl.src = target;
    },
    [currentUrl]
  );

  const togglePicking = useCallback(() => {
    setPicking((p) => !p);
  }, []);

  const addPicked = useCallback(
    (payload: Omit<PickedElement, 'id' | 'pickedAt'>) => {
      setItems((prev) => {
        const result = mergePicked(prev, payload, MAX_BASKET_ITEMS, Date.now(), nextId);
        if (result.kind === 'rejected') {
          Message.warning(t('conversation.devBrowser.basketFull', { max: MAX_BASKET_ITEMS }));
          return prev;
        }
        if (result.kind === 'added') {
          setSelectedIds((s) => {
            const next = new Set(s);
            next.add(result.newId);
            return next;
          });
        }
        return result.items;
      });
    },
    [t]
  );

  // On mount with a `from` conversation: detect the workspace's dev server URL
  // (port parsed from package.json) and redirect to it. Falls back to HOME_URL.
  // Skipped when an explicit ?url= was provided (the tool already told us where to go).
  useEffect(() => {
    if (!fromConversationId) return;
    if (initialUrlParam) return;
    let cancelled = false;
    (async () => {
      try {
        const conv = await ipcBridge.conversation.get.invoke({ id: fromConversationId });
        const workspace = (conv?.extra as { workspace?: string } | undefined)?.workspace;
        const detected = await fetchProjectDevUrl(workspace);
        if (cancelled || !detected || detected === currentUrl) return;
        const webviewEl = webviewRef.current;
        setCurrentUrl(detected);
        setInputUrl(detected);
        if (webviewEl) webviewEl.src = detected;
      } catch {
        // Detection is best-effort; ignore failures and stay on the fallback URL.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only react to the source conversation id — we don't want to
    // re-detect on every user navigation inside the webview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromConversationId]);

  // Inject / refresh picker script whenever picking flag flips (and webview ready)
  useEffect(() => {
    const webviewEl = webviewRef.current;
    if (!webviewEl || !webviewReady) return;
    if (picking) {
      webviewEl.executeJavaScript(buildPickerScript(MAX_OUTER_HTML, MAX_TEXT)).catch(() => {});
    } else {
      webviewEl
        .executeJavaScript(`if (window.__devbrowserSetMode) window.__devbrowserSetMode(false); true;`)
        .catch(() => {});
    }
  }, [picking, webviewReady]);

  // Webview event listeners
  useEffect(() => {
    const webviewEl = webviewRef.current;
    if (!webviewEl) return;

    const handleStart = () => setIsLoading(true);
    const handleStop = () => setIsLoading(false);
    const handleDomReady = () => {
      setWebviewReady(true);
    };
    const handleNavigate = (event: Event & { url?: string }) => {
      const newUrl = (event as any).url;
      if (newUrl && newUrl !== currentUrl) {
        setCurrentUrl(newUrl);
        setInputUrl(newUrl);
      }
      // After cross-page navigation, picker installation is lost — re-inject if still active.
      if (picking) {
        webviewEl.executeJavaScript(buildPickerScript(MAX_OUTER_HTML, MAX_TEXT)).catch(() => {});
      }
    };

    const handleConsole = (event: Electron.ConsoleMessageEvent) => {
      const msg = event.message || '';
      if (msg.startsWith(PICK_MARKER_NAME)) {
        try {
          const json = msg.slice(PICK_MARKER_NAME.length);
          const payload = JSON.parse(json);
          addPicked(payload);
        } catch {
          // Ignore parse errors
        }
        return;
      }
      if (msg.startsWith(EXIT_MARKER_NAME)) {
        setPicking(false);
      }
    };

    webviewEl.addEventListener('did-start-loading', handleStart);
    webviewEl.addEventListener('did-stop-loading', handleStop);
    webviewEl.addEventListener('dom-ready', handleDomReady);
    webviewEl.addEventListener('did-navigate', handleNavigate as EventListener);
    webviewEl.addEventListener('did-navigate-in-page', handleNavigate as EventListener);
    webviewEl.addEventListener('console-message', handleConsole as EventListener);

    return () => {
      webviewEl.removeEventListener('did-start-loading', handleStart);
      webviewEl.removeEventListener('did-stop-loading', handleStop);
      webviewEl.removeEventListener('dom-ready', handleDomReady);
      webviewEl.removeEventListener('did-navigate', handleNavigate as EventListener);
      webviewEl.removeEventListener('did-navigate-in-page', handleNavigate as EventListener);
      webviewEl.removeEventListener('console-message', handleConsole as EventListener);
    };
  }, [addPicked, currentUrl, picking]);

  const handleGoBack = useCallback(() => {
    if (historyBackRef.current.length === 0) return;
    const prev = historyBackRef.current.pop()!;
    historyForwardRef.current.push(currentUrl);
    setCanGoBack(historyBackRef.current.length > 0);
    setCanGoForward(true);
    setCurrentUrl(prev);
    setInputUrl(prev);
    if (webviewRef.current) webviewRef.current.src = prev;
  }, [currentUrl]);

  const handleGoForward = useCallback(() => {
    if (historyForwardRef.current.length === 0) return;
    const next = historyForwardRef.current.pop()!;
    historyBackRef.current.push(currentUrl);
    setCanGoBack(true);
    setCanGoForward(historyForwardRef.current.length > 0);
    setCurrentUrl(next);
    setInputUrl(next);
    if (webviewRef.current) webviewRef.current.src = next;
  }, [currentUrl]);

  const handleRefresh = useCallback(() => {
    webviewRef.current?.reload();
  }, []);

  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const target = normalizeUrl(inputUrl);
      if (target) navigateTo(target);
    },
    [inputUrl, navigateTo]
  );

  const handleToggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRemove = useCallback((id: string) => {
    setItems((prev) => prev.filter((e) => e.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleClear = useCallback(() => {
    setItems([]);
    setSelectedIds(new Set());
  }, []);

  const handleHighlight = useCallback((selector: string) => {
    const webviewEl = webviewRef.current;
    if (!webviewEl) return;
    const safe = JSON.stringify(selector);
    webviewEl
      .executeJavaScript(`if (window.__devbrowserHighlight) window.__devbrowserHighlight(${safe}); true;`)
      .catch(() => {});
  }, []);

  const selectedItems = useMemo(() => items.filter((e) => selectedIds.has(e.id)), [items, selectedIds]);
  const byteEstimate = useMemo(() => estimatePayloadBytes(selectedItems), [selectedItems]);

  const handleSend = useCallback(() => {
    if (selectedItems.length === 0) return;
    const text = formatForChat(selectedItems);
    if (fromConversationId) {
      sessionStorage.setItem(`devBrowserAppend:${fromConversationId}`, text);
      void navigate(`/conversation/${fromConversationId}`);
    } else {
      sessionStorage.setItem('devBrowserPrompt', text);
      void navigate('/guid');
    }
  }, [selectedItems, navigate, fromConversationId]);

  const handleBackToChat = useCallback(() => {
    if (!fromConversationId) return;
    void navigate(`/conversation/${fromConversationId}`);
  }, [fromConversationId, navigate]);

  const handleCopy = useCallback(async () => {
    if (selectedItems.length === 0) return;
    const text = formatForChat(selectedItems);
    try {
      await navigator.clipboard.writeText(text);
      Message.success(t('conversation.devBrowser.copiedToClipboard', { count: selectedItems.length }));
    } catch {
      Message.error(t('conversation.devBrowser.copyFailed'));
    }
  }, [selectedItems, t]);

  return (
    <div className='h-full w-full flex bg-bg-1'>
      <div className='flex-1 min-w-0 flex flex-col'>
        {/* Toolbar */}
        <div className='flex items-center gap-6px h-44px px-12px bg-bg-2 border-b border-border-1 flex-shrink-0'>
          {fromConversationId && (
            <button
              type='button'
              onClick={handleBackToChat}
              className='h-28px px-10px rounded-6px border border-border-2 bg-bg-3 text-t-secondary cursor-pointer hover:bg-fill-2 flex items-center gap-4px text-12px'
              title={t('conversation.devBrowser.backToChat')}
            >
              <ArrowLeft theme='outline' size={14} />
              {t('conversation.devBrowser.backToChat')}
            </button>
          )}
          <button
            onClick={handleGoBack}
            disabled={!canGoBack}
            className='w-28px h-28px rounded-6px border border-border-2 bg-bg-3 text-t-secondary cursor-pointer hover:bg-fill-2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center'
            title={t('conversation.devBrowser.back')}
          >
            <Left theme='outline' size={14} />
          </button>
          <button
            onClick={handleGoForward}
            disabled={!canGoForward}
            className='w-28px h-28px rounded-6px border border-border-2 bg-bg-3 text-t-secondary cursor-pointer hover:bg-fill-2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center'
            title={t('conversation.devBrowser.forward')}
          >
            <Right theme='outline' size={14} />
          </button>
          <button
            onClick={handleRefresh}
            className='w-28px h-28px rounded-6px border border-border-2 bg-bg-3 text-t-secondary cursor-pointer hover:bg-fill-2 flex items-center justify-center'
            title={t('conversation.devBrowser.refresh')}
          >
            {isLoading ? (
              <Loading theme='outline' size={14} className='animate-spin' />
            ) : (
              <Refresh theme='outline' size={14} />
            )}
          </button>

          <form onSubmit={handleUrlSubmit} className='flex-1'>
            <input
              type='text'
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onFocus={(e) => e.target.select()}
              className='w-full h-28px px-10px rounded-6px border border-border-2 bg-bg-3 text-12px text-t-primary outline-none focus:border-primary-6'
              placeholder={t('conversation.devBrowser.urlPlaceholder')}
            />
          </form>

          <button
            type='button'
            onClick={togglePicking}
            className={`h-28px px-10px rounded-6px border text-12px cursor-pointer flex items-center gap-4px ${
              picking
                ? 'bg-primary-6 text-white border-primary-6'
                : 'bg-bg-3 text-t-secondary border-border-2 hover:bg-fill-2'
            }`}
            title={t('conversation.devBrowser.pickerHint')}
          >
            {picking ? <Close theme='outline' size={14} /> : <Click theme='outline' size={14} />}
            {picking ? t('conversation.devBrowser.pickerStop') : t('conversation.devBrowser.pickerStart')}
          </button>
        </div>

        {/* Webview */}
        <div className='flex-1 overflow-hidden relative' style={{ minHeight: 0 }}>
          {!webviewReady && isLoading && (
            <div className='absolute inset-0 flex items-center justify-center text-t-secondary text-13px z-10 pointer-events-none'>
              <span className='animate-pulse'>{t('conversation.devBrowser.loading')}</span>
            </div>
          )}
          <webview
            ref={webviewRef as any}
            src={currentUrl}
            className='absolute inset-0 w-full h-full border-0'
            partition='persist:devbrowser'
            // @ts-expect-error webview attributes
            allowpopups='false'
            webpreferences='contextIsolation=no, nodeIntegration=no'
          />
        </div>
      </div>

      <Basket
        items={items}
        selectedIds={selectedIds}
        onToggle={handleToggleSelected}
        onRemove={handleRemove}
        onHighlight={handleHighlight}
        onClear={handleClear}
        onSend={handleSend}
        onCopy={handleCopy}
        byteEstimate={byteEstimate}
        byteLimit={MAX_PAYLOAD_BYTES}
        sendToCurrentChat={Boolean(fromConversationId)}
      />
    </div>
  );
};

export default DevBrowser;
