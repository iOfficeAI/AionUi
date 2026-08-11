/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { BrowserWindow as ElectronBrowserWindow } from 'electron';
import { startLogin } from './WeixinLogin';
import type { LoginHandle } from './WeixinLogin';

/**
 * Manages the WeChat QR-code login flow over Electron IPC.
 * Instantiated once by weixinLoginBridge and reused for all login requests.
 */
export class WeixinLoginHandler {
  private loginHandle: LoginHandle | null = null;

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  private renderQRPage(pageUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hidden = new ElectronBrowserWindow({
        width: 300,
        height: 300,
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      const timeoutId = setTimeout(() => {
        clearInterval(poll);
        hidden.destroy();
        reject(new Error('Timeout waiting for QR canvas to render'));
      }, 10_000);

      const poll = setInterval(() => {
        if (hidden.isDestroyed()) {
          clearInterval(poll);
          return;
        }
        hidden.webContents
          .executeJavaScript(
            `(function(){const c=document.querySelector('canvas');return c?c.toDataURL('image/png'):null})()`
          )
          .then((dataUrl: string | null) => {
            if (dataUrl) {
              clearTimeout(timeoutId);
              clearInterval(poll);
              hidden.destroy();
              resolve(dataUrl);
            }
          })
          .catch(() => {});
      }, 300);

      hidden.webContents.on('did-fail-load', (_e, _code, desc) => {
        clearTimeout(timeoutId);
        clearInterval(poll);
        hidden.destroy();
        reject(new Error(`QR page load failed: ${desc}`));
      });

      void hidden.loadURL(pageUrl);
    });
  }

  startLogin(): Promise<{ accountId: string; botToken: string; baseUrl: string }> {
    this.loginHandle?.abort();

    return new Promise((resolve, reject) => {
      const win = this.getWindow();

      this.loginHandle = startLogin({
        onQR: (pageUrl, _qrcodeData) => {
          this.renderQRPage(pageUrl)
            .then((dataUrl) => win?.webContents.send('weixin:login:qr', { qrcodeUrl: dataUrl }))
            .catch((err) => console.error('[WeixinLoginHandler] Failed to render QR page:', err));
        },
        onScanned: () => {
          win?.webContents.send('weixin:login:scanned');
        },
        onDone: (result) => {
          win?.webContents.send('weixin:login:done', result);
          resolve(result);
        },
        onError: (error) => {
          reject(error);
        },
      });
    });
  }

  abort(): void {
    this.loginHandle?.abort();
    this.loginHandle = null;
  }
}
