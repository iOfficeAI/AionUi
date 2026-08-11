/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from '@/common/config/storage';
import { hasSpecificModelCapability } from '@/renderer/utils/model/modelCapabilities';

/**
 * Cache for provider available models to avoid repeated computation.
 */
const availableModelsCache = new Map<string, string[]>();

/**
 * Get all available primary models for a provider (with cache).
 * Filters out disabled models based on modelEnabled state.
 * @param provider - Provider configuration
 * @returns Array of available primary model names
 */
export const getAvailableModels = (provider: IProvider): string[] => {
  // 包含 modelEnabled 状态到缓存 key 中
  const modelEnabledKey = provider.modelEnabled ? JSON.stringify(provider.modelEnabled) : 'all-enabled';
  const cacheKey = `${provider.id}-${(provider.model || []).join(',')}-${modelEnabledKey}`;

  if (availableModelsCache.has(cacheKey)) {
    return availableModelsCache.get(cacheKey)!;
  }

  const result: string[] = [];
  for (const modelName of provider.model || []) {
    // 检查模型是否被禁用（默认为启用）
    const isModelEnabled = provider.modelEnabled?.[modelName] !== false;
    if (!isModelEnabled) continue;

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
