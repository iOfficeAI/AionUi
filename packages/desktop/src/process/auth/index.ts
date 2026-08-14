/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  handleExternalLoginDeepLink,
  isExternalLoginAction,
  registerExternalLoginBridge,
  startExternalLogin,
} from './externalLoginManager';

export { startExternalLogin, handleExternalLoginDeepLink, isExternalLoginAction } from './externalLoginManager';
export type { ExternalLoginLaunchResult } from './externalLoginManager';

/**
 * Wire the external-login IPC handler. Idempotent — calling more than once
 * has no effect.
 */
let initialized = false;

export function initExternalLogin(): void {
  if (initialized) return;
  initialized = true;
  registerExternalLoginBridge();
}
