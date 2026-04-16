/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fetchWithOptionalProxy } from './fetchWithProxy';

const COPILOT_PROVIDER_ID = 'copilot';
const COPILOT_CLIENT_ID = 'Ov23li8tweQw6odWQebz';
const COPILOT_AUTH_URL = 'https://github.com/login';
const COPILOT_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COPILOT_API_BASE_URL = 'https://api.githubcopilot.com';
const COPILOT_SCOPE = 'read:user';
const COPILOT_AUTH_MODE = 'copilot';
const COPILOT_TOKEN_FALLBACK_SECS = 60 * 60 * 24 * 365 * 10;
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000;
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

type CopilotTokens = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  account_id?: string;
};

type CopilotStoredAuth = {
  type: 'oauth';
  auth_mode?: string;
  last_refresh?: string;
  tokens: CopilotTokens;
  expires_at: string;
  token_type: string;
  metadata?: Record<string, string>;
};

type AionrsAuthStore = {
  providers: Record<string, unknown>;
};

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
};

type TokenErrorResponse = {
  error?: string;
  error_description?: string;
  interval?: number;
};

type PendingCopilotLogin = {
  promise: Promise<CopilotLoginResult>;
};

export type CopilotAuthStatus = {
  authenticated: boolean;
  authPath: string;
  expiresAt?: string;
  lastRefresh?: string;
};

export type CopilotLoginStartResult = {
  loginId: string;
  verificationUri: string;
  userCode: string;
  expiresAt: string;
  intervalSeconds: number;
};

export type CopilotLoginResult = {
  authenticated: true;
  authPath: string;
  expiresAt: string;
};

const pendingLogins = new Map<string, PendingCopilotLogin>();

function getUserAgent(): string {
  const version = typeof app.getVersion === 'function' ? app.getVersion() : 'dev';
  return `AionUi/${version}`;
}

function normalizeCopilotBaseUrl(baseUrl?: string): string {
  return (baseUrl || COPILOT_API_BASE_URL).replace(/\/+$/, '');
}

function getAionrsAuthPath(): string {
  return join(app.getPath('appData'), 'aionrs', 'auth.json');
}

function createDefaultStore(): AionrsAuthStore {
  return { providers: {} };
}

function isCopilotStoredAuth(value: unknown): value is CopilotStoredAuth {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const tokens = record.tokens as Record<string, unknown> | undefined;
  return (
    record.type === 'oauth' &&
    typeof record.expires_at === 'string' &&
    typeof record.token_type === 'string' &&
    !!tokens &&
    typeof tokens.access_token === 'string'
  );
}

async function loadAuthStore(): Promise<AionrsAuthStore> {
  try {
    const authPath = getAionrsAuthPath();
    const raw = await readFile(authPath, 'utf-8');
    if (!raw.trim()) {
      return createDefaultStore();
    }
    const parsed = JSON.parse(raw) as { providers?: Record<string, unknown> };
    return { providers: parsed.providers ?? {} };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return createDefaultStore();
    }
    throw error;
  }
}

async function saveAuthStore(store: AionrsAuthStore): Promise<void> {
  const authPath = getAionrsAuthPath();
  const providerEntries = Object.entries(store.providers);

  if (providerEntries.length === 0) {
    await rm(authPath, { force: true });
    return;
  }

  await mkdir(dirname(authPath), { recursive: true });
  await writeFile(authPath, JSON.stringify(store, null, 2), 'utf-8');
}

function getTokenLifetimeMs(token: TokenResponse): number {
  const seconds = token.expires_in ?? COPILOT_TOKEN_FALLBACK_SECS;
  return seconds * 1000;
}

function buildStoredAuth(token: TokenResponse): CopilotStoredAuth {
  if (!token.access_token) {
    throw new Error('Missing Copilot access token');
  }

  const refreshedAt = new Date();
  const expiresAt = new Date(refreshedAt.getTime() + getTokenLifetimeMs(token));

  return {
    type: 'oauth',
    auth_mode: COPILOT_AUTH_MODE,
    last_refresh: refreshedAt.toISOString(),
    tokens: {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      ...(token.id_token ? { id_token: token.id_token } : {}),
    },
    expires_at: expiresAt.toISOString(),
    token_type: token.token_type || 'Bearer',
    metadata: {},
  };
}

async function saveCopilotAuth(auth: CopilotStoredAuth): Promise<void> {
  const store = await loadAuthStore();
  store.providers[COPILOT_PROVIDER_ID] = auth;
  await saveAuthStore(store);
}

async function getStoredCopilotAuth(): Promise<CopilotStoredAuth | null> {
  const store = await loadAuthStore();
  const auth = store.providers[COPILOT_PROVIDER_ID];
  return isCopilotStoredAuth(auth) ? auth : null;
}

async function removeStoredCopilotAuth(): Promise<void> {
  const store = await loadAuthStore();
  delete store.providers[COPILOT_PROVIDER_ID];
  await saveAuthStore(store);
}

function isExpiredSoon(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now() + TOKEN_REFRESH_MARGIN_MS;
}

async function oauthPost(url: string, payload: Record<string, string>, proxy?: string): Promise<Response> {
  return fetchWithOptionalProxy(
    url,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': getUserAgent(),
        Connection: 'close',
      },
      body: JSON.stringify(payload),
    },
    proxy
  );
}

