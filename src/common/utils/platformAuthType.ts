/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@office-ai/aioncli-core';
import { isNewApiPlatform } from './platformConstants';

/**
 * 根据平台名称获取对应的认证类型
 * @param platform 平台名称
 * @returns 对应的AuthType
 */
export function getAuthTypeFromPlatform(platform: string): AuthType {
  const platformLower = platform?.toLowerCase() || '';

  // Gemini 相关平台
  if (platformLower.includes('gemini-with-google-auth')) {
    return AuthType.LOGIN_WITH_GOOGLE;
  }
  if (platformLower.includes('gemini-vertex-ai') || platformLower.includes('vertex-ai')) {
    return AuthType.USE_VERTEX_AI;
  }
  if (platformLower.includes('gemini') || platformLower.includes('google')) {
    return AuthType.USE_GEMINI;
  }

  // Anthropic/Claude 相关平台
  if (platformLower.includes('anthropic') || platformLower.includes('claude')) {
    return AuthType.USE_ANTHROPIC;
  }

  // New API 网关默认使用 OpenAI 兼容协议（per-model 协议由 getProviderAuthType 处理）
  // New API gateway defaults to OpenAI compatible (per-model protocol handled by getProviderAuthType)
  // 其他所有平台默认使用OpenAI兼容协议
  // 包括：OpenRouter, OpenAI, DeepSeek, new-api, 等
  return AuthType.USE_OPENAI;
}

/**
 * 获取provider的认证类型，优先使用明确指定的authType，否则根据platform推断
 * 对于 new-api 平台，支持基于模型名称的协议覆盖
 * Get provider auth type, prefer explicit authType, otherwise infer from platform
 * For new-api platform, supports per-model protocol overrides
 * @param provider 包含platform和可选authType的provider配置
 * @returns 认证类型
 */
export function getProviderAuthType(provider: { platform: string; authType?: AuthType; modelProtocols?: Record<string, string>; useModel?: string }): AuthType {
  // 如果明确指定了authType，直接使用
  if (provider.authType) {
    return provider.authType;
  }

  // new-api 平台：根据模型名称查找协议覆盖
  // new-api platform: look up per-model protocol override
  if (isNewApiPlatform(provider.platform) && provider.useModel && provider.modelProtocols) {
    const protocol = provider.modelProtocols[provider.useModel];
    if (protocol) {
      return getAuthTypeFromPlatform(protocol);
    }
  }

  // 否则根据platform推断
  return getAuthTypeFromPlatform(provider.platform);
}
