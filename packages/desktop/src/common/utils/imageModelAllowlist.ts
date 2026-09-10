/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Allowlist for built-in image generation tool.
 *
 * The tool supports "form B" — OpenAI chat completions multimodal output (model
 * returns images via `message.images` or markdown) — plus providers that ship a
 * dedicated image generation endpoint the tool knows how to drive. It does NOT
 * support "form A" (`/v1/images/generations` endpoint) or async/polling APIs.
 *
 * Model selection therefore must be a platform+model allowlist of providers
 * known to work, rather than a coarse name-substring match. Otherwise users
 * see options like `gpt-image-1` / `dall-e-3` / `sd-3.5` in the dropdown that
 * are guaranteed to fail at runtime.
 *
 * Rules below mirror `useConfigModelListWithImage.ts` — the same providers we
 * auto-supplement with default image models. When #6 lands a form-A adapter,
 * extend this list accordingly.
 */

import { MINIMAX_IMAGE_API_HOSTS } from '@/common/config/constants';

type ProviderShape = {
  platform?: string;
  base_url?: string;
  name?: string;
};

const IMAGE_NAME_PATTERN = /(image|banana|imagine)/i;

/**
 * Whether `base_url` points at the MiniMax image generation API.
 *
 * MiniMax is configured as a generic custom platform, so the base URL is the only
 * signal that identifies it. Matching on a substring rather than a parsed host
 * keeps base URLs that omit the scheme working, consistent with the sibling rules.
 */
export const isMinimaxImageApiHost = (base_url?: string): boolean => {
  const normalized = base_url?.toLowerCase() ?? '';
  return MINIMAX_IMAGE_API_HOSTS.some((host) => normalized.includes(host));
};

const RULES: Array<{
  id: string;
  match: (provider: ProviderShape) => boolean;
}> = [
  {
    id: 'gemini',
    match: (p) => p.platform === 'gemini' || p.platform === 'gemini-vertex-ai',
  },
  {
    id: 'openrouter',
    match: (p) => !!p.base_url?.includes('openrouter.ai'),
  },
  {
    id: 'antigravity',
    match: (p) => !!p.name?.toLowerCase().includes('antigravity'),
  },
  {
    id: 'minimax',
    match: (p) => isMinimaxImageApiHost(p.base_url),
  },
];

export const isImageGenSupported = (provider: ProviderShape, modelName: string): boolean => {
  if (!IMAGE_NAME_PATTERN.test(modelName)) return false;
  return RULES.some((rule) => rule.match(provider));
};
