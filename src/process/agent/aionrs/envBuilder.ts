/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import { isOpenAIHost } from '@/common/utils/urlValidation';
import { getEnhancedEnv } from '@process/utils/shellEnv';

type AionrsProvider = 'anthropic' | 'openai' | 'gemini' | 'bedrock' | 'vertex' | 'copilot' | 'chatgpt';
const DEFAULT_NO_PROXY = 'localhost,127.0.0.1,::1';
const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
] as const;

/**
 * Map AionUi platform name to aionrs provider name.
 *
 * AionUi PlatformType values:
 * 'custom' | 'new-api' | 'gemini' | 'gemini-vertex-ai' | 'anthropic' | 'bedrock' | 'copilot' | 'chatgpt'
 */
function mapProvider(model: TProviderWithModel): AionrsProvider {
  // Special handling for new-api: respect per-model protocol setting
  if (model.platform === 'new-api' && model.useModel && model.modelProtocols) {
    const protocol = model.modelProtocols[model.useModel];
    if (protocol === 'anthropic') return 'anthropic';
  }

  const mapping: Record<string, AionrsProvider> = {
    anthropic: 'anthropic',
    bedrock: 'bedrock',
    copilot: 'copilot',
    chatgpt: 'chatgpt',
    'gemini-vertex-ai': 'vertex',
    gemini: 'gemini',
    // custom / new-api default to OpenAI-compatible protocol
    custom: 'openai',
    'new-api': 'openai',
  };
  return mapping[model.platform] ?? 'openai';
}

const GEMINI_NATIVE_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function resolveGeminiBaseUrl(model: TProviderWithModel): string {
  const raw = (model.baseUrl || GEMINI_NATIVE_DEFAULT_BASE_URL).replace(/\/+$/, '');
  if (raw === 'https://generativelanguage.googleapis.com') {
    return GEMINI_NATIVE_DEFAULT_BASE_URL;
  }
  if (hasGeminiNativeVersionPath(raw)) {
    return raw;
  }
  return `${raw}/v1beta`;
}

function hasGeminiNativeVersionPath(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /\/v1(?:alpha|beta)?$/i.test(parsed.pathname.replace(/\/+$/, ''));
  } catch {
    return /\/v1(?:alpha|beta)?$/i.test(url.replace(/\/+$/, ''));
  }
}

function getArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function maskSecret(value: string): string {
  if (value.length <= 8) {
    return '***';
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function buildSpawnDiagnostics(args: string[], env: Record<string, string>, projectConfig: string) {
  const safeEnv = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, /key|token|secret/i.test(key) ? maskSecret(value) : value])
  );

  return {
    provider: getArgValue(args, '--provider'),
    model: getArgValue(args, '--model'),
    baseUrl: getArgValue(args, '--base-url'),
    args,
    env: safeEnv,
    projectConfig: projectConfig ? projectConfig.trim() : undefined,
  };
}

export function logSpawnDiagnostics(args: string[], env: Record<string, string>, projectConfig: string): void {
  console.log('[AionrsAgent] spawn config', JSON.stringify(buildSpawnDiagnostics(args, env, projectConfig)));
}

/**
 * Strip trailing `/v1` (with optional trailing slash) from a base URL.
 * aionrs appends `/v1/chat/completions` internally, so passing a URL
 * that already ends with `/v1` would produce a double `/v1/v1/…` path.
 */
function stripTrailingV1(url: string): string {
  return url.replace(/\/v1\/?$/, '');
}

export function buildProxyEnvironment(proxyUrl: string, noProxy = DEFAULT_NO_PROXY): Record<string, string> {
  const trimmed = proxyUrl.trim();
  if (!trimmed) {
    return {};
  }

  const env: Record<string, string> = {
    HTTP_PROXY: trimmed,
    HTTPS_PROXY: trimmed,
    ALL_PROXY: trimmed,
    NO_PROXY: noProxy,
  };

  if (process.platform === 'win32') {
    return env;
  }

  return {
    ...env,
    http_proxy: trimmed,
    https_proxy: trimmed,
    all_proxy: trimmed,
    no_proxy: noProxy,
  };
}

export function buildAionrsChildEnv(
  customEnv: Record<string, string> = {},
  options?: {
    proxy?: string;
  }
): Record<string, string> {
  const env = { ...getEnhancedEnv(customEnv) };
  for (const key of PROXY_ENV_KEYS) {
    delete env[key];
  }

  const explicitProxy = options?.proxy?.trim();
  if (explicitProxy) {
    return {
      ...env,
      ...buildProxyEnvironment(explicitProxy),
    };
  }

  return env;
}

