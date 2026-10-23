/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Image-generation model support check for the built-in tool.
 *
 * Since 2026-08 this delegates to the declarative media model catalog
 * (`common/media/catalog`) — an entry resolving to an executable API form is
 * what "supported" means, so the settings dropdown and the runtime can no
 * longer drift apart. The legacy hardcoded rules (gemini / openrouter /
 * antigravity × name pattern) live on as catalog Form B entries, so existing
 * setups resolve exactly as before.
 *
 * Renderer-safe: only imports from the catalog (no Node.js APIs).
 */

import { isMediaGenSupported, type MediaProviderShape } from '@/common/media/catalog';

type ProviderShape = MediaProviderShape;

export const isImageGenSupported = (provider: ProviderShape, modelName: string): boolean => {
  return isMediaGenSupported('image', provider, modelName);
};
