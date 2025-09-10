/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, ModelType } from '@/common/storage';

// 能力判断缓存
const modelCapabilitiesCache = new Map<string, boolean | undefined>();

/**
 * 能力匹配的正则表达式 - 参考 Cherry Studio 的做法
 */
const CAPABILITY_PATTERNS: Record<ModelType, RegExp> = {
  text: /gpt|claude|gemini|qwen|llama|mistral|deepseek/i,
  vision: /4o|claude-3|gemini-.*-pro|gemini-.*-flash|gemini-2\.0|qwen-vl|llava|vision/i,
  function_calling: /gpt-4|claude-3|gemini|qwen|deepseek/i,
  image_generation: /flux|diffusion|stabilityai|sd-|dall|cogview|janus|midjourney|mj-|imagen/i,
  web_search: /search|perplexity/i,
  reasoning: /o1-|reasoning|think/i,
  embedding: /(?:^text-|embed|bge-|e5-|LLM2Vec|retrieval|uae-|gte-|jina-clip|jina-embeddings|voyage-)/i,
  rerank: /(?:rerank|re-rank|re-ranker|re-ranking|retrieval|retriever)/i,
  excludeFromPrimary: /dall-e|flux|stable-diffusion|midjourney|flash-image|embed|rerank/i, // 要排除的主力模型
};

/**
 * 明确不支持某些能力的模型列表 - 黑名单
 */
const CAPABILITY_EXCLUSIONS: Record<ModelType, RegExp[]> = {
  text: [],
  vision: [/embed|rerank|dall-e|flux|stable-diffusion/i],
  function_calling: [/aqa(?:-[\\w-]+)?/i, /imagen(?:-[\\w-]+)?/i, /o1-mini/i, /o1-preview/i, /gemini-1(?:\\.[\\w-]+)?/i, /dall-e/i, /embed/i, /rerank/i],
  image_generation: [],
  web_search: [],
  reasoning: [],
  embedding: [],
  rerank: [],
  excludeFromPrimary: [],
};

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
 * 获取模型名称的小写基础版本（用于匹配）
 * @param modelName - 原始模型名称
 * @returns 清理后的小写模型名称
 */
const getBaseModelName = (modelName: string): string => {
  return modelName
    .toLowerCase()
    .replace(/[^a-z0-9./-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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
 * 判断平台下的具体模型是否具有某个能力
 * @param platformModel - 平台配置
 * @param modelName - 具体模型名
 * @param type - 能力类型
 */
export const hasSpecificModelCapability = (platformModel: IProvider, modelName: string, type: ModelType): boolean | undefined => {
  const baseModelName = getBaseModelName(modelName);
  const exclusions = CAPABILITY_EXCLUSIONS[type];
  const pattern = CAPABILITY_PATTERNS[type];

  // 统一逻辑：先检查黑名单，再检查白名单
  const isExcluded = exclusions.some((excludePattern) => excludePattern.test(baseModelName));
  if (isExcluded) return false;

  // 检查白名单
  return pattern.test(baseModelName) ? true : undefined;
};

/**
 * 清空能力判断缓存
 */
export const clearModelCapabilitiesCache = (): void => {
  modelCapabilitiesCache.clear();
};
