/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { TProviderWithModel } from '@/common/config/storage';
import { AionrsAgent } from '@/process/agent/aionrs';
import { resolveAionrsBinary } from './binaryResolver';
import { buildAionrsChildEnv } from './envBuilder';
import { fetchWithOptionalProxy } from './fetchWithProxy';
import type { AionrsCapabilities } from './protocol';

const CHATGPT_PROVIDER_ID = 'chatgpt';
const LEGACY_OPENAI_PROVIDER_ID = 'openai';
const MAX_AUTH_LOG_SIZE = 8192;
const CHATGPT_STATUS_COMMAND = '/status --chatgpt';

type ChatgptStoredAuth = {
  OPENAI_API_KEY?: string | null;
  auth_mode: string;
  last_refresh: string;
  tokens: {
    access_token: string;
    account_id: string;
    id_token: string;
    refresh_token?: string;
  };
};

type ChatgptPrivateAuth = {
  refresh_token: string;
  expires_at: string;
  token_type: string;
};

type AionrsAuthStore = {
  providers: Record<string, unknown>;
};

type PendingChatgptLogin = {
  childProcess: ChildProcess;
  promise: Promise<ChatgptLoginResult>;
};

export type ChatgptAuthStatus = {
  authenticated: boolean;
  authPath: string;
  authPrivatePath: string;
  expiresAt?: string;
  lastRefresh?: string;
  providerId?: string;
  currentModel?: string;
  accountLimits?: AionrsCapabilities['account_limits'];
  statusText?: string;
};

export type ChatgptLoginStartResult = {
  loginId: string;
};

export type ChatgptLoginResult = {
  authenticated: true;
  authPath: string;
  authPrivatePath: string;
  expiresAt?: string;
};

export type ChatgptRemoteModel = {
  id: string;
  name: string;
};

const pendingLogins = new Map<string, PendingChatgptLogin>();

function getAionrsAuthPath(): string {
  return join(app.getPath('appData'), 'aionrs', 'auth.json');
}

function getAionrsPrivateAuthPath(): string {
  return join(app.getPath('appData'), 'aionrs', 'auth-private.json');
}

function getChatgptQuotaProbeModel(model: string): TProviderWithModel {
  return {
    id: 'chatgpt-quota-probe',
    platform: 'chatgpt',
    name: 'ChatGPT',
    baseUrl: 'https://chatgpt.com',
    apiKey: '',
    useModel: model,
  };
}

