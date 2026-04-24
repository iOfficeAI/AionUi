/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import { isOpenAIHost } from '@/common/utils/urlValidation';

type AionrsProvider = 'anthropic' | 'openai' | 'bedrock' | 'vertex';

/**
 * Map AionUi platform name to aionrs provider name.
 *
 * AionUi PlatformType values: 'custom' | 'new-api' | 'gemini' | 'gemini-vertex-ai' | 'anthropic' | 'bedrock'
 */
function mapProvider(model: TProviderWithModel): AionrsProvider {
  // Special handling for new-api: respect per-model protocol setting
  if (model.platform === 'new-api' && model.useModel && model.model_protocols) {
    const protocol = model.model_protocols[model.useModel];
    if (protocol === 'anthropic') return 'anthropic';
  }

  const mapping: Record<string, AionrsProvider> = {
    anthropic: 'anthropic',
    bedrock: 'bedrock',
    'gemini-vertex-ai': 'vertex',
    // Gemini uses OpenAI-compatible endpoint
    gemini: 'openai',
    // custom / new-api default to OpenAI-compatible protocol
    custom: 'openai',
    'new-api': 'openai',
  };
  return mapping[model.platform] ?? 'openai';
}

const GEMINI_OPENAI_COMPAT_PATH = '/v1beta/openai';

/**
 * Resolve base URL for OpenAI-compatible providers.
 * For Gemini, ensure the URL includes the `/v1beta/openai` path suffix.
 */
function resolveOpenAIBaseUrl(model: TProviderWithModel): string {
  if (model.platform === 'gemini') {
    const raw = (model.base_url || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    return raw.endsWith(GEMINI_OPENAI_COMPAT_PATH) ? raw : `${raw}${GEMINI_OPENAI_COMPAT_PATH}`;
  }
  return model.base_url || '';
}

/**
 * Strip trailing `/v1` (with optional trailing slash) from a base URL.
 * aionrs appends `/v1/chat/completions` internally, so passing a URL
 * that already ends with `/v1` would produce a double `/v1/v1/…` path.
 */
function stripTrailingV1(url: string): string {
  return url.replace(/\/v1\/?$/, '');
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
    session_id?: string;
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
  } else if (options.session_id) {
    args.push('--session-id', options.session_id);
  }

  // Set auth credentials and base URL via CLI args and env vars.
  // aionrs reads: --api-key / API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY
  //               --base-url / BASE_URL (NOT OPENAI_BASE_URL)
  // aionrs appends `/v1/chat/completions` to base_url, so URLs that already
  // end with `/v1` (e.g. DashScope) must be stripped to avoid double `/v1`.
  switch (provider) {
    case 'anthropic':
      if (model.api_key) env.ANTHROPIC_API_KEY = model.api_key;
      if (model.base_url) args.push('--base-url', stripTrailingV1(model.base_url));
      break;

    case 'openai': {
      if (model.api_key) env.OPENAI_API_KEY = model.api_key;
      const base_url = resolveOpenAIBaseUrl(model);
      if (base_url) args.push('--base-url', stripTrailingV1(base_url));
      break;
    }

    case 'bedrock': {
      const bc = (model as TProviderWithModel & { bedrock_config?: any }).bedrock_config;
      if (bc) {
        if (bc.region) env.AWS_REGION = bc.region;
        if (bc.auth_method === 'accessKey') {
          if (bc.access_key_id) env.AWS_ACCESS_KEY_ID = bc.access_key_id;
          if (bc.secret_access_key) env.AWS_SECRET_ACCESS_KEY = bc.secret_access_key;
        } else if (bc.auth_method === 'profile' && bc.profile) {
          env.AWS_PROFILE = bc.profile;
        }
      }
      break;
    }

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
 * - Gemini's OpenAI-compatible endpoint already includes version in the base URL
 *   (`/v1beta/openai`), so we override api_path to `/chat/completions` to avoid
 *   the default `/v1/chat/completions` which would produce a 404.
 * - OpenAI official API requires `max_completion_tokens` instead of `max_tokens`
 *   for newer models (gpt-5.x, o-series, etc.).
 */
function buildProjectConfig(model: TProviderWithModel, provider: AionrsProvider): string {
  if (provider !== 'openai') return '';

  // Collect compat overrides as key-value pairs
  const overrides: string[] = [];

  // Gemini uses /v1beta/openai as base URL — skip the default /v1 prefix
  if (model.platform === 'gemini') {
    overrides.push('api_path = "/chat/completions"');
  }

  // OpenAI official API needs max_completion_tokens for newer models.
  // Only apply when the host is actually OpenAI (not Gemini or other providers).
  const base_url = model.base_url || '';
  if (base_url && isOpenAIHost(base_url)) {
    overrides.push('max_tokens_field = "max_completion_tokens"');
  }

  if (overrides.length === 0) return '';
  return ['[providers.openai.compat]', ...overrides, ''].join('\n');
}
