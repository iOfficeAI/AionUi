/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { httpRequest } from '@/common/adapter/httpBridge';
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
  MANAGED_RUNTIME_CLI_TARGETS,
} from '@/common/types/agent/managedRuntimeCli';
import type { CreateProviderRequest, UpdateProviderRequest } from '@/common/types/provider/providerApi';
import { getProviderAuthType } from '@/common/utils/platformAuthType';
import { AuthType } from '@office-ai/aioncli-core';
import { ProcessConfig, getSystemDir } from '@process/utils/initStorage';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import stripJsonComments from 'strip-json-comments';

const NEW_API_BASE_URL = 'https://api.mxou.cn';
const NEW_API_STORAGE_KEY = 'newApi.desktop.account';
const NEW_API_CLI_MODEL_PREFS_KEY = 'newApi.desktop.cliModelPrefs';
const NEW_API_MANAGED_PROVIDER_ID = 'desktop-newapi-managed-provider';
const NEW_API_PROVIDER_NAME = 'New API';
const OPENCODE_SCHEMA_URL = 'https://opencode.ai/config.json';
const HERMES_API_KEY_ENV = 'AIONUI_HERMES_API_KEY';
const OPENCODE_CONFIG_ENV = 'OPENCODE_CONFIG';
const OPENCODE_MANAGED_FALLBACK_DIR_NAME = 'managed-opencode';
const OPENCODE_MANAGED_FALLBACK_FILE_NAME = 'opencode.json';
const MANAGED_PROVIDER_PREFIX = 'aionui-';
const CLAUDE_MANAGED_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
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

type ClaudeProviderEnv = Record<string, string>;

