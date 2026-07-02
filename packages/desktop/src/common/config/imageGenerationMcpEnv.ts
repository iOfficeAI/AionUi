/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ImageGenerationModelSetting } from './clientSettings';
import type { IProvider } from './storage';

export const IMAGE_GEN_ENV_KEYS = {
  providerId: 'AIONUI_IMG_PROVIDER_ID',
  platform: 'AIONUI_IMG_PLATFORM',
  baseUrl: 'AIONUI_IMG_BASE_URL',
  apiKey: 'AIONUI_IMG_API_KEY',
  model: 'AIONUI_IMG_MODEL',
} as const;

type ImageGenerationSelection = Partial<ImageGenerationModelSetting>;

export type ImageGenerationMcpEnvResolveSource = 'provider-id' | 'field-match';

export type ImageGenerationMcpEnvResolveResult =
  | {
      ok: true;
      source: ImageGenerationMcpEnvResolveSource;
      provider: IProvider;
      model: string;
      env: Record<string, string>;
    }
  | {
      ok: false;
      reason:
        | 'missing-selection'
        | 'provider-not-found'
        | 'model-not-found'
        | 'ambiguous-provider'
        | 'no-provider-match';
      message: string;
      candidates?: string[];
    };

function normalizeBaseUrl(value?: string): string {
  return (value || '').trim().replace(/\/+$/, '');
}

function getLegacyField(
  selection: ImageGenerationSelection | undefined,
  existingEnv: Record<string, string> | undefined
) {
  return {
    providerId: selection?.id || existingEnv?.[IMAGE_GEN_ENV_KEYS.providerId],
    platform: selection?.platform || existingEnv?.[IMAGE_GEN_ENV_KEYS.platform],
    baseUrl: selection?.base_url || existingEnv?.[IMAGE_GEN_ENV_KEYS.baseUrl],
    model: selection?.use_model || existingEnv?.[IMAGE_GEN_ENV_KEYS.model],
  };
}

function providerHasModel(provider: IProvider, model: string): boolean {
  return Array.isArray(provider.models) && provider.models.includes(model);
}

function buildEnv(provider: IProvider, model: string): Record<string, string> {
  return {
    [IMAGE_GEN_ENV_KEYS.providerId]: provider.id,
    [IMAGE_GEN_ENV_KEYS.platform]: provider.platform,
    [IMAGE_GEN_ENV_KEYS.baseUrl]: provider.base_url,
    [IMAGE_GEN_ENV_KEYS.apiKey]: provider.api_key,
    [IMAGE_GEN_ENV_KEYS.model]: model,
  };
}

export function resolveImageGenerationMcpEnv(
  selection: ImageGenerationSelection | undefined,
  providers: IProvider[],
  existingEnv?: Record<string, string>
): ImageGenerationMcpEnvResolveResult {
  const { providerId, platform, baseUrl, model } = getLegacyField(selection, existingEnv);

  if (!providerId && !platform && !baseUrl && !model) {
    return {
      ok: false,
      reason: 'missing-selection',
      message: 'Image generation provider selection is missing.',
    };
  }

  if (!model) {
    return {
      ok: false,
      reason: 'missing-selection',
      message: 'Image generation model selection is missing.',
    };
  }

  if (providerId) {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) {
      return {
        ok: false,
        reason: 'provider-not-found',
        message: `Image generation provider was not found: ${providerId}`,
      };
    }
    if (!providerHasModel(provider, model)) {
      return {
        ok: false,
        reason: 'model-not-found',
        message: `Image generation model "${model}" was not found on provider "${provider.id}".`,
      };
    }
    return {
      ok: true,
      source: 'provider-id',
      provider,
      model,
      env: buildEnv(provider, model),
    };
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const platformLower = platform?.toLowerCase();
  const matches = providers.filter((provider) => {
    if (platformLower && provider.platform.toLowerCase() !== platformLower) {
      return false;
    }
    if (normalizedBaseUrl && normalizeBaseUrl(provider.base_url) !== normalizedBaseUrl) {
      return false;
    }
    return providerHasModel(provider, model);
  });

  if (matches.length === 1) {
    const provider = matches[0];
    return {
      ok: true,
      source: 'field-match',
      provider,
      model,
      env: buildEnv(provider, model),
    };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous-provider',
      message: `Image generation provider is ambiguous for model "${model}".`,
      candidates: matches.map((provider) => provider.id),
    };
  }

  return {
    ok: false,
    reason: 'no-provider-match',
    message: `No provider matches image generation model "${model}".`,
  };
}

export function removeImageGenerationEnvKeys(env: Record<string, string>): Record<string, string> {
  const next = { ...env };
  Object.values(IMAGE_GEN_ENV_KEYS).forEach((key) => {
    delete next[key];
  });
  return next;
}
