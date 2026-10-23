import { useCallback, useEffect, useRef, useState } from 'react';

export type UseBrowserOptions = {
  initialUrl?: string;
  onNavigate?: (url: string) => void;
  onTitleChange?: (title: string) => void;
};

export type BrowserCommandResult<T = unknown> = {
  data?: T;
  error?: string;
  scrollX?: number;
  scrollY?: number;
  success: boolean;
  url?: string;
};

export type UseBrowserReturn = {
  canGoBack: boolean;
  canGoForward: boolean;
  click: (selector: string) => Promise<BrowserCommandResult>;
  failError: string | null;
  goBack: () => void;
  goForward: () => void;
  isLoading: boolean;
  navigate: (url: string) => Promise<BrowserCommandResult>;
  reload: () => void;
  screenshot: () => Promise<BrowserCommandResult<string>>;
  scroll: (x?: number, y?: number) => Promise<BrowserCommandResult>;
  stop: () => void;
  title: string;
  type: (selector: string, text: string) => Promise<BrowserCommandResult>;
  url: string;
  webviewRef: React.RefObject<Electron.WebviewTag | null>;
};

function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || /^about:/i.test(trimmed) || /^file:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/** Type guard for navigation events from the webview. */
function isNavEvent(e: unknown): e is { url: string } {
  return typeof e === 'object' && e !== null && 'url' in e && typeof (e as Record<string, unknown>).url === 'string';
}

/** Type guard for page-title-updated events from the webview. */
function isTitleEvent(e: unknown): e is { title: string } {
  return (
    typeof e === 'object' && e !== null && 'title' in e && typeof (e as Record<string, unknown>).title === 'string'
  );
}

/** Type guard for did-fail-load events from the webview. */
function isFailLoadEvent(e: unknown): e is { errorDescription: string; errorCode: number } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'errorCode' in e &&
    typeof (e as Record<string, unknown>).errorCode === 'number'
  );
}

