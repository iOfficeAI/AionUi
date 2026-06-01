/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BackendHttpError, httpRequest, isBackendHttpError } from '@/common/adapter/httpBridge';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import type {
  ManagedRuntimeCliTarget,
  NewApiAccountStatus,
  NewApiDesktopUser,
  NewApiLoginParams,
  NewApiLoginResponse,
  NewApiTokenPayload,
  NewApiUserPayload,
} from '@/common/types/newApiAccount';
import {
  getManagedCliSelectableModels,
  getManagedRuntimeProviderId,
  isManagedRuntimeProviderId,
  MANAGED_RUNTIME_CLI_TARGETS,
  sanitizeManagedRuntimeModelValue,
} from '@/common/types/agent/managedRuntimeCli';
import type { CreateProviderRequest, UpdateProviderRequest } from '@/common/types/provider/providerApi';
import { getProviderAuthType } from '@/common/utils/platformAuthType';
import { AuthType } from '@office-ai/aioncli-core';
import { ProcessConfig, getSystemDir } from '@process/utils/initStorage';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import stripJsonComments from 'strip-json-comments';

const NEW_API_BASE_URL = 'https://api.mxou.cn';
const NEW_API_STORAGE_KEY = 'newApi.desktop.account';
const NEW_API_CLI_MODEL_PREFS_KEY = 'newApi.desktop.cliModelPrefs';
const NEW_API_MANAGED_PROVIDER_ID = 'desktop-newapi-managed-provider';
const NEW_API_PROVIDER_NAME = 'New API';
const NEW_API_PROVIDER_DISPLAY_NAME = 'POUNDING API';
const OPENCODE_SCHEMA_URL = 'https://opencode.ai/config.json';
const HERMES_API_KEY_ENV = 'AIONUI_HERMES_API_KEY';
const OPENCODE_CONFIG_ENV = 'OPENCODE_CONFIG';
const OPENCODE_MANAGED_FALLBACK_DIR_NAME = 'managed-opencode';
const OPENCODE_MANAGED_FALLBACK_FILE_NAME = 'opencode.json';
const CLAUDE_MANAGED_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
] as const;

type BridgeResponse<D = {}> = {
  success: boolean;
  data?: D;
  msg?: string;
};

type NewApiResponse<T> = {
  success?: boolean;
  message?: string;
  msg?: string;
  data?: T;
  token?: string;
  access_token?: string;
  accessToken?: string;
  key?: string;
  value?: string;
  username?: string;
  user_name?: string;
  quota?: number;
  usedQuota?: number;
  used_quota?: number;
};

type FetchResult<T> = {
  data: T;
  cookies: string[];
};

type NewApiRequestOptions = {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  cookies?: string[];
  token?: string;
  userId?: string;
};

type NewApiChannelConnection = {
  _type?: string;
  key?: string;
  url?: string;
};

type ResolvedManagedToken = {
  token: string;
  baseUrl: string;
};

type ManagedCliModelPrefs = Partial<Record<ManagedRuntimeCliTarget, string>>;

type ManagedRuntimeStateResponse = {
  account?: {
    logged_in?: boolean;
    base_url?: string;
    models?: string[];
    updated_at?: number;
    user?: {
      id?: string | number;
      username?: string;
      display_name?: string;
      email?: string;
      quota?: number;
      used_quota?: number;
      avatar_letter?: string;
    };
    managed_provider_id?: string;
  };
  cli_model_prefs?: Record<string, string>;
};

type ManagedRuntimeReconcileInput =
  | string
  | {
      cliTarget?: ManagedRuntimeCliTarget;
      modelId?: string;
    };

type ProviderSyncProfile = {
  provider: TProviderWithModel;
  protocol: 'anthropic' | 'gemini' | 'openai';
  normalizedBaseUrl: string;
  normalizedModelId: string;
  managedProviderId: string;
};

type RecoveredManagedRuntimeSnapshot = {
  token: string;
  baseUrl: string;
  models: string[];
  managedProviderId?: string;
};

type ClaudeProviderEnv = Record<string, string>;

type ClaudeSettings = {
  model?: string;
  env?: Record<string, unknown>;
  hooks?: unknown;
  statusLine?: unknown;
  [key: string]: unknown;
};

type CcSwitchSettings = {
  currentProviderClaude?: string;
  claudeConfigDir?: string | null;
  [key: string]: unknown;
};

type CcSwitchProviderSettingsConfig = {
  env?: Record<string, string>;
  model?: string;
};

type BetterSqliteDatabase = {
  exec(sql: string): void;
  prepare<T = unknown>(
    sql: string
  ): {
    run(params?: Record<string, unknown>): unknown;
    get(...args: unknown[]): T | undefined;
  };
  close(): void;
};

type BetterSqliteConstructor = new (
  database: string,
  options?: { readonly?: boolean; fileMustExist?: boolean }
) => BetterSqliteDatabase;

const require = createRequire(import.meta.url);
let betterSqlite3Ctor: BetterSqliteConstructor | null = null;

function loadBetterSqlite3(): BetterSqliteConstructor | null {
  if (betterSqlite3Ctor) return betterSqlite3Ctor;
  try {
    betterSqlite3Ctor = require('better-sqlite3') as unknown as BetterSqliteConstructor;
  } catch (error) {
    console.warn(
      '[POUNDING] better-sqlite3 unavailable, cc-switch database sync will fall back to settings.json only.',
      error
    );
    betterSqlite3Ctor = null;
  }
  return betterSqlite3Ctor;
}

function openBetterSqliteDb(
  databasePath: string,
  options?: { readonly?: boolean; fileMustExist?: boolean }
): BetterSqliteDatabase | null {
  const BetterSqlite3 = loadBetterSqlite3();
  if (!BetterSqlite3) return null;
  try {
    return new BetterSqlite3(databasePath, options);
  } catch (error) {
    console.warn(
      '[POUNDING] better-sqlite3 database unavailable, cc-switch DB sync will fall back to settings.json only.',
      error
    );
    return null;
  }
}

type OpencodeProviderConfig = {
  $schema?: string;
  model?: string;
  small_model?: string;
  provider?: Record<
    string,
    {
      npm: string;
      name?: string;
      options?: {
        baseURL?: string;
        apiKey?: string;
        headers?: Record<string, string>;
      };
      models?: Record<string, { name: string }>;
    }
  >;
  [key: string]: unknown;
};

const EMPTY_STATUS: NewApiAccountStatus = {
  loggedIn: false,
  baseUrl: NEW_API_BASE_URL,
  models: [],
  updatedAt: 0,
};

function toPersistedAccountStatus(status: NewApiAccountStatus): NewApiAccountStatus {
  return {
    loggedIn: status.loggedIn,
    baseUrl: status.baseUrl,
    models: [...status.models],
    updatedAt: status.updatedAt,
    user: status.user ? { ...status.user } : undefined,
    managedProviderId: status.managedProviderId,
  };
}

function toBackendManagedRuntimeAccount(status: NewApiAccountStatus) {
  return {
    logged_in: status.loggedIn,
    base_url: status.baseUrl,
    models: [...status.models],
    updated_at: status.updatedAt,
    user: status.user
      ? {
          id: status.user.id,
          username: status.user.username,
          display_name: status.user.displayName,
          email: status.user.email,
          quota: status.user.quota,
          used_quota: status.user.usedQuota,
          avatar_letter: status.user.avatarLetter,
        }
      : undefined,
    managed_provider_id: status.managedProviderId,
  };
}

function fromManagedRuntimeAccountStatus(
  account: ManagedRuntimeStateResponse['account']
): NewApiAccountStatus | undefined {
  if (!account) return undefined;
  const username = account.user?.username?.trim();
  const user: NewApiDesktopUser | undefined = username
    ? {
        id: account.user?.id != null ? String(account.user.id) : undefined,
        username,
        displayName: account.user?.display_name?.trim() || undefined,
        email: account.user?.email?.trim() || undefined,
        quota: typeof account.user?.quota === 'number' ? account.user.quota : undefined,
        usedQuota: typeof account.user?.used_quota === 'number' ? account.user.used_quota : undefined,
        avatarLetter: account.user?.avatar_letter?.trim() || undefined,
      }
    : undefined;

  return {
    loggedIn: Boolean(account.logged_in),
    baseUrl: isNonEmptyString(account.base_url) ? account.base_url : NEW_API_BASE_URL,
    models: Array.isArray(account.models) ? account.models.filter(isNonEmptyString) : [],
    updatedAt: typeof account.updated_at === 'number' ? account.updated_at : 0,
    user,
    managedProviderId: isNonEmptyString(account.managed_provider_id) ? account.managed_provider_id : undefined,
  };
}

