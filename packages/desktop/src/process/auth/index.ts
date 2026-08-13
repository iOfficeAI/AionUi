/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserWindow } from 'electron';
import { registerExternalLoginBridge } from './externalLoginManager';

/**
 * Wire the external-login IPC handler. Idempotent — calling more than once
 * has no effect (Electron would log a duplicate-handler warning, so we
 * guard explicitly).
 */
let initialized = false;

export function initExternalLogin(getMainWindow: () => BrowserWindow | null): void {
  if (initialized) return;
  initialized = true;
  registerExternalLoginBridge(getMainWindow);
}

export { startExternalLogin } from './externalLoginManager';