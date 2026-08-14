/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { shell } from 'electron';
import { ipcBridge } from '@/common';
import { EXTERNAL_LOGIN_DEEPLINK_PATH, getExternalLoginUrl } from '@/renderer/api/config';

export interface ExternalLoginLaunchResult {
  success: boolean;
  message?: string;
}

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

function parseDeepLinkParams(params: Record<string, unknown>): ParseResult {
  const token = params.token;
  const userId = params.userId;
  const username = params.username;
  if (typeof token !== 'string' || !token) return { success: false, reason: 'token-missing-or-empty' };
  if (typeof userId !== 'string' || !userId) return { success: false, reason: 'userId-missing' };
  if (typeof username !== 'string' || !username) return { success: false, reason: 'username-missing' };
  return { success: true, value: { token, userId, username } };
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

let inFlight: Promise<ExternalLoginLaunchResult> | null = null;

export function startExternalLogin(): Promise<ExternalLoginLaunchResult> {
  if (inFlight) return inFlight;

  const url = getExternalLoginUrl();

  const outcome = new Promise<ExternalLoginLaunchResult>((resolve) => {
    if (!isValidUrl(url)) {
      resolve({ success: false, message: `Invalid URL: ${url}` });
      return;
    }

    shell
      .openExternal(url)
      .then(() => {
        resolve({ success: true });
      })
      .catch((error: Error) => {
        resolve({ success: false, message: error.message });
      });
  });

  inFlight = outcome.finally(() => {
    inFlight = null;
  });

  return outcome;
}

/**
 * Called by `process/utils/deepLink.ts` when an `aionui://auth/callback`
 * URL arrives. Validates the payload, then emits `externalLoginCompleted`
 * to the renderer. The renderer's LoginPage listener calls
 * AuthContext.completeExternalLogin and navigates to /guid.
 *
 * Returns `{ ok: true }` on success or `{ ok: false, reason }` on a bad
 * payload — the caller (deepLink.ts) can log the reason.
 */
export function handleExternalLoginDeepLink(params: Record<string, string>): { ok: boolean; reason?: string } {
  const parsed = parseDeepLinkParams(params);
  if (!parsed.success || !parsed.value) {
    return { ok: false, reason: parsed.reason };
  }

  ipcBridge.auth.externalLoginCompleted.emit({
    token: parsed.value.token,
    user: { id: parsed.value.userId, username: parsed.value.username },
  });

  return { ok: true };
}

/**
 * Whether the given deep-link action belongs to this module.
 * Imported by `process/utils/deepLink.ts` to route the callback.
 */
export function isExternalLoginAction(action: string): boolean {
  return action === EXTERNAL_LOGIN_DEEPLINK_PATH;
}

/**
 * Register the IPC handler for `auth:start-external-login`. Idempotent —
 * the caller (initExternalLogin) guards against duplicate registration.
 */
export function registerExternalLoginBridge(): void {
  ipcBridge.auth.startExternalLogin.provider(() => startExternalLogin());
}
