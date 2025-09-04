/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@office-ai/aioncli-core';

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

  // 其他所有平台默认使用OpenAI兼容协议
  // 包括：OpenRouter, OpenAI, DeepSeek, Anthropic, Claude, 等
  return AuthType.USE_OPENAI;
}

/**
 * 获取provider的认证类型，优先使用明确指定的authType，否则根据platform推断
 * @param provider 包含platform和可选authType的provider配置
 * @returns 认证类型
 */
export function getProviderAuthType(provider: { platform: string; authType?: AuthType }): AuthType {
  // 如果明确指定了authType，直接使用
  if (provider.authType) {
    return provider.authType;
  }

  // 否则根据platform推断
  return getAuthTypeFromPlatform(provider.platform);
}
