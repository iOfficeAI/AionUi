/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import path from 'path';
import { ipcBridge } from '@/common';
import { EXTERNAL_LOGIN_TIMEOUT_MS, EXTERNAL_LOGIN_URL } from '@/renderer/api/config';

const POST_TOKEN_CHANNEL = 'external-login:post-token';
const RENDERER_COMPLETED_CHANNEL = 'auth:external-login-completed';

export type ExternalLoginErrorCode = 'urlInvalid' | 'loadFailed' | 'timeout' | 'windowClosed' | 'payloadInvalid';

export interface ExternalLoginResult {
  success: true;
  token: string;
  user: { id: string; username: string };
}

export interface ExternalLoginError {
  success: false;
  code: ExternalLoginErrorCode;
  message: string;
  reason?: string;
  url?: string;
}

export type ExternalLoginOutcome = ExternalLoginResult | ExternalLoginError;

interface ResolvedPayload {
  token: string;
  userId: string;
  username: string;
}

interface ParseResult {
  success: boolean;
  reason?: string;
  value?: ResolvedPayload;
}

function parsePayload(payload: unknown): ParseResult {
  if (!payload || typeof payload !== 'object') {
    return { success: false, reason: 'not-object' };
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.token !== 'string' || !p.token) {
    return { success: false, reason: 'token-missing-or-empty' };
  }
  if (!p.user || typeof p.user !== 'object') {
    return { success: false, reason: 'user-not-object' };
  }
  const u = p.user as Record<string, unknown>;
  if (typeof u.id !== 'string' || !u.id) {
    return { success: false, reason: 'user-id-missing' };
  }
  if (typeof u.username !== 'string' || !u.username) {
    return { success: false, reason: 'user-username-missing' };
  }
  return {
    success: true,
    value: { token: p.token, userId: u.id, username: u.username },
  };
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

const pendingResolve = new Map<number, (result: ExternalLoginOutcome) => void>();

let mainWindowRef: BrowserWindow | null = null;

/**
 * Track the main BrowserWindow so the login IPC handler can forward the
 * validated token to the renderer's AuthContext via webContents.send.
 */
export function setExternalLoginMainWindow(win: BrowserWindow | null): void {
  mainWindowRef = win;
}

let inFlight: Promise<ExternalLoginOutcome> | null = null;

/**
 * Open a hidden BrowserWindow at EXTERNAL_LOGIN_URL and wait for the
 * external page to call window.aionuiAuth.postToken({ token, user }).
 *
 * Returns a Promise that resolves with { success: true, token, user }
 * or rejects with an ExternalLoginError describing the failure.
 *
 * Single-flight: subsequent invocations return the same in-flight Promise.
 */
export function startExternalLogin(): Promise<ExternalLoginOutcome> {
  if (inFlight) return inFlight;

  const outcome = new Promise<ExternalLoginOutcome>((resolve, reject) => {
    if (!isValidUrl(EXTERNAL_LOGIN_URL)) {
      reject({
        success: false,
        code: 'urlInvalid',
        message: `Invalid URL: ${EXTERNAL_LOGIN_URL}`,
      } satisfies ExternalLoginError);
      return;
    }

    // Resolve the preload path. The main bundle lives at:
    //   - dev: `out/main/index.js`           (__dirname === out/main)
    //   - prod (chunked): `out/main/chunks/...` (__dirname === out/main/chunks)
    // In both cases the preload ships at `out/preload/authPreload.js`, so the
    // relative path differs. Try the more-specific (chunked) location first;
    // fall back to the dev layout when that file is absent.
    const fs = require('fs') as typeof import('fs');
    const chunkedPath = path.join(__dirname, '..', '..', 'preload', 'authPreload.js');
    const devPath = path.join(__dirname, '..', 'preload', 'authPreload.js');
    const preloadPath = fs.existsSync(chunkedPath) ? chunkedPath : devPath;

    let win: BrowserWindow;
    try {
      win = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
    } catch (error) {
      reject({
        success: false,
        code: 'urlInvalid',
        message: (error as Error).message,
      } satisfies ExternalLoginError);
      return;
    }

    let settled = false;
    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      pendingResolve.delete(win.webContents.id);
      win.destroy();
      reject({
        success: false,
        code: 'timeout',
        message: 'External login timed out',
      } satisfies ExternalLoginError);
    }, EXTERNAL_LOGIN_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeoutHandle);
      win.removeAllListeners('closed');
      win.webContents.removeAllListeners('did-fail-load');
    };

    win.webContents.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) => {
      console.log('[ExternalLogin] did-start-navigation:', url, 'mainFrame=', isMainFrame);
    });

    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const tag = level === 2 ? 'error' : level === 3 ? 'warn' : 'log';
      console.log(`[ExternalLogin][webContents:${tag}] ${message}`);
    });

    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('[ExternalLogin] render-process-gone:', details);
    });

    win.webContents.on('preload-error', (_event, preloadPath, error) => {
      console.error('[ExternalLogin] preload-error:', preloadPath, error);
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      if (settled) return;
      settled = true;
      cleanup();
      pendingResolve.delete(win.webContents.id);
      win.destroy();
      reject({
        success: false,
        code: 'loadFailed',
        message: `${errorCode} ${errorDescription}`,
        url: validatedURL,
      } satisfies ExternalLoginError);
    });

    win.webContents.session.webRequest.onErrorOccurred((details) => {
      console.log('[ExternalLogin] webRequest error:', details.error, details.url?.slice(0, 120));
    });

    win.webContents.session.webRequest.onCompleted((details) => {
      const url = details.url.slice(0, 120);
      if (details.statusCode >= 400) {
        console.log(`[ExternalLogin] webRequest ${details.statusCode}: ${url}`);
      }
    });

    win.on('closed', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      pendingResolve.delete(win.webContents.id);
      reject({
        success: false,
        code: 'windowClosed',
        message: 'Login window was closed by the user',
      } satisfies ExternalLoginError);
    });

    win.loadURL(EXTERNAL_LOGIN_URL).catch((error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      pendingResolve.delete(win.webContents.id);
      win.destroy();
      reject({
        success: false,
        code: 'loadFailed',
        message: error.message,
        url: EXTERNAL_LOGIN_URL,
      } satisfies ExternalLoginError);
    });

    pendingResolve.set(win.webContents.id, (result: ExternalLoginOutcome) => {
      if (settled) return;
      settled = true;
      cleanup();
      win.destroy();
      resolve(result);
    });
  });

  inFlight = outcome.finally(() => {
    inFlight = null;
  });

  return outcome;
}

