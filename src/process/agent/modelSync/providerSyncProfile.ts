/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import { getProviderAuthType } from '@/common/utils/platformAuthType';
import { isNewApiPlatform } from '@/common/utils/platformConstants';
import { AuthType } from '@office-ai/aioncli-core';

type SupportedProtocol = 'anthropic' | 'gemini' | 'openai';

export type ProviderSyncProfile = {
  provider: TProviderWithModel;
  protocol: SupportedProtocol;
  normalizedBaseUrl: string;
  normalizedModelId: string;
  managedProviderId: string;
};

export type ClaudeRuntimeProviderEnv = Record<string, string>;

function normalizeBaseUrl(baseUrl?: string): string {
  return baseUrl?.trim().replace(/\/+$/, '') ?? '';
}

function slugifyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function buildManagedProviderId(provider: TProviderWithModel): string {
  const namePart = slugifyPart(provider.name || provider.platform || 'provider') || 'provider';
  const idPart = slugifyPart(provider.id || 'default') || 'default';
  return `aionui-${namePart}-${idPart}`.slice(0, 64);
}

export function resolveSyncProtocol(provider: TProviderWithModel): SupportedProtocol | null {
  const authType = getProviderAuthType(provider);
  if (authType === AuthType.USE_ANTHROPIC) return 'anthropic';
  if (authType === AuthType.USE_GEMINI || authType === AuthType.LOGIN_WITH_GOOGLE) return 'gemini';
  if (authType === AuthType.USE_OPENAI) return 'openai';
  return null;
}

export function buildProviderSyncProfile(provider: TProviderWithModel): ProviderSyncProfile | null {
  const normalizedBaseUrl = normalizeBaseUrl(provider.baseUrl);
  const normalizedModelId = provider.useModel?.trim();
  const protocol = resolveSyncProtocol(provider);

  if (!protocol || !normalizedBaseUrl || !normalizedModelId) {
    return null;
  }

  return {
    provider,
    protocol,
    normalizedBaseUrl,
    normalizedModelId,
    managedProviderId: buildManagedProviderId(provider),
  };
}

function shouldPreferAnthropicCompatibleTakeover(profile: ProviderSyncProfile): boolean {
  return isNewApiPlatform(profile.provider.platform) && profile.protocol === 'openai';
}

export function resolveOpenClawApiProtocol(profile: ProviderSyncProfile): string {
  if (profile.protocol === 'anthropic' || shouldPreferAnthropicCompatibleTakeover(profile)) return 'anthropic-messages';
  if (profile.protocol === 'gemini') return 'google-generative-ai';
  return 'openai-completions';
}

export function isClaudeSyncSupportedProfile(profile: ProviderSyncProfile): boolean {
  return profile.protocol === 'anthropic' || profile.protocol === 'gemini' || profile.protocol === 'openai';
}

export function resolveClaudeApiKeyField(profile: ProviderSyncProfile): 'ANTHROPIC_AUTH_TOKEN' | 'ANTHROPIC_API_KEY' {
  return profile.protocol === 'gemini' ? 'ANTHROPIC_API_KEY' : 'ANTHROPIC_AUTH_TOKEN';
}

export function buildClaudeRuntimeProviderEnv(profile: ProviderSyncProfile): ClaudeRuntimeProviderEnv {
  return {
    ANTHROPIC_BASE_URL: profile.normalizedBaseUrl,
    ANTHROPIC_MODEL: profile.normalizedModelId,
    ANTHROPIC_DEFAULT_SONNET_MODEL: profile.normalizedModelId,
    ANTHROPIC_DEFAULT_OPUS_MODEL: profile.normalizedModelId,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.normalizedModelId,
    ANTHROPIC_AUTH_TOKEN: profile.provider.apiKey,
    ANTHROPIC_API_KEY: profile.provider.apiKey,
  };
}

export function resolveHermesApiMode(profile: ProviderSyncProfile): 'anthropic_messages' | 'chat_completions' {
  return profile.protocol === 'anthropic' || shouldPreferAnthropicCompatibleTakeover(profile)
    ? 'anthropic_messages'
    : 'chat_completions';
}

export function resolveOpencodeNpmPackage(profile: ProviderSyncProfile):
  | '@ai-sdk/openai-compatible'
  | '@ai-sdk/anthropic'
  | '@ai-sdk/google' {
  if (profile.protocol === 'anthropic') {
    return '@ai-sdk/anthropic';
  }
  if (profile.protocol === 'gemini') {
    return '@ai-sdk/google';
  }
  return '@ai-sdk/openai-compatible';
}

export function resolveOpencodeBaseUrl(profile: ProviderSyncProfile): string {
  if (resolveOpencodeNpmPackage(profile) !== '@ai-sdk/openai-compatible') {
    return profile.normalizedBaseUrl;
  }

  if (!isNewApiPlatform(profile.provider.platform)) {
    return profile.normalizedBaseUrl;
  }

  const rootUrl = profile.normalizedBaseUrl.replace(/\/v1$/, '').replace(/\/v1beta$/, '');
  return `${rootUrl}/v1`;
}