function mergeAccountStatus(
  persisted: NewApiAccountStatus | undefined,
  local: NewApiAccountStatus | undefined
): NewApiAccountStatus {
  const base = persisted ?? local ?? EMPTY_STATUS;
  return {
    ...base,
    user: base.user ? { ...base.user } : undefined,
    models: [...(base.models ?? [])],
    token: local?.token?.trim() || undefined,
    cookies: local?.cookies ? [...local.cookies] : undefined,
  };
}

function shouldSelfHealManagedRuntimeStatus(status: NewApiAccountStatus): boolean {
  return !status.loggedIn || status.models.length === 0 || !status.managedProviderId;
}

function shouldFallbackToLegacyClientSettings(error: unknown): boolean {
  return isBackendHttpError(error) && [404, 405, 501].includes(error.status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseJsonObject<T extends Record<string, unknown>>(content: string): T | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function normalizeCookies(values: string[] | undefined): string[] {
  if (!values?.length) return [];
  return values.map((value) => value.split(';')[0]?.trim()).filter((value): value is string => Boolean(value));
}

function buildCookieHeader(cookies: string[] | undefined): string | undefined {
  if (!cookies?.length) return undefined;
  return cookies.join('; ');
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function normalizeProviderEnv(env: unknown): ClaudeProviderEnv {
  if (!isRecord(env)) return {};
  return Object.fromEntries(
    Object.entries(env).flatMap(([key, value]) => (isNonEmptyString(value) ? [[key, value]] : []))
  );
}

function extractMessage(data: unknown, fallback: string): string {
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
    if (typeof record.msg === 'string' && record.msg.trim()) return record.msg;
    if (typeof record.error === 'string' && record.error.trim()) return record.error;
  }
  return fallback;
}

function extractToken(payload: unknown): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  if (typeof payload === 'object') {
    const record = payload as NewApiTokenPayload & Record<string, unknown>;
    const token = record.token ?? record.accessToken ?? record.access_token ?? record.key ?? record.value;
    if (typeof token === 'string' && token.trim()) return token.trim();
    if (record.data) return extractToken(record.data);
  }
  return undefined;
}

function extractUserId(payload: unknown): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === 'string' || typeof payload === 'number') {
    const value = String(payload).trim();
    return value || undefined;
  }
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const directUserId = record.id ?? record.userId ?? record.user_id ?? record.uid;
    if (typeof directUserId === 'string' || typeof directUserId === 'number') {
      const value = String(directUserId).trim();
      if (value) return value;
    }
    const nested = record.data ?? record.user ?? record.currentUser;
    if (nested && nested !== payload) return extractUserId(nested);
  }
  return undefined;
}

function normalizeUser(payload: unknown, usernameFallback: string): NewApiDesktopUser {
  const record = (payload && typeof payload === 'object' ? payload : {}) as NewApiUserPayload;
  const username = record.username || record.user_name || record.displayName || record.name || usernameFallback;
  // Use account-level quota from /api/user/self (not API key token — admin can arbitrarily set that)
  const usedQuota = record.usedQuota ?? record.used_quota ?? 0;
  const quota = record.quota ?? 520;
  // Effectively unlimited if quota > 1 trillion or remain_quota is -1 (unlimited flag)
  const unlimitedQuota = record.remain_quota === -1 || record.unlimited_quota === true || quota > 1_000_000_000_000;
  return {
    id: record.id,
    username,
    displayName: record.displayName || record.name || username,
    email: record.email,
    quota,
    usedQuota,
    unlimitedQuota,
    avatarLetter: username.charAt(0).toUpperCase() || 'U',
  };
}

function normalizeModelList(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          const value = record.id ?? record.name ?? record.model_name ?? record.model;
          if (typeof value === 'string') return value.trim();
        }
        return '';
      })
      .filter(Boolean);
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    return normalizeModelList(record.data ?? record.models ?? record.list ?? []);
  }
  return [];
}

function getSetCookieValues(response: Response): string[] {
  const anyResponse = response as Response & {
    headers: Headers & {
      getSetCookie?: () => string[];
      raw?: () => Record<string, string[]>;
    };
  };
  const getSetCookie = anyResponse.headers.getSetCookie?.();
  if (Array.isArray(getSetCookie) && getSetCookie.length > 0) return getSetCookie;
  const rawSetCookie = anyResponse.headers.raw?.()['set-cookie'];
  if (Array.isArray(rawSetCookie) && rawSetCookie.length > 0) return rawSetCookie;
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

function extractFirstTokenEntry(payload: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(payload)) {
    return payload.find((item) => item && typeof item === 'object' && extractToken(item)) as
      | Record<string, unknown>
      | undefined;
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    return extractFirstTokenEntry(record.data ?? record.items ?? record.list ?? []);
  }
  return undefined;
}

function extractChannelConnection(payload: unknown): NewApiChannelConnection | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  const type = record._type;
  const key = record.key;
  const url = record.url;
  if (type === 'newapi_channel_conn' && typeof key === 'string' && key.trim()) {
    return {
      _type: type,
      key: key.trim(),
      url: typeof url === 'string' && url.trim() ? url.trim() : undefined,
    };
  }
  return undefined;
}

async function fetchFullTokenKey(
  tokenId: string | number,
  cookies: string[],
  loginToken: string | undefined,
  userId: string
): Promise<string | undefined> {
  const tokenKeyResult = await fetchJson<NewApiResponse<{ key?: string }>>(`/api/token/${tokenId}/key`, {
    method: 'POST',
    cookies,
    token: loginToken,
    userId,
  });
  return extractToken(tokenKeyResult.data?.data) ?? extractToken(tokenKeyResult.data);
}

async function resolveManagedToken(
  cookies: string[],
  loginToken: string | undefined,
  userId: string
): Promise<ResolvedManagedToken> {
  const tokenListResult = await fetchJson<NewApiResponse<unknown>>('/api/token/', {
    cookies,
    token: loginToken,
    userId,
  });
  const existingTokenEntry = extractFirstTokenEntry(tokenListResult.data);
  const existingChannelConnection = extractChannelConnection(existingTokenEntry);
  const existingTokenId =
    existingTokenEntry && (typeof existingTokenEntry.id === 'string' || typeof existingTokenEntry.id === 'number')
      ? existingTokenEntry.id
      : undefined;
  const existingToken =
    (existingTokenId ? await fetchFullTokenKey(existingTokenId, cookies, loginToken, userId) : undefined) ??
    extractToken(existingChannelConnection);

  if (existingToken) {
    return {
      token: existingToken,
      baseUrl: normalizeBaseUrl(existingChannelConnection?.url || NEW_API_BASE_URL),
    };
  }

  const tokenResult = await fetchJson<NewApiResponse<unknown>>('/api/token/', {
    method: 'POST',
    cookies,
    token: loginToken,
    userId,
    body: { name: 'POUNDING Desktop', unlimited_quota: true },
  });
  const generatedChannelConnection = extractChannelConnection(tokenResult.data);
  const generatedToken =
    extractToken(generatedChannelConnection) ?? extractToken(tokenResult.data) ?? extractToken(tokenResult.data?.data);

  if (!generatedToken) {
    throw new Error('Failed to get access token from NewAPI');
  }

  return {
    token: generatedToken,
    baseUrl: normalizeBaseUrl(generatedChannelConnection?.url || NEW_API_BASE_URL),
  };
}