function createDefaultStore(): AionrsAuthStore {
  return { providers: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isChatgptStoredAuth(value: unknown): value is ChatgptStoredAuth {
  if (!isRecord(value)) return false;
  const tokens = value.tokens;
  return (
    value.auth_mode === 'chatgpt' &&
    typeof value.last_refresh === 'string' &&
    isRecord(tokens) &&
    typeof tokens.access_token === 'string' &&
    typeof tokens.account_id === 'string' &&
    typeof tokens.id_token === 'string'
  );
}

function isChatgptPrivateAuth(value: unknown): value is ChatgptPrivateAuth {
  return (
    isRecord(value) &&
    typeof value.refresh_token === 'string' &&
    typeof value.expires_at === 'string' &&
    typeof value.token_type === 'string'
  );
}

function decodeJwtExp(token: string): string | undefined {
  const [, payload] = token.split('.');
  if (!payload) {
    return undefined;
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { exp?: number };
    if (typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp)) {
      return undefined;
    }
    return new Date(decoded.exp * 1000).toISOString();
  } catch {
    return undefined;
  }
}

function deriveLegacyPrivateAuth(auth: ChatgptStoredAuth): ChatgptPrivateAuth | null {
  const refreshToken = auth.tokens.refresh_token?.trim();
  if (!refreshToken) {
    return null;
  }

  return {
    refresh_token: refreshToken,
    expires_at: decodeJwtExp(auth.tokens.access_token) || auth.last_refresh,
    token_type: 'Bearer',
  };
}

async function loadAuthStore(path: string): Promise<AionrsAuthStore> {
  try {
    const raw = await readFile(path, 'utf-8');
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

async function saveAuthStore(path: string, store: AionrsAuthStore): Promise<void> {
  const providerEntries = Object.entries(store.providers);

  if (providerEntries.length === 0) {
    await rm(path, { force: true });
    return;
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2), 'utf-8');
}

async function ensureChatgptPrivateAuth(): Promise<{
  providerId: string;
  auth: ChatgptPrivateAuth;
} | null> {
  const existing = await findStoredChatgptPrivateAuth();
  if (existing) {
    return existing;
  }

  const stored = await findStoredChatgptAuth();
  if (!stored) {
    return null;
  }

  const derived = deriveLegacyPrivateAuth(stored.auth);
  if (!derived) {
    return null;
  }

  const privateAuthPath = getAionrsPrivateAuthPath();
  const privateStore = await loadAuthStore(privateAuthPath);
  privateStore.providers[stored.providerId] = derived;
  await saveAuthStore(privateAuthPath, privateStore);

  return {
    providerId: stored.providerId,
    auth: derived,
  };
}

async function findStoredChatgptAuth(): Promise<{
  providerId: string;
  auth: ChatgptStoredAuth;
} | null> {
  const store = await loadAuthStore(getAionrsAuthPath());
  for (const providerId of [CHATGPT_PROVIDER_ID, LEGACY_OPENAI_PROVIDER_ID]) {
    const entry = store.providers[providerId];
    if (isChatgptStoredAuth(entry)) {
      return { providerId, auth: entry };
    }
  }
  return null;
}

async function findStoredChatgptPrivateAuth(): Promise<{
  providerId: string;
  auth: ChatgptPrivateAuth;
} | null> {
  const store = await loadAuthStore(getAionrsPrivateAuthPath());
  for (const providerId of [CHATGPT_PROVIDER_ID, LEGACY_OPENAI_PROVIDER_ID]) {
    const entry = store.providers[providerId];
    if (isChatgptPrivateAuth(entry)) {
      return { providerId, auth: entry };
    }
  }
  return null;
}

async function removeStoredChatgptEntries(): Promise<void> {
  const authPath = getAionrsAuthPath();
  const privateAuthPath = getAionrsPrivateAuthPath();

  const publicStore = await loadAuthStore(authPath);
  let publicChanged = false;
  for (const providerId of [CHATGPT_PROVIDER_ID, LEGACY_OPENAI_PROVIDER_ID]) {
    if (isChatgptStoredAuth(publicStore.providers[providerId])) {
      delete publicStore.providers[providerId];
      publicChanged = true;
    }
  }
  if (publicChanged) {
    await saveAuthStore(authPath, publicStore);
  }

  const privateStore = await loadAuthStore(privateAuthPath);
  let privateChanged = false;
  for (const providerId of [CHATGPT_PROVIDER_ID, LEGACY_OPENAI_PROVIDER_ID]) {
    if (isChatgptPrivateAuth(privateStore.providers[providerId])) {
      delete privateStore.providers[providerId];
      privateChanged = true;
    }
  }
  if (privateChanged) {
    await saveAuthStore(privateAuthPath, privateStore);
  }
}

function trimCommandOutput(output: string): string {
  return output.trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' ');
}

function appendOutput(current: string, chunk: Buffer | string): string {
  const next = `${current}${chunk.toString()}`;
  return next.length <= MAX_AUTH_LOG_SIZE ? next : next.slice(-MAX_AUTH_LOG_SIZE);
}

function extractChatgptStatusText(output: string): string | undefined {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const startIndex = lines.findIndex((line) => line === 'Status (ChatGPT)');

  if (startIndex < 0) {
    return undefined;
  }

  const statusLines: string[] = [];
  for (const line of lines.slice(startIndex)) {
    if (line.startsWith('[error]')) {
      break;
    }
    statusLines.push(line);
  }

  return statusLines.length > 0 ? statusLines.join('\n') : undefined;
}

function getAionrsBinary(): string {
  const binaryPath = resolveAionrsBinary();
  if (!binaryPath) {
    throw new Error('aionrs binary not found. Please configure Aion CLI first.');
  }
  return binaryPath;
}

async function runAionrsAuthCommand(args: string[], proxy?: string): Promise<void> {
  const binaryPath = getAionrsBinary();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(binaryPath, args, {
      env: buildAionrsChildEnv({}, { proxy }),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: process.platform === 'win32',
    });

    let output = '';
    const capture = (chunk: Buffer | string) => {
      output = appendOutput(output, chunk);
    };

    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal === 'SIGTERM') {
        reject(new Error('ChatGPT sign-in was cancelled.'));
        return;
      }

      const details = trimCommandOutput(output);
      reject(new Error(details || `aionrs exited with code ${code ?? 'unknown'}.`));
    });
  });
}

