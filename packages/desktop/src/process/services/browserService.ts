import { ipcMain, webContents } from 'electron';

/**
 * Finds the active in-app browser webview webContents.
 * Returns undefined if none is attached yet.
 */
export function getBrowserWebContents() {
  const all = webContents.getAllWebContents();
  return all.find((wc) => !wc.isDestroyed() && wc.getType() === 'webview');
}

/**
 * Registers browser automation IPC handlers for the main process.
 * Call once from initAllBridges — do NOT auto-invoke on import.
 */
export function registerBrowserService(): void {
  ipcMain.handle('browser:navigate', async (_event, url: string) => {
    try {
      const wc = getBrowserWebContents();
      if (!wc) {
        return { success: false, error: 'Browser webview not found' };
      }
      let targetUrl = (url || '').trim();
      if (!targetUrl) {
        return { success: false, error: 'URL is required' };
      }
      if (!/^https?:\/\//i.test(targetUrl) && !/^about:/i.test(targetUrl) && !/^file:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }
      await wc.loadURL(targetUrl);
      return { success: true, url: wc.getURL() };
    } catch (error) {
      console.error('[browserService] navigate error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:click', async (_event, selector: string) => {
    try {
      const wc = getBrowserWebContents();
      if (!wc) {
        return { success: false, error: 'Browser webview not found' };
      }
      const script = `
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) {
            return { success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };
          }
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (typeof el.click === 'function') {
            el.click();
          } else {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          }
          return { success: true };
        })()
      `;
      const result = await wc.executeJavaScript(script);
      return result;
    } catch (error) {
      console.error('[browserService] click error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:type', async (_event, selector: string, text: string) => {
    try {
      const wc = getBrowserWebContents();
      if (!wc) {
        return { success: false, error: 'Browser webview not found' };
      }
      const script = `
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) {
            return { success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };
          }
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
      const result = await wc.executeJavaScript(script);
      return result;
    } catch (error) {
      console.error('[browserService] type error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:scroll', async (_event, x: number = 0, y: number = 0) => {
    try {
      const wc = getBrowserWebContents();
      if (!wc) {
        return { success: false, error: 'Browser webview not found' };
      }
      const script = `
        (() => {
          window.scrollBy(${Number(x) || 0}, ${Number(y) || 0});
          return { success: true, scrollX: window.scrollX, scrollY: window.scrollY };
        })()
      `;
      const result = await wc.executeJavaScript(script);
      return result;
    } catch (error) {
      console.error('[browserService] scroll error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:screenshot', async () => {
    try {
      const wc = getBrowserWebContents();
      if (!wc) {
        return { success: false, error: 'Browser webview not found' };
      }
      const image = await wc.capturePage();
      const data = image.toDataURL();
      return { success: true, data };
    } catch (error) {
      console.error('[browserService] screenshot error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