async function fetchJson<T>(requestPath: string, options: NewApiRequestOptions = {}): Promise<FetchResult<T>> {
  const headers: Record<string, string> = {};
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  const cookieHeader = buildCookieHeader(options.cookies);
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.userId?.trim()) {
    headers['New-Api-User'] = options.userId.trim();
  }

  const response = await fetch(`${normalizeBaseUrl(NEW_API_BASE_URL)}${requestPath}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const cookies = normalizeCookies(getSetCookieValues(response));

  if (response.status === 429) {
    console.warn('[POUNDING] fetchJson: rate limited by NewAPI, request:', requestPath);
    throw new Error('Rate limited by NewAPI — too many requests. Please wait and try again.');
  }

  let content: T;
  try {
    content = (await response.json()) as T;
  } catch (jsonError) {
    const text = await response.text().catch(() => '<unreadable>');
    console.error('[POUNDING] fetchJson: failed to parse JSON response', {
      url: requestPath,
      status: response.status,
      contentType: response.headers.get('content-type'),
      bodyPreview: text.slice(0, 500),
      error: jsonError instanceof Error ? jsonError.message : String(jsonError),
    });
    content = {} as T;
  }
  if (!response.ok) {
    throw new Error(extractMessage(content, `Request failed with status ${response.status}`));
  }

  return { data: content, cookies };
}

function detectNewApiProtocol(modelName: string): string {
  const name = modelName.toLowerCase();
  if (name.startsWith('claude') || name.startsWith('anthropic')) return 'anthropic';
  if (name.startsWith('gemini') || name.startsWith('models/gemini')) return 'gemini';
  return 'openai';
}

function buildProviderWithModel(provider: IProvider, modelId?: string): TProviderWithModel | null {
  const requestedModel = sanitizeManagedRuntimeModelValue(modelId);
  const resolvedModel =
    requestedModel && provider.models?.includes(requestedModel) ? requestedModel : provider.models?.[0];
  if (!resolvedModel) return null;
  return {
    ...provider,
    models: provider.models,
    use_model: resolvedModel,
  } as TProviderWithModel;
}

function normalizeManagedRuntimeModels(models: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      models.map((model) => sanitizeManagedRuntimeModelValue(model)).filter((model): model is string => Boolean(model))
    )
  );
}

function mergeManagedRuntimeModelSets(
  preferredModels: Array<string | null | undefined>,
  fallbackModels: Array<string | null | undefined>
): string[] {
  return normalizeManagedRuntimeModels([...preferredModels, ...fallbackModels]);
}

function resolveSyncProtocol(provider: TProviderWithModel): 'anthropic' | 'gemini' | 'openai' | null {
  const authType = getProviderAuthType(provider);
  if (authType === AuthType.USE_ANTHROPIC) return 'anthropic';
  if (authType === AuthType.USE_GEMINI || authType === AuthType.LOGIN_WITH_GOOGLE) return 'gemini';
  if (authType === AuthType.USE_OPENAI) return 'openai';
  return null;
}

function buildProviderSyncProfile(provider: TProviderWithModel): ProviderSyncProfile | null {
  const normalizedBaseUrl = normalizeBaseUrl(provider.base_url);
  const normalizedModelId = provider.use_model?.trim();
  const protocol = resolveSyncProtocol(provider);
  if (!protocol || !normalizedBaseUrl || !normalizedModelId) return null;
  const runtimeProviderName =
    provider.id === NEW_API_MANAGED_PROVIDER_ID
      ? NEW_API_PROVIDER_NAME
      : provider.name || provider.platform || 'provider';
  return {
    provider,
    protocol,
    normalizedBaseUrl,
    normalizedModelId,
    managedProviderId: getManagedRuntimeProviderId(runtimeProviderName, provider.id || 'default'),
  };
}

function buildClaudeRuntimeProviderEnv(profile: ProviderSyncProfile): ClaudeProviderEnv {
  return {
    ANTHROPIC_BASE_URL: profile.normalizedBaseUrl,
    ANTHROPIC_DEFAULT_SONNET_MODEL: profile.normalizedModelId,
    ANTHROPIC_AUTH_TOKEN: profile.provider.api_key,
    ANTHROPIC_API_KEY: profile.provider.api_key,
  };
}

function resolveHermesApiMode(profile: ProviderSyncProfile): 'anthropic_messages' | 'chat_completions' {
  return profile.protocol === 'anthropic' ? 'anthropic_messages' : 'chat_completions';
}

function resolveOpencodeNpmPackage(
  profile: ProviderSyncProfile
): '@ai-sdk/openai-compatible' | '@ai-sdk/anthropic' | '@ai-sdk/google' {
  if (profile.protocol === 'anthropic') return '@ai-sdk/anthropic';
  if (profile.protocol === 'gemini') return '@ai-sdk/google';
  return '@ai-sdk/openai-compatible';
}

function resolveOpencodeBaseUrl(profile: ProviderSyncProfile): string {
  if (resolveOpencodeNpmPackage(profile) !== '@ai-sdk/openai-compatible') return profile.normalizedBaseUrl;
  const rootUrl = profile.normalizedBaseUrl.replace(/\/v1$/, '').replace(/\/v1beta$/, '');
  return `${rootUrl}/v1`;
}

function resolveOpenClawApiProtocol(profile: ProviderSyncProfile): string {
  if (profile.protocol === 'anthropic') return 'anthropic-messages';
  if (profile.protocol === 'gemini') return 'google-generative-ai';
  if (profile.protocol === 'openai') return 'openai-completions';
  return 'openai-completions';
}

function resolveOpenClawBaseUrl(profile: ProviderSyncProfile): string {
  if (profile.protocol !== 'openai') return profile.normalizedBaseUrl;
  const rootUrl = profile.normalizedBaseUrl.replace(/\/v1$/, '').replace(/\/v1beta$/, '');
  return `${rootUrl}/v1`;
}

function readJsonObjectFile<T extends Record<string, unknown>>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return parseJsonObject<T>(fs.readFileSync(filePath, 'utf-8'));
}

function getCcSwitchBasePaths(homeDir = os.homedir()) {
  const baseDir = path.join(homeDir, '.cc-switch');
  return {
    settingsPath: path.join(baseDir, 'settings.json'),
    databasePath: path.join(baseDir, 'cc-switch.db'),
  };
}

function readCcSwitchSettings(homeDir = os.homedir()): CcSwitchSettings {
  const { settingsPath } = getCcSwitchBasePaths(homeDir);
  return readJsonObjectFile<CcSwitchSettings>(settingsPath) ?? {};
}

function writeCcSwitchSettings(settings: CcSwitchSettings, homeDir = os.homedir()): void {
  const { settingsPath } = getCcSwitchBasePaths(homeDir);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

function resolveCcSwitchClaudeConfigDir(homeDir = os.homedir()): string {
  const settings = readCcSwitchSettings(homeDir);
  const override = typeof settings.claudeConfigDir === 'string' ? settings.claudeConfigDir.trim() : '';
  if (!override) return path.join(homeDir, '.claude');
  return path.isAbsolute(override) ? override : path.resolve(homeDir, override);
}

function ensureCcSwitchDatabase(profile: ProviderSyncProfile, homeDir = os.homedir()): void {
  const { databasePath } = getCcSwitchPaths(homeDir);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = openBetterSqliteDb(databasePath);
  if (!db) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT NOT NULL,
        app_type TEXT NOT NULL,
        name TEXT NOT NULL,
        settings_config TEXT NOT NULL,
        PRIMARY KEY (id, app_type)
      );
    `);

    const settingsConfig: CcSwitchProviderSettingsConfig = {
      env: buildClaudeRuntimeProviderEnv(profile),
      model: 'default',
    };

    db.prepare(
      `INSERT INTO providers (id, app_type, name, settings_config)
       VALUES (@id, 'claude', @name, @settingsConfig)
       ON CONFLICT(id, app_type) DO UPDATE SET
        name = excluded.name,
        settings_config = excluded.settings_config`
    ).run({
      id: profile.managedProviderId,
      name: profile.provider.name || profile.managedProviderId,
      settingsConfig: JSON.stringify(settingsConfig),
    });
  } finally {
    db.close();
  }
}

function removeManagedCcSwitchProvider(managedProviderId: string, homeDir = os.homedir()): void {
  const { databasePath } = getCcSwitchPaths(homeDir);
  if (!fs.existsSync(databasePath)) return;
  const db = openBetterSqliteDb(databasePath);
  if (!db) return;
  try {
    db.prepare(`DELETE FROM providers WHERE id = @id AND app_type = 'claude'`).run({ id: managedProviderId });
  } finally {
    db.close();
  }
}

function recoverManagedRuntimeSnapshotFromCcSwitch(
  homeDir = os.homedir()
): RecoveredManagedRuntimeSnapshot | undefined {
  const { databasePath } = getCcSwitchPaths(homeDir);
  const settings = readCcSwitchSettings(homeDir);
  const providerId = settings.currentProviderClaude?.trim();
  if (!providerId || !isManagedRuntimeProviderId(providerId) || !fs.existsSync(databasePath)) return undefined;

  const db = openBetterSqliteDb(databasePath, { readonly: true, fileMustExist: true });
  if (!db) return undefined;
  try {
    const row = db
      .prepare(`SELECT settings_config FROM providers WHERE id = ? AND app_type = 'claude' LIMIT 1`)
      .get(providerId) as { settings_config?: string } | undefined;
    const settingsConfig =
      typeof row?.settings_config === 'string' ? parseJsonObject<Record<string, unknown>>(row.settings_config) : null;
    const env = normalizeProviderEnv(settingsConfig?.env);
    const token = env.ANTHROPIC_AUTH_TOKEN?.trim() || env.ANTHROPIC_API_KEY?.trim();
    const models = normalizeManagedRuntimeModels([
      env.ANTHROPIC_MODEL,
      env.ANTHROPIC_DEFAULT_SONNET_MODEL,
      env.ANTHROPIC_DEFAULT_OPUS_MODEL,
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
    ]);
    if (!token || models.length === 0) return undefined;
    return {
      token,
      baseUrl: normalizeBaseUrl(env.ANTHROPIC_BASE_URL || NEW_API_BASE_URL),
      models,
      managedProviderId: providerId,
    };
  } finally {
    db.close();
  }
}