async function runAionrsReplCommand(
  args: string[],
  input: string,
  proxy?: string
): Promise<{
  stdout: string;
  stderr: string;
}> {
  const binaryPath = getAionrsBinary();
  const workspace = await mkdtemp(join(app.getPath('temp'), 'aionrs-chatgpt-status-'));

  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(binaryPath, args, {
        cwd: workspace,
        env: buildAionrsChildEnv({}, { proxy }),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: process.platform === 'win32',
      });

      let stdout = '';
      let stderr = '';
      const captureStdout = (chunk: Buffer | string) => {
        stdout = appendOutput(stdout, chunk);
      };
      const captureStderr = (chunk: Buffer | string) => {
        stderr = appendOutput(stderr, chunk);
      };

      child.stdout?.on('data', captureStdout);
      child.stderr?.on('data', captureStderr);
      child.on('error', reject);
      child.on('spawn', () => {
        child.stdin?.write(input);
        child.stdin?.end();
      });
      child.on('exit', (code, signal) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        if (signal === 'SIGTERM') {
          reject(new Error('ChatGPT status probe was cancelled.'));
          return;
        }

        const details = trimCommandOutput(`${stderr}\n${stdout}`);
        reject(new Error(details || `aionrs exited with code ${code ?? 'unknown'}.`));
      });
    });
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

export async function getChatgptAuthStatus(): Promise<ChatgptAuthStatus> {
  const publicAuth = await findStoredChatgptAuth();
  const privateAuth = await ensureChatgptPrivateAuth();

  return {
    authenticated: !!publicAuth,
    authPath: getAionrsAuthPath(),
    authPrivatePath: getAionrsPrivateAuthPath(),
    expiresAt: privateAuth?.auth.expires_at,
    lastRefresh: publicAuth?.auth.last_refresh,
    providerId: publicAuth?.providerId,
  };
}