export function useBrowser(options: UseBrowserOptions = {}): UseBrowserReturn {
  const { initialUrl = 'https://www.google.com', onNavigate, onTitleChange } = options;
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const [url, setUrl] = useState<string>(initialUrl);
  const [title, setTitle] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  // Improvement 5: error state for did-fail-load
  const [failError, setFailError] = useState<string | null>(null);

  const updateNavigationState = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    try {
      if (typeof webview.canGoBack === 'function') {
        setCanGoBack(webview.canGoBack());
      }
      if (typeof webview.canGoForward === 'function') {
        setCanGoForward(webview.canGoForward());
      }
      if (typeof webview.getURL === 'function') {
        const currentUrl = webview.getURL();
        if (currentUrl && currentUrl !== 'about:blank') {
          setUrl(currentUrl);
        }
      }
      if (typeof webview.getTitle === 'function') {
        const currentTitle = webview.getTitle();
        if (currentTitle) {
          setTitle(currentTitle);
        }
      }
    } catch (err) {
      console.warn('[useBrowser] updateNavigationState failed:', err);
    }
  }, []);

  const navigate = useCallback(
    async (targetUrl: string): Promise<BrowserCommandResult> => {
      const formatted = normalizeUrl(targetUrl);
      if (!formatted) {
        return { success: false, error: 'Empty URL' };
      }
      // Clear any previous load error on new navigation
      setFailError(null);

      if (window.electronAPI?.browserNavigate) {
        try {
          const res = await window.electronAPI.browserNavigate(formatted);
          if (res?.success) {
            setUrl(res.url || formatted);
            onNavigate?.(res.url || formatted);
            return res;
          }
        } catch (err) {
          console.warn('[useBrowser] navigate IPC failed, falling back to webview:', err);
        }
      }

      const webview = webviewRef.current;
      if (webview && typeof webview.loadURL === 'function') {
        try {
          await webview.loadURL(formatted);
          setUrl(formatted);
          onNavigate?.(formatted);
          return { success: true, url: formatted };
        } catch (err) {
          console.error('[useBrowser] navigate loadURL error:', err);
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      return { success: false, error: 'No browser webview available' };
    },
    [onNavigate]
  );

  const goBack = useCallback(() => {
    const webview = webviewRef.current;
    if (webview && typeof webview.goBack === 'function' && webview.canGoBack?.()) {
      setFailError(null);
      webview.goBack();
    }
  }, []);

  const goForward = useCallback(() => {
    const webview = webviewRef.current;
    if (webview && typeof webview.goForward === 'function' && webview.canGoForward?.()) {
      setFailError(null);
      webview.goForward();
    }
  }, []);

  const reload = useCallback(() => {
    const webview = webviewRef.current;
    if (webview && typeof webview.reload === 'function') {
      setFailError(null);
      webview.reload();
    }
  }, []);

  const stop = useCallback(() => {
    const webview = webviewRef.current;
    if (webview && typeof webview.stop === 'function') {
      webview.stop();
    }
  }, []);

  const click = useCallback(async (selector: string): Promise<BrowserCommandResult> => {
    if (window.electronAPI?.browserClick) {
      try {
        return await window.electronAPI.browserClick(selector);
      } catch (err) {
        console.warn('[useBrowser] click IPC failed, falling back to webview:', err);
      }
    }

    const webview = webviewRef.current;
    if (webview && typeof webview.executeJavaScript === 'function') {
      try {
        const script = `
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return { success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (typeof el.click === 'function') {
              el.click();
            } else {
              el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            }
            return { success: true };
          })()
        `;
        const res = await webview.executeJavaScript(script);
        return (res as BrowserCommandResult) ?? { success: true };
      } catch (err) {
        console.error('[useBrowser] click executeJavaScript error:', err);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { success: false, error: 'Browser not ready' };
  }, []);

  const type = useCallback(async (selector: string, text: string): Promise<BrowserCommandResult> => {
    if (window.electronAPI?.browserType) {
      try {
        return await window.electronAPI.browserType(selector, text);
      } catch (err) {
        console.warn('[useBrowser] type IPC failed, falling back to webview:', err);
      }
    }

    const webview = webviewRef.current;
    if (webview && typeof webview.executeJavaScript === 'function') {
      try {
        const script = `
            (() => {
              const el = document.querySelector(${JSON.stringify(selector)});
              if (!el) return { success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };
              el.focus();
              if ('value' in el) {
                el.value = ${JSON.stringify(text)};
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              } else {
                el.textContent = ${JSON.stringify(text)};
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
              return { success: true };
            })()
          `;
        const res = await webview.executeJavaScript(script);
        return (res as BrowserCommandResult) ?? { success: true };
      } catch (err) {
        console.error('[useBrowser] type executeJavaScript error:', err);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { success: false, error: 'Browser not ready' };
  }, []);

  const scroll = useCallback(async (x: number = 0, y: number = 0): Promise<BrowserCommandResult> => {
    if (window.electronAPI?.browserScroll) {
      try {
        // Improvement 2: pass both x and y (was only passing y — bug fix)
        return await window.electronAPI.browserScroll(x, y);
      } catch (err) {
        console.warn('[useBrowser] scroll IPC failed, falling back to webview:', err);
      }
    }

    const webview = webviewRef.current;
    if (webview && typeof webview.executeJavaScript === 'function') {
      try {
        const script = `
            (() => {
              window.scrollBy(${Number(x) || 0}, ${Number(y) || 0});
              return { success: true, scrollX: window.scrollX, scrollY: window.scrollY };
            })()
          `;
        const res = await webview.executeJavaScript(script);
        return (res as BrowserCommandResult) ?? { success: true };
      } catch (err) {
        console.error('[useBrowser] scroll executeJavaScript error:', err);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { success: false, error: 'Browser not ready' };
  }, []);

  const screenshot = useCallback(async (): Promise<BrowserCommandResult<string>> => {
    if (window.electronAPI?.browserScreenshot) {
      try {
        return await window.electronAPI.browserScreenshot();
      } catch (err) {
        console.warn('[useBrowser] screenshot IPC failed, falling back to webview:', err);
      }
    }

    const webview = webviewRef.current;
    if (webview && typeof webview.capturePage === 'function') {
      try {
        const nativeImage = await webview.capturePage();
        return { success: true, data: nativeImage.toDataURL() };
      } catch (err) {
        console.error('[useBrowser] screenshot capturePage error:', err);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { success: false, error: 'Browser not ready' };
  }, []);

  // Attach/detach webview event listeners
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleStartLoading = () => {
      setIsLoading(true);
      setFailError(null);
    };
    const handleStopLoading = () => {
      setIsLoading(false);
      updateNavigationState();
    };
    const handleNavigate = (e: unknown) => {
      if (isNavEvent(e) && e.url !== 'about:blank') {
        setUrl(e.url);
        onNavigate?.(e.url);
      }
      updateNavigationState();
    };
    const handleTitleUpdated = (e: unknown) => {
      if (isTitleEvent(e) && e.title) {
        setTitle(e.title);
        onTitleChange?.(e.title);
      }
    };
    const handleDomReady = () => {
      updateNavigationState();
    };
    // Improvement 5: capture load failures for in-panel error state
    const handleFailLoad = (e: unknown) => {
      setIsLoading(false);
      if (isFailLoadEvent(e)) {
        // errorCode -3 is ERR_ABORTED (user navigated away) — not a real error
        if (e.errorCode !== -3) {
          const desc = e.errorDescription || 'Page failed to load';
          console.error('[useBrowser] did-fail-load:', e.errorCode, desc);
          setFailError(desc);
        }
      } else {
        setFailError('Page failed to load');
      }
    };

    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-stop-loading', handleStopLoading);
    webview.addEventListener('did-navigate', handleNavigate);
    webview.addEventListener('did-navigate-in-page', handleNavigate);
    webview.addEventListener('page-title-updated', handleTitleUpdated);
    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-fail-load', handleFailLoad);

    return () => {
      webview.removeEventListener('did-start-loading', handleStartLoading);
      webview.removeEventListener('did-stop-loading', handleStopLoading);
      webview.removeEventListener('did-navigate', handleNavigate);
      webview.removeEventListener('did-navigate-in-page', handleNavigate);
      webview.removeEventListener('page-title-updated', handleTitleUpdated);
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-fail-load', handleFailLoad);
    };
  }, [onNavigate, onTitleChange, updateNavigationState]);

  return {
    canGoBack,
    canGoForward,
    click,
    failError,
    goBack,
    goForward,
    isLoading,
    navigate,
    reload,
    screenshot,
    scroll,
    stop,
    title,
    type,
    url,
    webviewRef,
  };
}