function getCcSwitchPaths(homeDir = os.homedir()) {
  const { settingsPath, databasePath } = getCcSwitchBasePaths(homeDir);
  return {
    settingsPath,
    databasePath,
    claudeSettingsPath: path.join(resolveCcSwitchClaudeConfigDir(homeDir), 'settings.json'),
  };
}

function writeClaudeSettingsForProviderSync(provider: TProviderWithModel): void {
  const profile = buildProviderSyncProfile(provider);
  if (!profile) return;
  const { claudeSettingsPath } = getCcSwitchPaths();
  ensureCcSwitchDatabase(profile);
  const ccSwitchSettings = readCcSwitchSettings();
  writeCcSwitchSettings({
    ...ccSwitchSettings,
    currentProviderClaude: profile.managedProviderId,
  });
  const currentSettings = fs.existsSync(claudeSettingsPath)
    ? (parseJsonObject<ClaudeSettings>(fs.readFileSync(claudeSettingsPath, 'utf-8')) ?? {})
    : {};
  const nextEnv = { ...normalizeProviderEnv(currentSettings.env) };
  for (const key of CLAUDE_MANAGED_ENV_KEYS) {
    delete nextEnv[key];
  }
  const nextSettings: ClaudeSettings = {
    ...currentSettings,
    model: 'default',
    env: {
      ...nextEnv,
      ...buildClaudeRuntimeProviderEnv(profile),
    },
  };
  fs.mkdirSync(path.dirname(claudeSettingsPath), { recursive: true });
  fs.writeFileSync(claudeSettingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

function clearClaudeSettingsForProviderSync(): void {
  const { claudeSettingsPath } = getCcSwitchPaths();
  const managedProviderId = getManagedRuntimeProviderId(NEW_API_PROVIDER_NAME, NEW_API_MANAGED_PROVIDER_ID);
  const ccSwitchSettings = readCcSwitchSettings();
  if (ccSwitchSettings.currentProviderClaude === managedProviderId) {
    const nextCcSwitchSettings: CcSwitchSettings = { ...ccSwitchSettings, currentProviderClaude: undefined };
    if (Object.entries(nextCcSwitchSettings).some(([, value]) => value !== undefined)) {
      writeCcSwitchSettings(nextCcSwitchSettings);
    } else {
      const { settingsPath } = getCcSwitchPaths();
      fs.rmSync(settingsPath, { force: true });
    }
  }
  removeManagedCcSwitchProvider(managedProviderId);
  if (!fs.existsSync(claudeSettingsPath)) return;
  const currentSettings = parseJsonObject<ClaudeSettings>(fs.readFileSync(claudeSettingsPath, 'utf-8'));
  if (!currentSettings) return;
  const nextEnv = { ...normalizeProviderEnv(currentSettings.env) };
  for (const key of CLAUDE_MANAGED_ENV_KEYS) {
    delete nextEnv[key];
  }
  const nextSettings: ClaudeSettings = {
    ...currentSettings,
    ...(Object.keys(nextEnv).length > 0 ? { env: nextEnv } : { env: undefined }),
    model: currentSettings.model === 'default' ? undefined : currentSettings.model,
  };
  if (nextSettings.env === undefined && nextSettings.model === undefined) {
    fs.rmSync(claudeSettingsPath, { force: true });
    return;
  }
  fs.writeFileSync(claudeSettingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

function recoverApiKeyFromClaudeSettings(): string | undefined {
  const { claudeSettingsPath } = getCcSwitchPaths();
  const currentSettings = readJsonObjectFile<ClaudeSettings>(claudeSettingsPath);
  if (!currentSettings) return undefined;
  const env = normalizeProviderEnv(currentSettings.env);
  const token = env.ANTHROPIC_AUTH_TOKEN?.trim() || env.ANTHROPIC_API_KEY?.trim();
  return token || undefined;
}

function recoverManagedRuntimeSnapshotFromClaudeSettings(): RecoveredManagedRuntimeSnapshot | undefined {
  const ccSwitchSnapshot = recoverManagedRuntimeSnapshotFromCcSwitch();
  if (ccSwitchSnapshot) return ccSwitchSnapshot;
  const { claudeSettingsPath } = getCcSwitchPaths();
  const currentSettings = readJsonObjectFile<ClaudeSettings>(claudeSettingsPath);
  if (!currentSettings) return undefined;
  const env = normalizeProviderEnv(currentSettings.env);
  const token = env.ANTHROPIC_AUTH_TOKEN?.trim() || env.ANTHROPIC_API_KEY?.trim();
  const models = normalizeManagedRuntimeModels([
    env.ANTHROPIC_MODEL,
    env.ANTHROPIC_DEFAULT_SONNET_MODEL,
    env.ANTHROPIC_DEFAULT_OPUS_MODEL,
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
  ]);
  if (!token || models.length === 0) return undefined;
  return {
    token,
    baseUrl: normalizeBaseUrl(env.ANTHROPIC_BASE_URL || NEW_API_BASE_URL),
    models,
  };
}

function resolveHermesDir(): string {
  const override = process.env.HERMES_CONFIG_DIR?.trim();
  return override ? path.resolve(override) : path.join(os.homedir(), '.hermes');
}

function resolveHermesConfigPath(): string {
  const override = process.env.HERMES_CONFIG_PATH?.trim();
  return override ? path.resolve(override) : path.join(resolveHermesDir(), 'config.yaml');
}

function resolveHermesEnvPath(): string {
  const override = process.env.HERMES_ENV_PATH?.trim();
  return override ? path.resolve(override) : path.join(resolveHermesDir(), '.env');
}

function normalizeTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function writeHermesEnvFile(apiKey: string): void {
  const envPath = resolveHermesEnvPath();
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const nextLines = current
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(`${HERMES_API_KEY_ENV}=`) && line.trim() !== '');
  nextLines.push(`${HERMES_API_KEY_ENV}=${apiKey}`);
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, normalizeTrailingNewline(nextLines.join('\n')), { encoding: 'utf8', mode: 0o600 });
}

function renderHermesManagedConfig(profile: ProviderSyncProfile): string {
  const hermesBaseUrl = profile.protocol === 'openai' ? resolveOpenClawBaseUrl(profile) : profile.normalizedBaseUrl;
  return normalizeTrailingNewline(
    [
      'custom_providers:',
      `  - name: ${JSON.stringify(profile.managedProviderId)}`,
      `    base_url: ${JSON.stringify(hermesBaseUrl)}`,
      `    key_env: ${JSON.stringify(HERMES_API_KEY_ENV)}`,
      `    api_mode: ${JSON.stringify(resolveHermesApiMode(profile))}`,
      `    model: ${JSON.stringify(profile.normalizedModelId)}`,
      '    models:',
      `      ${JSON.stringify(profile.normalizedModelId)}: {}`,
      'model:',
      `  default: ${JSON.stringify(profile.normalizedModelId)}`,
      '  provider: custom',
      `  base_url: ${JSON.stringify(hermesBaseUrl)}`,
      `  api_key: ${JSON.stringify(`\${${HERMES_API_KEY_ENV}}`)}`,
      `  api_mode: ${JSON.stringify(resolveHermesApiMode(profile))}`,
      'agent:',
      '  reasoning_effort: none',
    ].join('\n')
  );
}

async function writeHermesConfigForProviderSync(provider: TProviderWithModel): Promise<void> {
  const profile = buildProviderSyncProfile(provider);
  if (!profile) return;
  const configPath = resolveHermesConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, renderHermesManagedConfig(profile), { encoding: 'utf8', mode: 0o600 });
  writeHermesEnvFile(profile.provider.api_key);
}

function clearHermesConfigForProviderSync(): void {
  const configPath = resolveHermesConfigPath();
  if (fs.existsSync(configPath)) {
    fs.rmSync(configPath, { force: true });
  }

  const envPath = resolveHermesEnvPath();
  if (fs.existsSync(envPath)) {
    const nextLines = fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith(`${HERMES_API_KEY_ENV}=`) && line.trim() !== '');
    if (nextLines.length === 0) {
      fs.rmSync(envPath, { force: true });
    } else {
      fs.writeFileSync(envPath, normalizeTrailingNewline(nextLines.join('\n')), { encoding: 'utf8', mode: 0o600 });
    }
  }
}