async function fetchChatgptQuotaStatus(
  model: string,
  proxy?: string
): Promise<{
  currentModel?: string;
  accountLimits?: AionrsCapabilities['account_limits'];
}> {
  const workspace = await mkdtemp(join(app.getPath('temp'), 'aionrs-chatgpt-quota-'));
  const agent = new AionrsAgent({
    workspace,
    model: getChatgptQuotaProbeModel(model),
    proxy,
    maxTurns: 1,
    sessionId: `chatgpt-quota-${randomUUID()}`,
    onStreamEvent: () => {},
  });

  try {
    await agent.start();
    return {
      currentModel: agent.capabilities?.current_model,
      accountLimits: agent.capabilities?.account_limits,
    };
  } finally {
    agent.kill();
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

async function fetchChatgptStatusText(model: string, proxy?: string): Promise<string | undefined> {
  const { stderr } = await runAionrsReplCommand(
    [
      '--provider',
      CHATGPT_PROVIDER_ID,
      '--model',
      model,
      '--no-color',
      '--session-id',
      `chatgpt-status-${randomUUID()}`,
    ],
    `${CHATGPT_STATUS_COMMAND}\n/quit\n`,
    proxy
  );

  return extractChatgptStatusText(stderr);
}

export async function getChatgptQuotaStatus(options: { model: string; proxy?: string }): Promise<ChatgptAuthStatus> {
  const status = await getChatgptAuthStatus();
  const model = options.model.trim();

  if (!status.authenticated || !model) {
    return status;
  }

  let quotaSnapshot:
    | {
        currentModel?: string;
        accountLimits?: AionrsCapabilities['account_limits'];
      }
    | undefined;

  try {
    quotaSnapshot = await fetchChatgptQuotaStatus(model, options.proxy);
    if (quotaSnapshot.accountLimits) {
      return {
        ...status,
        ...quotaSnapshot,
      };
    }
  } catch (error) {
    console.warn('[ChatgptAuth] Failed to fetch ChatGPT account quota from capabilities:', error);
  }

  try {
    const statusText = await fetchChatgptStatusText(quotaSnapshot?.currentModel ?? model, options.proxy);
    return {
      ...status,
      ...quotaSnapshot,
      ...(statusText ? { statusText } : {}),
    };
  } catch (error) {
    console.warn('[ChatgptAuth] Failed to fetch ChatGPT account quota via /status --chatgpt:', error);
    return quotaSnapshot ? { ...status, ...quotaSnapshot } : status;
  }
}

export async function fetchChatgptModels(proxy?: string): Promise<ChatgptRemoteModel[]> {
  await ensureChatgptPrivateAuth();
  const storedAuth = await findStoredChatgptAuth();
  if (!storedAuth) {
    throw new Error('ChatGPT sign-in is required before fetching models.');
  }

  const url = new URL('https://chatgpt.com/backend-api/codex/models');
  url.searchParams.set('client_version', app.getVersion() || '0.0.0');

  const response = await fetchWithOptionalProxy(
    url,
    {
      headers: {
        Authorization: `Bearer ${storedAuth.auth.tokens.access_token}`,
        'ChatGPT-Account-Id': storedAuth.auth.tokens.account_id,
        'User-Agent': `AionUi/${app.getVersion() || '0.0.0'}`,
        originator: 'aionui',
      },
    },
    proxy
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    models?: Array<{
      slug?: string;
      display_name?: string;
      visibility?: string;
      priority?: number;
    }>;
  };

  const models = (data.models ?? [])
    .filter((model) => model.slug)
    .filter((model) => model.visibility !== 'hide')
    .toSorted((left, right) => (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER))
    .map((model) => ({
      id: model.slug!,
      name: model.display_name || model.slug!,
    }));

  if (models.length === 0) {
    throw new Error('No ChatGPT Codex models are available for the current account.');
  }

  return models;
}

export async function startChatgptLogin(proxy?: string): Promise<ChatgptLoginStartResult> {
  const binaryPath = getAionrsBinary();
  const loginId = randomUUID();
  const childProcess = spawn(binaryPath, ['--provider', CHATGPT_PROVIDER_ID, '--login'], {
    env: buildAionrsChildEnv({}, { proxy }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: process.platform === 'win32',
  });

  let output = '';
  const capture = (chunk: Buffer | string) => {
    output = appendOutput(output, chunk);
  };

  childProcess.stdout?.on('data', capture);
  childProcess.stderr?.on('data', capture);

  const promise = new Promise<ChatgptLoginResult>((resolve, reject) => {
    childProcess.on('error', reject);
    childProcess.on('exit', async (code, signal) => {
      if (code === 0) {
        const status = await getChatgptAuthStatus();
        if (status.authenticated) {
          resolve({
            authenticated: true,
            authPath: status.authPath,
            authPrivatePath: status.authPrivatePath,
            expiresAt: status.expiresAt,
          });
          return;
        }

        reject(new Error('ChatGPT sign-in finished, but aionrs credentials were not saved.'));
        return;
      }

      if (signal === 'SIGTERM') {
        reject(new Error('ChatGPT sign-in was cancelled.'));
        return;
      }

      const details = trimCommandOutput(output);
      reject(new Error(details || `ChatGPT sign-in failed (aionrs exited with code ${code ?? 'unknown'}).`));
    });
  }).finally(() => {
    pendingLogins.delete(loginId);
  });

  pendingLogins.set(loginId, { childProcess, promise });
  return { loginId };
}

export async function waitForChatgptLogin(loginId: string): Promise<ChatgptLoginResult> {
  const pending = pendingLogins.get(loginId);
  if (!pending) {
    throw new Error('ChatGPT login session not found or already finished.');
  }
  return pending.promise;
}

export async function logoutChatgpt(proxy?: string): Promise<void> {
  const pendingLogin = [...pendingLogins.values()].at(-1);
  if (pendingLogin) {
    pendingLogin.childProcess.kill();
  }

  try {
    await runAionrsAuthCommand(['--provider', CHATGPT_PROVIDER_ID, '--logout'], proxy);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('No saved credentials')) {
      throw error;
    }
  } finally {
    await removeStoredChatgptEntries();
  }
}
