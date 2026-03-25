/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * API 提供商主机配置
 * API Provider Host Configuration
 *
 * 集中管理各 AI 服务商的官方 API 主机名
 * Centralized management of official API hostnames for AI providers
 */
export const API_HOST_CONFIG = {
  /**
   * Google AI 官方主机
   * Google AI Official Hosts
   */
  google: {
    /** Gemini API (generativelanguage.googleapis.com) */
    gemini: 'generativelanguage.googleapis.com',
    /** Vertex AI (aiplatform.googleapis.com) */
    vertexAi: 'aiplatform.googleapis.com',
  },

  /**
   * OpenAI 官方主机
   * OpenAI Official Hosts
   */
  openai: {
    api: 'api.openai.com',
  },

  /**
   * Anthropic 官方主机
   * Anthropic Official Hosts
   */
  anthropic: {
    api: 'api.anthropic.com',
  },
} as const;

/**
 * Google API 主机白名单（从配置派生）
 * Google API Hosts Whitelist (derived from config)
 */
export const GOOGLE_API_HOSTS = Object.values(API_HOST_CONFIG.google);

/**
 * 安全验证 URL 是否为指定提供商的官方主机
 * Safely validate if URL is an official host for specified provider
 *
 * @param urlString - 要验证的 URL 字符串 / URL string to validate
 * @param allowedHosts - 允许的主机名列表 / List of allowed hostnames
 * @returns 如果是有效的官方主机返回 true / Returns true if valid official host
 */
export function isOfficialHost(urlString: string, allowedHosts: readonly string[]): boolean {
  try {
    const url = new URL(urlString);
    return allowedHosts.includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * 安全验证 URL 是否为 Google APIs 主机
 * Safely validate if URL is a Google APIs host
 *
 * 使用 URL 解析而非字符串包含检查，防止恶意 URL 绕过
 * Uses URL parsing instead of string includes to prevent malicious URL bypass
 *
 * @param urlString - 要验证的 URL 字符串 / URL string to validate
 * @returns 如果是有效的 Google APIs 主机返回 true / Returns true if valid Google APIs host
 *
 * @example
 * isGoogleApisHost('https://generativelanguage.googleapis.com/v1') // true
 * isGoogleApisHost('https://evil.com/generativelanguage.googleapis.com') // false
 * isGoogleApisHost('https://generativelanguage.googleapis.com.evil.com') // false
 */
export function isGoogleApisHost(urlString: string): boolean {
  return isOfficialHost(urlString, GOOGLE_API_HOSTS);
}

/**
 * 验证 URL 是否为 OpenAI 官方主机
 * Validate if URL is an official OpenAI host
 */
export function isOpenAIHost(urlString: string): boolean {
  return isOfficialHost(urlString, Object.values(API_HOST_CONFIG.openai));
}

/**
 * 验证 URL 是否为 Anthropic 官方主机
 * Validate if URL is an official Anthropic host
 */
export function isAnthropicHost(urlString: string): boolean {
  return isOfficialHost(urlString, Object.values(API_HOST_CONFIG.anthropic));
}