function recoverApiKeyFromHermesEnv(): string | undefined {
  const envPath = resolveHermesEnvPath();
  if (!fs.existsSync(envPath)) return undefined;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(new RegExp(`^${HERMES_API_KEY_ENV}=(.+)$`));
    if (!match) continue;
    const rawValue = match[1]?.trim();
    if (!rawValue) continue;
    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
      return rawValue.slice(1, -1);
    }
    return rawValue;
  }
  return undefined;
}

function resolveManagedOpencodeFallbackPath(): string {
  return path.join(getSystemDir().workDir, OPENCODE_MANAGED_FALLBACK_DIR_NAME, OPENCODE_MANAGED_FALLBACK_FILE_NAME);
}

function resolveManagedOpencodeConfigPath(): string {
  return resolveManagedOpencodeFallbackPath();
}

function canWriteToPath(targetPath: string): boolean {
  try {
    const dirPath = path.dirname(targetPath);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
    if (fs.existsSync(targetPath)) {
      fs.accessSync(targetPath, fs.constants.W_OK);
    }
    return true;
  } catch {
    return false;
  }
}

function resolveOpencodeConfigPath(): string {
  const managedPath = resolveManagedOpencodeConfigPath();
  process.env[OPENCODE_CONFIG_ENV] = managedPath;
  return managedPath;

  /* legacy fallback path intentionally disabled for managed runtime sync
  const customPath = process.env[OPENCODE_CONFIG_ENV];
  if (customPath && customPath.trim()) return path.resolve(customPath);
  const jsonPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  if (fs.existsSync(jsonPath)) return jsonPath;
  const jsoncPath = jsonPath.replace(/\.json$/i, '.jsonc');
  if (fs.existsSync(jsoncPath)) return jsoncPath;
  if (canWriteToPath(jsonPath)) return jsonPath;
  const fallbackPath = resolveManagedOpencodeFallbackPath();
  process.env[OPENCODE_CONFIG_ENV] = fallbackPath;
  return fallbackPath;
  */
}

function parseOpencodeConfig(content: string): OpencodeProviderConfig {
  const parsed = JSON.parse(stripJsonComments(content)) as unknown;
  return isRecord(parsed) ? ({ ...parsed } as OpencodeProviderConfig) : {};
}

function buildManagedOpencodeConfig(
  profile: ProviderSyncProfile,
  current: OpencodeProviderConfig
): OpencodeProviderConfig {
  const currentProviders = Object.fromEntries(
    Object.entries(current.provider ?? {}).filter(([providerId]) => !isManagedRuntimeProviderId(providerId))
  );
  const nextProvider: NonNullable<OpencodeProviderConfig['provider']> = {
    ...currentProviders,
    [profile.managedProviderId]: {
      ...current.provider?.[profile.managedProviderId],
      npm: resolveOpencodeNpmPackage(profile),
      name: profile.provider.name || profile.managedProviderId,
      options: {
        ...current.provider?.[profile.managedProviderId]?.options,
        baseURL: resolveOpencodeBaseUrl(profile),
        apiKey: profile.provider.api_key,
      },
      models: {
        [profile.normalizedModelId]: {
          name: profile.normalizedModelId,
        },
      },
    },
  };
  return {
    ...current,
    $schema: current.$schema || OPENCODE_SCHEMA_URL,
    model: `${profile.managedProviderId}/${profile.normalizedModelId}`,
    provider: nextProvider,
  };
}

function writeOpencodeConfigForProviderSync(provider: TProviderWithModel, _sourceProvider?: IProvider): void {
  const profile = buildProviderSyncProfile(provider);
  if (!profile) return;
  const configPath = resolveOpencodeConfigPath();
  process.env[OPENCODE_CONFIG_ENV] = configPath;
  const current = fs.existsSync(configPath)
    ? parseOpencodeConfig(fs.readFileSync(configPath, 'utf8'))
    : { $schema: OPENCODE_SCHEMA_URL };
  const nextConfig = buildManagedOpencodeConfig(profile, current);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function clearOpencodeConfigForProviderSync(managedProviderId: string): void {
  const configPath = resolveOpencodeConfigPath();
  if (!fs.existsSync(configPath)) return;
  const current = parseOpencodeConfig(fs.readFileSync(configPath, 'utf8'));
  const nextProvider = Object.fromEntries(
    Object.entries(current.provider ?? {}).filter(([providerId]) => !isManagedRuntimeProviderId(providerId))
  );
  const nextConfig: OpencodeProviderConfig = {
    ...current,
    ...(Object.keys(nextProvider).length > 0 ? { provider: nextProvider } : { provider: undefined }),
    ...(typeof current.model === 'string' &&
    (current.model.startsWith(`${managedProviderId}/`) || isManagedRuntimeProviderId(current.model.split('/')[0]))
      ? { model: undefined }
      : {}),
  };
  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function recoverApiKeyFromOpencodeConfig(): string | undefined {
  const configPath = resolveOpencodeConfigPath();
  if (!fs.existsSync(configPath)) return undefined;
  const current = parseOpencodeConfig(fs.readFileSync(configPath, 'utf8'));
  for (const [providerId, provider] of Object.entries(current.provider ?? {})) {
    if (!isManagedRuntimeProviderId(providerId)) continue;
    const apiKey = provider?.options?.apiKey?.trim();
    if (apiKey) return apiKey;
  }
  return undefined;
}

function recoverManagedRuntimeSnapshotFromOpencodeConfig(): RecoveredManagedRuntimeSnapshot | undefined {
  const configPath = resolveOpencodeConfigPath();
  if (!fs.existsSync(configPath)) return undefined;
  const current = parseOpencodeConfig(fs.readFileSync(configPath, 'utf8'));

  for (const [providerId, provider] of Object.entries(current.provider ?? {})) {
    if (!isManagedRuntimeProviderId(providerId)) continue;
    const token = provider?.options?.apiKey?.trim();
    const baseUrl = provider?.options?.baseURL?.trim();
    const models = normalizeManagedRuntimeModels([
      ...Object.keys(provider?.models ?? {}),
      typeof current.model === 'string' && current.model.startsWith(`${providerId}/`)
        ? current.model.slice(providerId.length + 1)
        : undefined,
    ]);
    if (!token || !baseUrl || models.length === 0) continue;
    return {
      token,
      baseUrl: normalizeBaseUrl(baseUrl),
      models,
      managedProviderId: providerId,
    };
  }

  return undefined;
}

function resolveOpenClawConfigPath(): string {
  const override = process.env.OPENCLAW_CONFIG_PATH?.trim();
  if (override) return path.resolve(override);
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim()
    ? path.resolve(process.env.OPENCLAW_STATE_DIR.trim())
    : path.join(os.homedir(), '.openclaw');
  return path.join(stateDir, 'openclaw.json');
}

function readOpenClawConfigFromPath(configPath: string): Record<string, unknown> {
  if (!fs.existsSync(configPath)) return {};
  const content = fs.readFileSync(configPath, 'utf8');
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    const cleanContent = content.replace(/"(?:[^"\\]|\\.)*"|\/\/.*$|\/\*[\s\S]*?\*\//gm, (match) =>
      match.startsWith('"') ? match : ''
    );
    const parsed = JSON.parse(cleanContent) as unknown;
    return isRecord(parsed) ? parsed : {};
  }
}

function buildManagedOpenClawConfig(
  profile: ProviderSyncProfile,
  current: Record<string, unknown>
): Record<string, unknown> {
  const models = isRecord(current.models) ? { ...current.models } : {};
  const providers = Object.fromEntries(
    Object.entries(isRecord(models.providers) ? models.providers : {}).filter(
      ([providerId]) => !isManagedRuntimeProviderId(providerId)
    )
  );
  providers[profile.managedProviderId] = {
    ...((isRecord(providers[profile.managedProviderId]) ? providers[profile.managedProviderId] : {}) as Record<
      string,
      unknown
    >),
    baseUrl: resolveOpenClawBaseUrl(profile),
    apiKey: profile.provider.api_key,
    auth: 'api-key',
    api: resolveOpenClawApiProtocol(profile),
    headers: {},
    authHeader: true,
    models: [{ id: profile.normalizedModelId, name: profile.normalizedModelId }],
  };
  models.mode = 'merge';
  models.providers = providers;
  const agents = isRecord(current.agents) ? { ...current.agents } : {};
  const defaults = isRecord(agents.defaults) ? { ...agents.defaults } : {};
  const defaultModels = isRecord(defaults.models) ? { ...defaults.models } : {};
  for (const modelId of Object.keys(defaultModels)) {
    const providerId = modelId.split('/')[0];
    if (providerId && isManagedRuntimeProviderId(providerId)) {
      delete defaultModels[modelId];
    }
  }
  defaultModels[`${profile.managedProviderId}/${profile.normalizedModelId}`] = {
    alias: profile.normalizedModelId,
  };
  defaults.model = { primary: `${profile.managedProviderId}/${profile.normalizedModelId}` };
  defaults.models = defaultModels;
  agents.defaults = defaults;
  return {
    ...current,
    gateway: {
      mode: 'local',
      ...(isRecord(current.gateway) ? current.gateway : {}),
    },
    models,
    agents,
  };
}

