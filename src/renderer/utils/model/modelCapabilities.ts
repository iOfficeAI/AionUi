/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, ModelType } from '@/common/config/storage';
import { CAPABILITY_PATTERNS, CAPABILITY_EXCLUSIONS, getBaseModelName } from '@/common/utils/modelCapabilities';

export { hasSpecificModelCapability } from '@/common/utils/modelCapabilities';

// 能力判断缓存
const modelCapabilitiesCache = new Map<string, boolean | undefined>();

/**
 * 特定 provider 的能力规则
 */
const PROVIDER_CAPABILITY_RULES: Record<string, Record<ModelType, boolean | null>> = {
  anthropic: {
    text: true,
    vision: true,
    function_calling: true,
    image_generation: false,
    web_search: false,
    reasoning: false,
    embedding: false,
    rerank: false,
    excludeFromPrimary: false,
  },
  deepseek: {
    text: true,
    vision: null,
    function_calling: true,
    image_generation: false,
    web_search: false,
    reasoning: null,
    embedding: false,
    rerank: false,
    excludeFromPrimary: false,
  },
};

/**
 * 检查用户是否手动配置了某个能力类型
 * @param model - 模型对象
 * @param type - 能力类型
 * @returns true/false 如果用户有明确配置，undefined 如果未配置
 */
const getUserSelectedCapability = (model: IProvider, type: ModelType): boolean | undefined => {
  const capability = model.capabilities?.find((cap) => cap.type === type);
  return capability?.isUserSelected;
};

/**
 * 根据 provider 获取特定能力的规则
 * @param provider - 提供商名称
 * @param type - 能力类型
 * @returns true/false/null (null表示使用默认逻辑)
 */
const getProviderCapabilityRule = (provider: string, type: ModelType): boolean | null => {
  const rules = PROVIDER_CAPABILITY_RULES[provider?.toLowerCase()];
  return rules?.[type] ?? null;
};

/**
 * 判断模型是否具有某个能力 - 参考 Cherry Studio 的三层判断逻辑
 * @param model - 模型对象
 * @param type - 能力类型
 * @returns true=支持, false=不支持, undefined=未知
 */
export const hasModelCapability = (model: IProvider, type: ModelType): boolean | undefined => {
  // 生成缓存键（包含 capabilities 版本以避免缓存过期）
  const capabilitiesHash = model.capabilities ? JSON.stringify(model.capabilities) : '';
  const cacheKey = `${model.id}-${model.platform}-${type}-${capabilitiesHash}`;

  // 检查缓存
  if (modelCapabilitiesCache.has(cacheKey)) {
    return modelCapabilitiesCache.get(cacheKey);
  }

  let result: boolean | undefined;

  // 1. 优先级1：用户手动配置
  const userSelected = getUserSelectedCapability(model, type);
  if (userSelected !== undefined) {
    result = userSelected;
  } else {
    // 2. 优先级2：特定 provider 规则
    const providerRule = getProviderCapabilityRule(model.platform, type);
    if (providerRule !== null) {
      result = providerRule;
    } else {
      // 3. 优先级3：正则表达式匹配
      // 检查平台下是否有任一模型支持该能力
      const modelNames = model.model || [];

      // 统一逻辑处理所有能力类型
      // 检查是否有任一模型支持该能力
      const exclusions = CAPABILITY_EXCLUSIONS[type];
      const pattern = CAPABILITY_PATTERNS[type];

      const hasSupport = modelNames.some((modelName) => {
        const baseModelName = getBaseModelName(modelName);

        // 检查黑名单
        const isExcluded = exclusions.some((excludePattern) => excludePattern.test(baseModelName));
        if (isExcluded) return false;

        // 检查白名单
        return pattern.test(baseModelName);
      });

      result = hasSupport ? true : undefined;
    }
  }

  // 缓存结果
  modelCapabilitiesCache.set(cacheKey, result);
  return result;
};

/**
 * 清空能力判断缓存
 */
export const clearModelCapabilitiesCache = (): void => {
  modelCapabilitiesCache.clear();
};