type ClaudeSettings = {
  model?: string;
  env?: Record<string, unknown>;
  hooks?: unknown;
  statusLine?: unknown;
  [key: string]: unknown;
};

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
  const usedQuota = record.usedQuota ?? record.used_quota ?? 0;
  const quota = record.quota ?? (typeof record.remain_quota === 'number' ? usedQuota + record.remain_quota : 520);
  return {
    id: record.id,
    username,
    displayName: record.displayName || record.name || username,
    email: record.email,
    quota,
    usedQuota,
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

  const tokenResult = await fetchJson<NewApiResponse<unknown>>('/api/user/token', {
    cookies,
    token: loginToken,
    userId,
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

async function fetchJson<T>(path: string, options: NewApiRequestOptions = {}): Promise<FetchResult<T>> {
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

  const response = await fetch(`${normalizeBaseUrl(NEW_API_BASE_URL)}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const cookies = normalizeCookies(getSetCookieValues(response));
  const content = (await response.json().catch(() => ({}))) as T;
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
  const requestedModel = modelId?.trim();
  const resolvedModel =
    requestedModel && provider.models?.includes(requestedModel) ? requestedModel : provider.models?.[0];
  if (!resolvedModel) return null;
  return {
    ...provider,
    models: provider.models,
    use_model: resolvedModel,
  } as TProviderWithModel;
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
  return {
    provider,
    protocol,
    normalizedBaseUrl,
    normalizedModelId,
    managedProviderId: getManagedRuntimeProviderId(
      provider.name || provider.platform || 'provider',
      provider.id || 'default'
    ),
  };
}

function buildClaudeRuntimeProviderEnv(profile: ProviderSyncProfile): ClaudeProviderEnv {
  return {
    ANTHROPIC_BASE_URL: profile.normalizedBaseUrl,
    ANTHROPIC_MODEL: profile.normalizedModelId,
    ANTHROPIC_DEFAULT_SONNET_MODEL: profile.normalizedModelId,
    ANTHROPIC_DEFAULT_OPUS_MODEL: profile.normalizedModelId,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.normalizedModelId,
    ANTHROPIC_AUTH_TOKEN: profile.provider.api_key,
    ANTHROPIC_API_KEY: profile.provider.api_key,
  };
}

function resolveHermesApiMode(profile: ProviderSyncProfile): 'anthropic_messages' | 'chat_completions' {
  return profile.protocol === 'anthropic' || profile.protocol === 'openai' ? 'anthropic_messages' : 'chat_completions';
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

function isManagedRuntimeProviderId(value: unknown): boolean {
  return typeof value === 'string' && value.trim().startsWith(MANAGED_PROVIDER_PREFIX);
}

function readJsonObjectFile<T extends Record<string, unknown>>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return parseJsonObject<T>(fs.readFileSync(filePath, 'utf-8'));
}

function getCcSwitchPaths(homeDir = os.homedir()) {
  const baseDir = path.join(homeDir, '.cc-switch');
  return {
    settingsPath: path.join(baseDir, 'settings.json'),
    databasePath: path.join(baseDir, 'cc-switch.db'),
    claudeSettingsPath: path.join(homeDir, '.claude', 'settings.json'),
  };
}

function writeClaudeSettingsForProviderSync(provider: TProviderWithModel): void {
  const profile = buildProviderSyncProfile(provider);
  if (!profile) return;
  const { claudeSettingsPath } = getCcSwitchPaths();
  const currentSettings = fs.existsSync(claudeSettingsPath)
    ? (parseJsonObject<ClaudeSettings>(fs.readFileSync(claudeSettingsPath, 'utf-8')) ?? {})
    : {};
  const nextSettings: ClaudeSettings = {
    ...currentSettings,
    model: 'default',
    env: {
      ...normalizeProviderEnv(currentSettings.env),
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
  nextLines.push(`${HERMES_API_KEY_ENV}=${JSON.stringify(apiKey)}`);
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, normalizeTrailingNewline(nextLines.join('\n')), { encoding: 'utf8', mode: 0o600 });
}

function renderHermesManagedConfig(profile: ProviderSyncProfile): string {
  return normalizeTrailingNewline(
    [
      'custom_providers:',
      `  - name: ${JSON.stringify(profile.managedProviderId)}`,
      `    base_url: ${JSON.stringify(profile.normalizedBaseUrl)}`,
      `    key_env: ${JSON.stringify(HERMES_API_KEY_ENV)}`,
      `    api_mode: ${JSON.stringify(resolveHermesApiMode(profile))}`,
      '    models:',
      `      ${JSON.stringify(profile.normalizedModelId)}: {}`,
      'model:',
      `  default: ${JSON.stringify(profile.normalizedModelId)}`,
      '  provider: custom',
      `  base_url: ${JSON.stringify(profile.normalizedBaseUrl)}`,
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
}

function parseOpencodeConfig(content: string): OpencodeProviderConfig {
  const parsed = JSON.parse(stripJsonComments(content)) as unknown;
  return isRecord(parsed) ? ({ ...parsed } as OpencodeProviderConfig) : {};
}

function getSyncableProviderModels(
  provider: Partial<Pick<IProvider, 'models' | 'model_enabled' | 'capabilities'>> & { use_model?: string }
): string[] {
  const models = Array.isArray(provider.models) && provider.models.length > 0 ? provider.models : [];
  if (models.length > 0) {
    return getManagedCliSelectableModels({
      models,
      model_enabled: provider.model_enabled,
      capabilities: provider.capabilities,
    } as IProvider);
  }
  return provider.use_model?.trim() ? [provider.use_model.trim()] : [];
}

function writeOpencodeConfigForProviderSync(provider: TProviderWithModel, sourceProvider?: IProvider): void {
  const profile = buildProviderSyncProfile(provider);
  if (!profile) return;
  const syncableModels = getSyncableProviderModels(sourceProvider ?? provider);
  const configPath = resolveOpencodeConfigPath();
  process.env[OPENCODE_CONFIG_ENV] = configPath;
  const current = fs.existsSync(configPath)
    ? parseOpencodeConfig(fs.readFileSync(configPath, 'utf8'))
    : { $schema: OPENCODE_SCHEMA_URL };
  const currentProviders = Object.fromEntries(
    Object.entries(current.provider ?? {}).filter(([providerId]) => !isManagedRuntimeProviderId(providerId))
  );
  const nextProvider = {
    ...currentProviders,
    [profile.managedProviderId]: {
      ...current.provider?.[profile.managedProviderId],
      npm: resolveOpencodeNpmPackage(profile),
      name: provider.name || profile.managedProviderId,
      options: {
        ...current.provider?.[profile.managedProviderId]?.options,
        baseURL: resolveOpencodeBaseUrl(profile),
        apiKey: provider.api_key,
      },
      models: Object.fromEntries(
        syncableModels.map((modelId) => [
          modelId,
          {
            name: modelId,
          },
        ])
      ),
    },
  };
  const nextConfig: OpencodeProviderConfig = {
    ...current,
    $schema: current.$schema || OPENCODE_SCHEMA_URL,
    model: `${profile.managedProviderId}/${profile.normalizedModelId}`,
    provider: nextProvider,
  };
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

function writeOpenClawManagedProviderModel(provider: TProviderWithModel, sourceProvider?: IProvider): void {
  const profile = buildProviderSyncProfile(provider);
  if (!profile) return;
  const syncableModels = getSyncableProviderModels(sourceProvider ?? provider);
  const configPath = resolveOpenClawConfigPath();
  const current = readOpenClawConfigFromPath(configPath);
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
    apiKey: provider.api_key,
    auth: 'api-key',
    api: resolveOpenClawApiProtocol(profile),
    headers: {},
    authHeader: true,
    models: syncableModels.map((modelId) => ({ id: modelId, name: modelId })),
  };
  models.mode = 'merge';
  models.providers = providers;
  const agents = isRecord(current.agents) ? { ...current.agents } : {};
  const defaults = isRecord(agents.defaults) ? { ...agents.defaults } : {};
  const defaultModels = isRecord(defaults.models) ? { ...defaults.models } : {};
  for (const modelId of syncableModels) {
    defaultModels[`${profile.managedProviderId}/${modelId}`] = {
      alias: modelId,
    };
  }
  defaults.model = { primary: `${profile.managedProviderId}/${profile.normalizedModelId}` };
  defaults.models = defaultModels;
  agents.defaults = defaults;
  const next = {
    ...current,
    gateway: {
      mode: 'local',
      ...(isRecord(current.gateway) ? current.gateway : {}),
    },
    models,
    agents,
  };
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

function recoverManagedApiKeyFromRuntimeConfigs(): string | undefined {
  return (
    recoverApiKeyFromHermesEnv() ||
    recoverApiKeyFromOpenClawConfig() ||
    recoverApiKeyFromOpencodeConfig() ||
    recoverApiKeyFromClaudeSettings()
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

  for (const { cliTarget, run } of cliTasks) {
    const providerWithModel = buildProviderWithModel(provider, resolveManagedCliModelId(provider, prefs, cliTarget));
    if (!providerWithModel) continue;
    try {
      await run(providerWithModel);
    } catch (error) {
      console.error(`[POUNDING] Managed NewAPI runtime sync target failed for ${cliTarget}:`, error);
    }
  }
}

async function getStoredStatus(): Promise<NewApiAccountStatus> {
  return ((await ProcessConfig.get(NEW_API_STORAGE_KEY)) as NewApiAccountStatus | undefined) ?? EMPTY_STATUS;
}

async function saveStatus(status: NewApiAccountStatus): Promise<void> {
  await ProcessConfig.set(NEW_API_STORAGE_KEY, status);
}

async function getBackendClientSettings(): Promise<Record<string, unknown>> {
  return ((await httpRequest<Record<string, unknown>>('GET', '/api/settings/client')) ?? {}) as Record<string, unknown>;
}

async function getSavedManagedModelPrefs(): Promise<ManagedCliModelPrefs> {
  const backendSettings = await getBackendClientSettings().catch((): Record<string, unknown> => ({}));
  const current =
    (backendSettings[NEW_API_CLI_MODEL_PREFS_KEY] as ManagedCliModelPrefs | undefined) ??
    ((await ProcessConfig.get(NEW_API_CLI_MODEL_PREFS_KEY)) as ManagedCliModelPrefs | undefined);
  if (!current || !isRecord(current)) return {};
  return Object.fromEntries(
    Object.entries(current).filter(
      ([cliTarget, modelId]) =>
        MANAGED_RUNTIME_CLI_TARGETS.includes(cliTarget as ManagedRuntimeCliTarget) && isNonEmptyString(modelId)
    )
  ) as ManagedCliModelPrefs;
}

async function saveManagedModelPrefs(prefs: ManagedCliModelPrefs): Promise<void> {
  const normalized = Object.fromEntries(
    Object.entries(prefs).filter(
      ([cliTarget, modelId]) =>
        MANAGED_RUNTIME_CLI_TARGETS.includes(cliTarget as ManagedRuntimeCliTarget) && isNonEmptyString(modelId)
    )
  ) as ManagedCliModelPrefs;
  await httpRequest<void>('PUT', '/api/settings/client', {
    [NEW_API_CLI_MODEL_PREFS_KEY]: normalized,
  });
}

async function clearManagedModelPrefs(): Promise<void> {
  await httpRequest<void>('PUT', '/api/settings/client', {
    [NEW_API_CLI_MODEL_PREFS_KEY]: null,
  });
}

function resolveManagedCliModelId(
  provider: IProvider,
  prefs: ManagedCliModelPrefs,
  cliTarget: ManagedRuntimeCliTarget
): string | undefined {
  const sourceModels = getManagedCliSelectableModels(provider);
  const preferredModelId = prefs[cliTarget]?.trim();
  if (preferredModelId && sourceModels.includes(preferredModelId)) {
    return preferredModelId;
  }
  return sourceModels[0];
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
    name: NEW_API_PROVIDER_NAME,
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
    const modelId = input.trim();
    return modelId ? { modelId } : {};
  }
  if (!input) return {};
  const cliTarget =
    input.cliTarget && MANAGED_RUNTIME_CLI_TARGETS.includes(input.cliTarget) ? input.cliTarget : undefined;
  const modelId = input.modelId?.trim() || undefined;
  return { cliTarget, modelId };
}

export class NewApiDesktopAccountService {
  async clearManagedRuntimeForCliTarget(cliTarget: ManagedRuntimeCliTarget): Promise<void> {
    clearManagedRuntimeForCliTargetSync(cliTarget);
  }

  async reconcileManagedRuntimeState(input?: ManagedRuntimeReconcileInput): Promise<void> {
    const status = await getStoredStatus();
    if (!status.loggedIn) {
      return;
    }

    const recoveredToken = status.token?.trim() || recoverManagedApiKeyFromRuntimeConfigs();
    const provider =
      (await findManagedProvider()) ??
      (recoveredToken && status.models.length > 0
        ? await upsertManagedProvider({
            apiKey: recoveredToken,
            models: status.models,
            baseUrl: status.baseUrl,
          })
        : null);

    if (!provider) {
      return;
    }

    if (!status.token && recoveredToken) {
      await saveStatus({
        ...status,
        token: recoveredToken,
        managedProviderId: NEW_API_MANAGED_PROVIDER_ID,
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
    return {
      success: true,
      data: await getStoredStatus(),
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
    await saveStatus({
      ...EMPTY_STATUS,
      updatedAt: Date.now(),
    });
    return { success: true };
  }
}

export const newApiDesktopAccountService = new NewApiDesktopAccountService();
