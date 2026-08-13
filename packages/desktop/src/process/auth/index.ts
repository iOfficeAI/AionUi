/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserWindow } from 'electron';
import { registerExternalLoginBridge, setExternalLoginMainWindow } from './externalLoginManager';

export { startExternalLogin } from './externalLoginManager';
export type {
  ExternalLoginOutcome,
  ExternalLoginResult,
  ExternalLoginError,
  ExternalLoginErrorCode,
} from './externalLoginManager';

/**
 * Wire the external-login IPC handler. Idempotent — calling more than once
 * has no effect (Electron would log a duplicate-handler warning, so we
 * guard explicitly).
 */
let initialized = false;

export function initExternalLogin(): void {
  if (initialized) return;
  initialized = true;
  registerExternalLoginBridge();
}

/**
 * Track the main BrowserWindow so the external-login IPC handler can
 * forward validated tokens to the renderer via webContents.send.
 */
export function bindExternalLoginMainWindow(window: BrowserWindow): void {
  setExternalLoginMainWindow(window);
}
