/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from '@/common/storage';
import { hasSpecificModelCapability } from '@/renderer/utils/modelCapabilities';

/**
 * Cache for provider available models to avoid repeated computation.
 */
const availableModelsCache = new Map<string, string[]>();

/**
 * Get all available primary models for a provider (with cache).
 * @param provider - Provider configuration
 * @returns Array of available primary model names
 */
export const getAvailableModels = (provider: IProvider): string[] => {
  const cacheKey = `${provider.id}-${(provider.model || []).join(',')}`;

  if (availableModelsCache.has(cacheKey)) {
    return availableModelsCache.get(cacheKey)!;
  }

  const result: string[] = [];
  for (const modelName of provider.model || []) {
    const functionCalling = hasSpecificModelCapability(provider, modelName, 'function_calling');
    const excluded = hasSpecificModelCapability(provider, modelName, 'excludeFromPrimary');

    if ((functionCalling === true || functionCalling === undefined) && excluded !== true) {
      result.push(modelName);
    }
  }

  availableModelsCache.set(cacheKey, result);
  return result;
};

/**
 * Check if a provider has any available primary conversation models (efficient version).
 * @param provider - Provider configuration
 * @returns true if the provider has available models
 */
export const hasAvailableModels = (provider: IProvider): boolean => {
  return getAvailableModels(provider).length > 0;
};