/**
 * Build CLI args and env vars for spawning aionrs.
 */
export function buildSpawnConfig(
  model: TProviderWithModel,
  options: {
    workspace: string;
    maxTokens?: number;
    maxTurns?: number;
    systemPrompt?: string;
    autoApprove?: boolean;
    sessionId?: string;
    resume?: string;
  }
): { args: string[]; env: Record<string, string>; projectConfig: string } {
  const provider = mapProvider(model);
  const env: Record<string, string> = {};
  const args: string[] = ['--json-stream', '--provider', provider, '--model', model.useModel];

  if (options.maxTokens) {
    args.push('--max-tokens', String(options.maxTokens));
  }
  if (options.maxTurns) {
    args.push('--max-turns', String(options.maxTurns));
  }
  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt);
  }
  if (options.autoApprove) {
    args.push('--auto-approve');
  }

  // --resume and --session-id are mutually exclusive
  if (options.resume) {
    args.push('--resume', options.resume);
  } else if (options.sessionId) {
    args.push('--session-id', options.sessionId);
  }

  // Set auth credentials and base URL via CLI args and env vars.
  // aionrs reads: --api-key / API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY
  //               --base-url / BASE_URL (NOT OPENAI_BASE_URL)
  // aionrs appends `/v1/chat/completions` to base_url, so URLs that already
  // end with `/v1` (e.g. DashScope) must be stripped to avoid double `/v1`.
  switch (provider) {
    case 'anthropic':
      if (model.apiKey) env.ANTHROPIC_API_KEY = model.apiKey;
      if (model.baseUrl) args.push('--base-url', stripTrailingV1(model.baseUrl));
      break;

    case 'openai': {
      if (model.apiKey) env.OPENAI_API_KEY = model.apiKey;
      const baseUrl = model.baseUrl || '';
      if (baseUrl) args.push('--base-url', stripTrailingV1(baseUrl));
      break;
    }

    case 'gemini':
      if (model.apiKey) env.GEMINI_API_KEY = model.apiKey;
      args.push('--base-url', resolveGeminiBaseUrl(model));
      break;

    case 'bedrock': {
      const bc = (model as TProviderWithModel & { bedrockConfig?: any }).bedrockConfig;
      if (bc) {
        if (bc.region) env.AWS_REGION = bc.region;
        if (bc.authMethod === 'accessKey') {
          if (bc.accessKeyId) env.AWS_ACCESS_KEY_ID = bc.accessKeyId;
          if (bc.secretAccessKey) env.AWS_SECRET_ACCESS_KEY = bc.secretAccessKey;
        } else if (bc.authMethod === 'profile' && bc.profile) {
          env.AWS_PROFILE = bc.profile;
        }
      }
      break;
    }

    case 'copilot':
      if (model.apiKey) env.COPILOT_API_KEY = model.apiKey;
      if (model.baseUrl) args.push('--base-url', model.baseUrl.replace(/\/+$/, ''));
      break;

    case 'chatgpt':
      if (model.apiKey) env.OPENAI_API_KEY = model.apiKey;
      break;

    case 'vertex':
      // Vertex uses service account or ADC — no explicit env vars needed
      break;
  }

  // Generate project config for compat overrides (e.g., max_tokens_field)
  const projectConfig = buildProjectConfig(model, provider);

  return { args, env, projectConfig };
}

/**
 * Build `.aionrs.toml` project config content for provider compat overrides.
 * Returns non-empty string only when overrides are needed.
 *
 * - OpenAI official API requires `max_completion_tokens` instead of `max_tokens`
 *   for newer models (gpt-5.x, o-series, etc.).
 */
function buildProjectConfig(model: TProviderWithModel, provider: AionrsProvider): string {
  if (provider !== 'openai') return '';

  // Collect compat overrides as key-value pairs
  const overrides: string[] = [];

  // OpenAI official API needs max_completion_tokens for newer models.
  // Only apply when the host is actually OpenAI.
  const baseUrl = model.baseUrl || '';
  if (baseUrl && isOpenAIHost(baseUrl)) {
    overrides.push('max_tokens_field = "max_completion_tokens"');
  }

  if (overrides.length === 0) return '';
  return ['[providers.openai.compat]', ...overrides, ''].join('\n');
}
