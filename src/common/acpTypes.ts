/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ACP Backend 类型定义
 * 
 * 为了更好的扩展性，将所有支持的 ACP 后端定义在此处
 * 当需要支持新的后端时，只需要在这里添加即可
 */

// 方案1：简单扩展型 - 直接添加新的字面量类型
export type AcpBackend = 
  | 'claude'    // Claude ACP
  | 'gemini'    // Google Gemini ACP
  | 'openai'    // OpenAI ACP (未来支持)
  | 'anthropic' // Anthropic ACP (未来支持)
  | 'cohere'    // Cohere ACP (未来支持)
  | 'custom';   // 自定义 ACP 实现

// 方案2：配置驱动型 - 更灵活的配置结构
export interface AcpBackendConfig {
  id: string;
  name: string;
  cliCommand?: string;
  defaultCliPath?: string;
  supportedFeatures?: string[];
  authRequired?: boolean;
}

// 预定义的后端配置
export const ACP_BACKENDS: Record<string, AcpBackendConfig> = {
  claude: {
    id: 'claude',
    name: 'Claude',
    cliCommand: 'claude',
    authRequired: true,
    supportedFeatures: ['text', 'files', 'tools']
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    cliCommand: 'gemini',
    authRequired: true,
    supportedFeatures: ['text', 'files', 'tools']
  },
  // 未来可以轻松添加新的后端
  // openai: {
  //   id: 'openai',
  //   name: 'OpenAI GPT',
  //   cliCommand: 'openai-acp',
  //   authRequired: true,
  //   supportedFeatures: ['text', 'files', 'tools']
  // }
};

// 获取支持的后端 ID 列表
export type AcpBackendId = keyof typeof ACP_BACKENDS;

// 工具函数
export function isValidAcpBackend(backend: string): backend is AcpBackendId {
  return backend in ACP_BACKENDS;
}

export function getAcpBackendConfig(backend: AcpBackendId): AcpBackendConfig {
  return ACP_BACKENDS[backend];
}

export function getAllAcpBackends(): AcpBackendConfig[] {
  return Object.values(ACP_BACKENDS);
}