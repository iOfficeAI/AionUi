/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { startLogin } from './WeixinLogin';
import type { LoginHandle } from './WeixinLogin';

/**
 * Manages the WeChat QR-code login flow over Electron IPC.
 * Instantiated once by weixinLoginBridge and reused for all login requests.
 */
export class WeixinLoginHandler {
  private loginHandle: LoginHandle | null = null;

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  startLogin(): Promise<{ accountId: string; botToken: string; baseUrl: string }> {
    this.loginHandle?.abort();

    return new Promise((resolve, reject) => {
      const win = this.getWindow();

      this.loginHandle = startLogin({
        onQR: (qrcodeUrl) => {
          win?.webContents.send('weixin:login:qr', { qrcodeUrl });
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