async function refreshCopilotAuth(refreshToken: string, proxy?: string): Promise<CopilotStoredAuth> {
  const response = await oauthPost(
    COPILOT_TOKEN_URL,
    {
      client_id: COPILOT_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    },
    proxy
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token refresh failed: ${body}`);
  }

  const token = (await response.json()) as TokenResponse;
  const storedAuth = buildStoredAuth(token);
  await saveCopilotAuth(storedAuth);
  return storedAuth;
}

async function pollForCopilotToken(device: DeviceCodeResponse, proxy?: string): Promise<CopilotLoginResult> {
  let pollIntervalSeconds = Math.max(device.interval || 5, 5);
  const deadline = Date.now() + device.expires_in * 1000;

  while (Date.now() <= deadline) {
    await delay(pollIntervalSeconds * 1000 + OAUTH_POLLING_SAFETY_MARGIN_MS);

    let response: Response;
    try {
      response = await oauthPost(
        COPILOT_TOKEN_URL,
        {
          client_id: COPILOT_CLIENT_ID,
          device_code: device.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        },
        proxy
      );
    } catch {
      await delay(2000);
      continue;
    }

    const body = await response.text();
    const errorPayload = JSON.parse(body) as TokenErrorResponse;
    if (errorPayload.error) {
      if (errorPayload.error === 'authorization_pending') {
        continue;
      }
      if (errorPayload.error === 'slow_down') {
        pollIntervalSeconds =
          errorPayload.interval && errorPayload.interval > 0 ? errorPayload.interval : pollIntervalSeconds + 5;
        continue;
      }
      if (errorPayload.error === 'expired_token') {
        throw new Error('GitHub Copilot authorization timed out. Please try again.');
      }
      if (errorPayload.error === 'access_denied') {
        throw new Error('GitHub Copilot authorization was denied.');
      }

      const suffix = errorPayload.error_description ? ` (${errorPayload.error_description})` : '';
      throw new Error(`GitHub Copilot OAuth error: ${errorPayload.error}${suffix}`);
    }

    if (!response.ok) {
      throw new Error(`Unexpected OAuth response: ${body}`);
    }

    const token = JSON.parse(body) as TokenResponse;
    if (!token.access_token) {
      continue;
    }

    const storedAuth = buildStoredAuth(token);
    await saveCopilotAuth(storedAuth);
    return {
      authenticated: true,
      authPath: getAionrsAuthPath(),
      expiresAt: storedAuth.expires_at,
    };
  }

  throw new Error('GitHub Copilot authorization timed out. Please try again.');
}

export async function getCopilotAuthStatus(): Promise<CopilotAuthStatus> {
  const auth = await getStoredCopilotAuth();
  return {
    authenticated: !!auth,
    authPath: getAionrsAuthPath(),
    expiresAt: auth?.expires_at,
    lastRefresh: auth?.last_refresh,
  };
}

export async function startCopilotLogin(proxy?: string): Promise<CopilotLoginStartResult> {
  const response = await oauthPost(
    `${COPILOT_AUTH_URL}/device/code`,
    {
      client_id: COPILOT_CLIENT_ID,
      scope: COPILOT_SCOPE,
    },
    proxy
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to start GitHub Copilot login: ${body}`);
  }

  const device = (await response.json()) as DeviceCodeResponse;
  const loginId = randomUUID();
  const expiresAt = new Date(Date.now() + device.expires_in * 1000).toISOString();
  const promise = pollForCopilotToken(device, proxy).finally(() => {
    pendingLogins.delete(loginId);
  });

  pendingLogins.set(loginId, { promise });

  void shell.openExternal(device.verification_uri).catch((error) => {
    console.warn('[CopilotAuth] Failed to auto-open browser:', error);
  });

  return {
    loginId,
    verificationUri: device.verification_uri,
    userCode: device.user_code,
    expiresAt,
    intervalSeconds: Math.max(device.interval || 5, 5),
  };
}

export async function waitForCopilotLogin(loginId: string): Promise<CopilotLoginResult> {
  const pending = pendingLogins.get(loginId);
  if (!pending) {
    throw new Error('GitHub Copilot login session not found or already finished.');
  }
  return pending.promise;
}

export async function logoutCopilot(): Promise<void> {
  await removeStoredCopilotAuth();
}

export async function getValidCopilotToken(proxy?: string): Promise<string> {
  const auth = await getStoredCopilotAuth();
  if (!auth) {
    throw new Error('GitHub Copilot is not logged in. Please sign in first.');
  }

  if (!isExpiredSoon(auth.expires_at)) {
    return auth.tokens.access_token;
  }

  if (!auth.tokens.refresh_token) {
    throw new Error('GitHub Copilot session expired. Please sign in again.');
  }

  const refreshedAuth = await refreshCopilotAuth(auth.tokens.refresh_token, proxy);
  return refreshedAuth.tokens.access_token;
}

export async function getCopilotAuthHeaders(apiKey?: string, proxy?: string): Promise<Record<string, string>> {
  const token = apiKey?.trim() || (await getValidCopilotToken(proxy));
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'User-Agent': getUserAgent(),
    'Openai-Intent': 'conversation-edits',
    'x-initiator': 'agent',
  };
}

export function getCopilotModelsUrl(baseUrl?: string): string {
  return `${normalizeCopilotBaseUrl(baseUrl)}/models`;
}