/**
 * Register the IPC handler for `external-login:post-token`. This must be
 * called once during app startup.
 *
 * Two registrations happen here:
 *
 * 1. `ipcBridge.auth.startExternalLogin.provider(...)` — handles the renderer's
 *    `invoke()` call from LoginPage and returns an ExternalLoginOutcome. This
 *    is what kicks off the hidden BrowserWindow flow.
 *
 * 2. `ipcMain.handle(POST_TOKEN_CHANNEL, ...)` — receives `postToken` calls
 *    from the preload inside the hidden BrowserWindow, validates the payload,
 *    and resolves the in-flight Promise started by (1).
 *
 * Returns `{ received: true }` to the external page on success, or
 * `{ received: false, code: 'payloadInvalid', reason }` on invalid input.
 * The login window is destroyed and the in-flight Promise resolved with
 * the validated payload on success.
 */
export function registerExternalLoginBridge(): void {
  ipcBridge.auth.startExternalLogin.provider(() => startExternalLogin());

  ipcMain.handle(POST_TOKEN_CHANNEL, async (_event: unknown, payload: unknown) => {
    const parsed = parsePayload(payload);
    if (!parsed.success || !parsed.value) {
      return { received: false, code: 'payloadInvalid', reason: parsed.reason };
    }

    const sender = (_event as { sender: WebContents }).sender;
    const settle = pendingResolve.get(sender.id);
    if (!settle) {
      return { received: false, code: 'payloadInvalid', reason: 'no-pending-window' };
    }

    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send(RENDERER_COMPLETED_CHANNEL, {
        token: parsed.value.token,
        user: { id: parsed.value.userId, username: parsed.value.username },
      });
    }

    settle({
      success: true,
      token: parsed.value.token,
      user: { id: parsed.value.userId, username: parsed.value.username },
    });
    pendingResolve.delete(sender.id);
    return { received: true };
  });
}
