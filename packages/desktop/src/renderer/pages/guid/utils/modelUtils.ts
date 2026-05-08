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
const available_modelsCache = new Map<string, string[]>();

/**
 * Get all available primary models for a provider (with cache).
 * Filters out disabled models based on model_enabled state.
 * @param provider - Provider configuration
 * @returns Array of available primary model names
 */
export const getAvailableModels = (provider: IProvider): string[] => {
  // 包含 model_enabled 状态到缓存 key 中
  const model_enabledKey = provider.model_enabled ? JSON.stringify(provider.model_enabled) : 'all-enabled';
  const cacheKey = `${provider.id}-${(provider.models || []).join(',')}-${model_enabledKey}`;

  if (available_modelsCache.has(cacheKey)) {
    return available_modelsCache.get(cacheKey)!;
  }

  const result: string[] = [];
  for (const modelName of provider.models || []) {
    // 检查模型是否被禁用（默认为启用）
    const isModelEnabled = provider.model_enabled?.[modelName] !== false;
    if (!isModelEnabled) continue;

    const functionCalling = hasSpecificModelCapability(provider, modelName, 'function_calling');
    const excluded = hasSpecificModelCapability(provider, modelName, 'excludeFromPrimary');

    if ((functionCalling === true || functionCalling === undefined) && excluded !== true) {
      result.push(modelName);
    }
  }

  available_modelsCache.set(cacheKey, result);
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