function writeOpenClawManagedProviderModel(provider: TProviderWithModel, _sourceProvider?: IProvider): void {
  const profile = buildProviderSyncProfile(provider);
  if (!profile) return;
  const configPath = resolveOpenClawConfigPath();
  const current = readOpenClawConfigFromPath(configPath);
  const next = buildManagedOpenClawConfig(profile, current);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function clearOpenClawManagedProviderModel(managedProviderId: string): void {
  const configPath = resolveOpenClawConfigPath();
  if (!fs.existsSync(configPath)) return;
  const current = readOpenClawConfigFromPath(configPath);
  const models = isRecord(current.models) ? { ...current.models } : {};
  const providers = Object.fromEntries(
    Object.entries(isRecord(models.providers) ? models.providers : {}).filter(
      ([providerId]) => !isManagedRuntimeProviderId(providerId)
    )
  );
  models.providers = Object.keys(providers).length > 0 ? providers : undefined;
  const agents = isRecord(current.agents) ? { ...current.agents } : {};
  const defaults = isRecord(agents.defaults) ? { ...agents.defaults } : {};
  const primary = isRecord(defaults.model) ? defaults.model.primary : undefined;
  if (
    typeof primary === 'string' &&
    (primary.startsWith(`${managedProviderId}/`) || isManagedRuntimeProviderId(primary.split('/')[0]))
  ) {
    defaults.model = undefined;
  }
  const nextDefaultModels = Object.fromEntries(
    Object.entries(isRecord(defaults.models) ? defaults.models : {}).filter(([modelId]) => {
      const providerId = modelId.split('/')[0];
      return providerId && !isManagedRuntimeProviderId(providerId);
    })
  );
  defaults.models = Object.keys(nextDefaultModels).length > 0 ? nextDefaultModels : undefined;
  agents.defaults = defaults;
  const next = { ...current, models, agents };
  const hasNonManagedProviders = Object.keys(providers).length > 0;
  const hasNonManagedDefaults =
    Object.keys(nextDefaultModels).length > 0 ||
    Boolean(
      typeof primary === 'string' &&
      !(primary.startsWith(`${managedProviderId}/`) || isManagedRuntimeProviderId(primary.split('/')[0]))
    );
  if (!hasNonManagedProviders && !hasNonManagedDefaults) {
    fs.rmSync(configPath, { force: true });
    return;
  }
  fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function recoverApiKeyFromOpenClawConfig(): string | undefined {
  const configPath = resolveOpenClawConfigPath();
  if (!fs.existsSync(configPath)) return undefined;
  const current = readOpenClawConfigFromPath(configPath);
  const providers = isRecord(current.models) && isRecord(current.models.providers) ? current.models.providers : {};
  for (const [providerId, providerValue] of Object.entries(providers)) {
    if (!isManagedRuntimeProviderId(providerId) || !isRecord(providerValue)) continue;
    const apiKey = typeof providerValue.apiKey === 'string' ? providerValue.apiKey.trim() : '';
    if (apiKey) return apiKey;
  }
  return undefined;
}

function recoverManagedRuntimeSnapshotFromOpenClawConfig(): RecoveredManagedRuntimeSnapshot | undefined {
  const configPath = resolveOpenClawConfigPath();
  if (!fs.existsSync(configPath)) return undefined;
  const current = readOpenClawConfigFromPath(configPath);
  const providers = isRecord(current.models) && isRecord(current.models.providers) ? current.models.providers : {};

  for (const [providerId, providerValue] of Object.entries(providers)) {
    if (!isManagedRuntimeProviderId(providerId) || !isRecord(providerValue)) continue;
    const token = typeof providerValue.apiKey === 'string' ? providerValue.apiKey.trim() : '';
    const baseUrl = typeof providerValue.baseUrl === 'string' ? providerValue.baseUrl.trim() : '';
    const models = normalizeManagedRuntimeModels(
      Array.isArray(providerValue.models)
        ? providerValue.models.map((item) => {
            if (!isRecord(item)) return undefined;
            if (typeof item.id === 'string') return item.id;
            if (typeof item.name === 'string') return item.name;
            return undefined;
          })
        : []
    );
    if (!token || !baseUrl || models.length === 0) continue;
    return {
      token,
      baseUrl: normalizeBaseUrl(baseUrl),
      models,
      managedProviderId: providerId,
    };
  }

  return undefined;
}

function recoverManagedRuntimeSnapshotFromHermesConfig(): RecoveredManagedRuntimeSnapshot | undefined {
  const token = recoverApiKeyFromHermesEnv();
  const configPath = resolveHermesConfigPath();
  if (!token || !fs.existsSync(configPath)) return undefined;
  const content = fs.readFileSync(configPath, 'utf8');
  const baseUrlMatch = content.match(/base_url:\s*["']?([^"'\n]+)["']?/);
  const modelMatch = content.match(/default:\s*["']?([^"'\n]+)["']?/);
  const baseUrl = baseUrlMatch?.[1]?.trim();
  const model = modelMatch?.[1]?.trim();
  if (!baseUrl || !model) return undefined;
  return {
    token,
    baseUrl: normalizeBaseUrl(baseUrl),
    models: [model],
  };
}

function recoverManagedApiKeyFromRuntimeConfigs(): string | undefined {
  return (
    recoverApiKeyFromHermesEnv() ||
    recoverApiKeyFromOpenClawConfig() ||
    recoverApiKeyFromOpencodeConfig() ||
    recoverApiKeyFromClaudeSettings()
  );
}

function recoverManagedRuntimeSnapshotFromConfigs(): RecoveredManagedRuntimeSnapshot | undefined {
  return (
    recoverManagedRuntimeSnapshotFromOpenClawConfig() ||
    recoverManagedRuntimeSnapshotFromOpencodeConfig() ||
    recoverManagedRuntimeSnapshotFromClaudeSettings() ||
    recoverManagedRuntimeSnapshotFromHermesConfig()
  );
}

async function syncManagedProviderRuntimeConfigs(provider: IProvider, prefs: ManagedCliModelPrefs): Promise<void> {
  const cliTasks: Array<{
    cliTarget: ManagedRuntimeCliTarget;
    run: (providerWithModel: TProviderWithModel) => Promise<void> | void;
  }> = [
    {
      cliTarget: 'claude',
      run: (providerWithModel) => writeClaudeSettingsForProviderSync(providerWithModel),
    },
    {
      cliTarget: 'hermes',
      run: (providerWithModel) => writeHermesConfigForProviderSync(providerWithModel),
    },
    {
      cliTarget: 'opencode',
      run: (providerWithModel) => writeOpencodeConfigForProviderSync(providerWithModel, provider),
    },
    {
      cliTarget: 'openclaw',
      run: (providerWithModel) => writeOpenClawManagedProviderModel(providerWithModel, provider),
    },
  ];

  await Promise.all(
    cliTasks.map(async ({ cliTarget, run }) => {
      const providerWithModel = buildProviderWithModel(provider, resolveManagedCliModelId(provider, prefs, cliTarget));
      if (!providerWithModel) return;
      try {
        await run(providerWithModel);
      } catch (error) {
        console.error(`[POUNDING] Managed NewAPI runtime sync target failed for ${cliTarget}:`, error);
      }
    })
  );
}

async function getStoredStatus(): Promise<NewApiAccountStatus> {
  const managedRuntime = await getManagedRuntimeState();
  const shouldUseLegacyClientSettings = !managedRuntime || managedRuntime.account == null;
  const backendSettings = shouldUseLegacyClientSettings
    ? await getBackendClientSettings().catch((): Record<string, unknown> => ({}))
    : {};
  const persisted = managedRuntime?.account
    ? fromManagedRuntimeAccountStatus(managedRuntime.account)
    : (backendSettings[NEW_API_STORAGE_KEY] as NewApiAccountStatus | undefined);
  const local = (await ProcessConfig.get(NEW_API_STORAGE_KEY)) as NewApiAccountStatus | undefined;
  return mergeAccountStatus(persisted, local);
}

async function saveStatus(status: NewApiAccountStatus): Promise<void> {
  await ProcessConfig.set(NEW_API_STORAGE_KEY, status);
  try {
    await httpRequest<void>('PUT', '/api/settings/managed-runtime', {
      account: toBackendManagedRuntimeAccount(status),
    });
  } catch (error) {
    if (!shouldFallbackToLegacyClientSettings(error)) throw error;
    await httpRequest<void>('PUT', '/api/settings/client', {
      [NEW_API_STORAGE_KEY]: toPersistedAccountStatus(status),
    });
  }
}

async function clearPersistedStatus(): Promise<void> {
  try {
    await httpRequest<void>('PUT', '/api/settings/managed-runtime', {
      account: null,
    });
  } catch (error) {
    if (!shouldFallbackToLegacyClientSettings(error)) throw error;
    await httpRequest<void>('PUT', '/api/settings/client', {
      [NEW_API_STORAGE_KEY]: null,
    });
  }
}

async function getBackendClientSettings(): Promise<Record<string, unknown>> {
  return ((await httpRequest<Record<string, unknown>>('GET', '/api/settings/client')) ?? {}) as Record<string, unknown>;
}

async function getManagedRuntimeState(): Promise<ManagedRuntimeStateResponse | null> {
  try {
    return ((await httpRequest<ManagedRuntimeStateResponse>('GET', '/api/settings/managed-runtime')) ??
      null) as ManagedRuntimeStateResponse | null;
  } catch (error) {
    if (shouldFallbackToLegacyClientSettings(error)) return null;
    throw error;
  }
}

async function getSavedManagedModelPrefs(): Promise<ManagedCliModelPrefs> {
  const managedRuntime = await getManagedRuntimeState();
  const backendSettings =
    managedRuntime && managedRuntime.cli_model_prefs != null
      ? { [NEW_API_CLI_MODEL_PREFS_KEY]: managedRuntime.cli_model_prefs }
      : await getBackendClientSettings().catch((): Record<string, unknown> => ({}));
  const current =
    (backendSettings[NEW_API_CLI_MODEL_PREFS_KEY] as ManagedCliModelPrefs | undefined) ??
    ((await ProcessConfig.get(NEW_API_CLI_MODEL_PREFS_KEY)) as ManagedCliModelPrefs | undefined);
  if (!current || !isRecord(current)) return {};
  return Object.fromEntries(
    Object.entries(current)
      .filter(
        ([cliTarget, modelId]) =>
          MANAGED_RUNTIME_CLI_TARGETS.includes(cliTarget as ManagedRuntimeCliTarget) &&
          isNonEmptyString(sanitizeManagedRuntimeModelValue(modelId))
      )
      .map(([cliTarget, modelId]) => [cliTarget, sanitizeManagedRuntimeModelValue(modelId)!])
  ) as ManagedCliModelPrefs;
}

async function saveManagedModelPrefs(prefs: ManagedCliModelPrefs): Promise<void> {
  const normalized = Object.fromEntries(
    Object.entries(prefs)
      .filter(
        ([cliTarget, modelId]) =>
          MANAGED_RUNTIME_CLI_TARGETS.includes(cliTarget as ManagedRuntimeCliTarget) &&
          isNonEmptyString(sanitizeManagedRuntimeModelValue(modelId))
      )
      .map(([cliTarget, modelId]) => [cliTarget, sanitizeManagedRuntimeModelValue(modelId)!])
  ) as ManagedCliModelPrefs;
  try {
    await httpRequest<void>('PUT', '/api/settings/managed-runtime', {
      cli_model_prefs: normalized,
    });
  } catch (error) {
    if (!shouldFallbackToLegacyClientSettings(error)) throw error;
    await httpRequest<void>('PUT', '/api/settings/client', {
      [NEW_API_CLI_MODEL_PREFS_KEY]: normalized,
    });
  }
}

async function clearManagedModelPrefs(): Promise<void> {
  try {
    await httpRequest<void>('PUT', '/api/settings/managed-runtime', {
      cli_model_prefs: null,
    });
  } catch (error) {
    if (!shouldFallbackToLegacyClientSettings(error)) throw error;
    await httpRequest<void>('PUT', '/api/settings/client', {
      [NEW_API_CLI_MODEL_PREFS_KEY]: null,
    });
  }
}

function resolveManagedCliModelId(
  provider: IProvider,
  prefs: ManagedCliModelPrefs,
  cliTarget: ManagedRuntimeCliTarget
): string | undefined {
  const sourceModels = getManagedCliSelectableModels(provider, cliTarget);
  const preferredModelId = sanitizeManagedRuntimeModelValue(prefs[cliTarget]);
  if (preferredModelId && sourceModels.includes(preferredModelId)) {
    return preferredModelId;
  }
  return selectDefaultModel(sourceModels);
}

/** Preferred model name patterns for auto-selecting defaults (first match wins). */
const PREFERRED_MODEL_PATTERNS = ['deepseek', 'claude-opus', 'claude-sonnet', 'claude-haiku'];

function selectDefaultModel(models: string[]): string | undefined {
  for (const pattern of PREFERRED_MODEL_PATTERNS) {
    const match = models.find((m) => m.toLowerCase().includes(pattern));
    if (match) return match;
  }
  return models[0];
}

async function findManagedProvider(): Promise<IProvider | null> {
  const providers = (await httpRequest<IProvider[]>('GET', '/api/providers')) || [];
  return providers.find((provider) => provider.id === NEW_API_MANAGED_PROVIDER_ID) || null;
}

function buildManagedProviderPayload(params: {
  apiKey: string;
  models: string[];
  baseUrl?: string;
}): CreateProviderRequest {
  const baseUrl = params.baseUrl || NEW_API_BASE_URL;
  return {
    id: NEW_API_MANAGED_PROVIDER_ID,
    name: NEW_API_PROVIDER_DISPLAY_NAME,
    platform: 'new-api',
    base_url: baseUrl,
    api_key: params.apiKey,
    models: params.models,
    enabled: true,
    model_enabled: Object.fromEntries(params.models.map((model) => [model, true])),
    model_protocols: Object.fromEntries(params.models.map((model) => [model, detectNewApiProtocol(model)])),
  };
}

async function upsertManagedProvider(params: {
  apiKey: string;
  models: string[];
  baseUrl?: string;
}): Promise<IProvider> {
  const existing = await findManagedProvider();
  const payload = buildManagedProviderPayload(params);
  if (existing) {
    return await httpRequest<IProvider>(
      'PUT',
      `/api/providers/${NEW_API_MANAGED_PROVIDER_ID}`,
      payload as UpdateProviderRequest
    );
  }
  return await httpRequest<IProvider>('POST', '/api/providers', payload);
}

async function removeManagedProvider(): Promise<void> {
  const existing = await findManagedProvider();
  if (!existing) return;
  await httpRequest<void>('DELETE', `/api/providers/${NEW_API_MANAGED_PROVIDER_ID}`);
}

async function clearManagedBackendSyncArtifacts(): Promise<void> {
  const managedProviderId = getManagedRuntimeProviderId(NEW_API_PROVIDER_NAME, NEW_API_MANAGED_PROVIDER_ID);
  clearClaudeSettingsForProviderSync();
  clearHermesConfigForProviderSync();
  clearOpencodeConfigForProviderSync(managedProviderId);
  clearOpenClawManagedProviderModel(managedProviderId);
}

function clearManagedRuntimeForCliTargetSync(cliTarget: ManagedRuntimeCliTarget): void {
  const managedProviderId = getManagedRuntimeProviderId(NEW_API_PROVIDER_NAME, NEW_API_MANAGED_PROVIDER_ID);

  switch (cliTarget) {
    case 'claude':
      clearClaudeSettingsForProviderSync();
      break;
    case 'hermes':
      clearHermesConfigForProviderSync();
      break;
    case 'opencode':
      clearOpencodeConfigForProviderSync(managedProviderId);
      break;
    case 'openclaw':
      clearOpenClawManagedProviderModel(managedProviderId);
      break;
  }
}

function parseReconcileInput(input?: ManagedRuntimeReconcileInput): {
  cliTarget?: ManagedRuntimeCliTarget;
  modelId?: string;
} {
  if (typeof input === 'string') {
    const modelId = sanitizeManagedRuntimeModelValue(input);
    return modelId ? { modelId } : {};
  }
  if (!input) return {};
  const cliTarget =
    input.cliTarget && MANAGED_RUNTIME_CLI_TARGETS.includes(input.cliTarget) ? input.cliTarget : undefined;
  const modelId = sanitizeManagedRuntimeModelValue(input.modelId);
  return { cliTarget, modelId };
}

export class NewApiDesktopAccountService {
  private lastReconcileTime = 0;
  private readonly RECONCILE_DEBOUNCE_MS = 30_000; // 30 seconds debounce

  async clearManagedRuntimeForCliTarget(cliTarget: ManagedRuntimeCliTarget): Promise<void> {
    clearManagedRuntimeForCliTargetSync(cliTarget);
  }

  async reconcileManagedRuntimeState(input?: ManagedRuntimeReconcileInput): Promise<void> {
    const now = Date.now();
    if (now - this.lastReconcileTime < this.RECONCILE_DEBOUNCE_MS) {
      return;
    }
    this.lastReconcileTime = now;

    let status = await getStoredStatus();
    let recoveredToken = status.token?.trim() || recoverManagedApiKeyFromRuntimeConfigs();
    let provider = await findManagedProvider();
    let statusRecoveredFromRuntime = false;

    if ((!status.loggedIn || status.models.length === 0) && !provider) {
      const recoveredSnapshot = recoverManagedRuntimeSnapshotFromConfigs();
      if (recoveredSnapshot) {
        recoveredToken = recoveredToken || recoveredSnapshot.token;
        const recoveredModels = mergeManagedRuntimeModelSets(status.models, recoveredSnapshot.models);
        provider = await upsertManagedProvider({
          apiKey: recoveredSnapshot.token,
          models: recoveredModels,
          baseUrl: recoveredSnapshot.baseUrl,
        });
        status = {
          ...status,
          loggedIn: true,
          baseUrl: recoveredSnapshot.baseUrl,
          models: recoveredModels,
          updatedAt: Date.now(),
          token: recoveredToken,
          managedProviderId: NEW_API_MANAGED_PROVIDER_ID,
        };
        statusRecoveredFromRuntime = true;
      }
    }

    provider =
      provider ??
      (recoveredToken && status.models.length > 0
        ? await upsertManagedProvider({
            apiKey: recoveredToken,
            models: status.models,
            baseUrl: status.baseUrl,
          })
        : null);

    if (!status.loggedIn && provider) {
      const providerModels = normalizeManagedRuntimeModels(provider.models ?? []);
      if (providerModels.length > 0) {
        status = {
          ...status,
          loggedIn: true,
          baseUrl: normalizeBaseUrl(provider.base_url || status.baseUrl || NEW_API_BASE_URL),
          models: mergeManagedRuntimeModelSets(status.models, providerModels),
          updatedAt: Date.now(),
          token: recoveredToken || provider.api_key,
          managedProviderId: provider.id || NEW_API_MANAGED_PROVIDER_ID,
        };
        statusRecoveredFromRuntime = true;
      }
    }

    if (!status.loggedIn) {
      return;
    }

    if (!provider) {
      return;
    }

    if (statusRecoveredFromRuntime) {
      await saveStatus({
        ...status,
        token: status.token || recoveredToken,
        managedProviderId: status.managedProviderId || NEW_API_MANAGED_PROVIDER_ID,
        updatedAt: Date.now(),
      });
    } else if (!status.token && recoveredToken) {
      await saveStatus({
        ...status,
        token: recoveredToken,
        managedProviderId: NEW_API_MANAGED_PROVIDER_ID,
        updatedAt: Date.now(),
      });
    } else if (status.loggedIn && (status.models.length === 0 || !status.managedProviderId)) {
      await saveStatus({
        ...status,
        models: mergeManagedRuntimeModelSets(status.models, provider.models ?? []),
        managedProviderId: status.managedProviderId || NEW_API_MANAGED_PROVIDER_ID,
        updatedAt: Date.now(),
      });
    }

    const { cliTarget, modelId } = parseReconcileInput(input);
    const currentPrefs = await getSavedManagedModelPrefs();
    let nextPrefs = currentPrefs;

    if (modelId) {
      if (cliTarget) {
        nextPrefs = { ...currentPrefs, [cliTarget]: modelId };
      } else {
        nextPrefs = Object.fromEntries(
          MANAGED_RUNTIME_CLI_TARGETS.map((target) => [target, modelId])
        ) as ManagedCliModelPrefs;
      }
      await saveManagedModelPrefs(nextPrefs);
    }

    await syncManagedProviderRuntimeConfigs(provider, nextPrefs);
  }

  async getStatus(): Promise<BridgeResponse<NewApiAccountStatus>> {
    let status = await getStoredStatus();
    if (shouldSelfHealManagedRuntimeStatus(status)) {
      try {
        await this.reconcileManagedRuntimeState();
        status = await getStoredStatus();
      } catch (error) {
        console.warn('[POUNDING] Failed to self-heal managed runtime status on getStatus:', error);
      }
    }

    return {
      success: true,
      data: status,
    };
  }

  async login(params: NewApiLoginParams): Promise<BridgeResponse<NewApiLoginResponse>> {
    const { username, password } = params;
    if (!username.trim() || !password) {
      return {
        success: false,
        msg: 'Username and password are required',
      };
    }

    try {
      const loginResult = await fetchJson<NewApiResponse<Record<string, unknown>>>('/api/user/login', {
        method: 'POST',
        body: { username, password },
      });
      const cookies = loginResult.cookies;
      const loginPayload = loginResult.data?.data ?? loginResult.data;
      const loginToken = extractToken(loginPayload) ?? extractToken(loginResult.data);
      const resolvedUserId = extractUserId(loginPayload);

      if (!resolvedUserId) {
        return {
          success: false,
          msg: 'Failed to resolve NewAPI user id from login response',
        };
      }

      const { token, baseUrl: providerBaseUrl } = await resolveManagedToken(cookies, loginToken, resolvedUserId);

      const selfResult = await fetchJson<NewApiResponse<unknown>>('/api/user/self', {
        cookies,
        token,
        userId: resolvedUserId,
      });
      const user = normalizeUser(selfResult.data?.data ?? selfResult.data ?? loginPayload, username.trim());

      const modelsResult = await fetchJson<NewApiResponse<unknown>>('/api/user/models', {
        cookies,
        token,
        userId: resolvedUserId,
      });
      const models = normalizeModelList(modelsResult.data?.data ?? modelsResult.data);

      const provider = await upsertManagedProvider({
        apiKey: token,
        models,
        baseUrl: providerBaseUrl,
      });
      const currentPrefs = await getSavedManagedModelPrefs();
      const nextPrefs: ManagedCliModelPrefs = { ...currentPrefs };
      for (const cliTarget of MANAGED_RUNTIME_CLI_TARGETS) {
        if (!resolveManagedCliModelId(provider, nextPrefs, cliTarget)) continue;
        nextPrefs[cliTarget] = resolveManagedCliModelId(provider, nextPrefs, cliTarget);
      }
      await saveManagedModelPrefs(nextPrefs);
      await syncManagedProviderRuntimeConfigs(provider, nextPrefs);

      const status: NewApiAccountStatus = {
        loggedIn: true,
        baseUrl: providerBaseUrl,
        models,
        updatedAt: Date.now(),
        user,
        token,
        cookies,
        managedProviderId: NEW_API_MANAGED_PROVIDER_ID,
      };

      await saveStatus(status);

      return {
        success: true,
        data: { status },
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async logout(): Promise<BridgeResponse> {
    await removeManagedProvider().catch((): void => undefined);
    await clearManagedModelPrefs().catch((): void => undefined);
    await clearManagedBackendSyncArtifacts().catch((): void => undefined);
    await clearPersistedStatus().catch((): void => undefined);
    await saveStatus({
      ...EMPTY_STATUS,
      updatedAt: Date.now(),
    });
    return { success: true };
  }
}

export const newApiDesktopAccountService = new NewApiDesktopAccountService();

export const __TEST__ = {
  mergeAccountStatus,
  mergeManagedRuntimeModelSets,
  shouldSelfHealManagedRuntimeStatus,
  toPersistedAccountStatus,
  toBackendManagedRuntimeAccount,
  fromManagedRuntimeAccountStatus,
  buildProviderSyncProfile,
  buildManagedOpencodeConfig,
  buildManagedOpenClawConfig,
  renderHermesManagedConfig,
  resolveHermesApiMode,
  resolveOpenClawApiProtocol,
  resolveOpenClawBaseUrl,
  recoverManagedRuntimeSnapshotFromConfigs,
  recoverManagedRuntimeSnapshotFromClaudeSettings,
  writeClaudeSettingsForProviderSync,
  clearClaudeSettingsForProviderSync,
  readCcSwitchSettings,
  getManagedCliSelectableModels,
  clearOpenClawManagedProviderModel,
  clearManagedRuntimeForCliTargetSync,
};
