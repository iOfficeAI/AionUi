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

// 全部后端类型定义 - 包括暂时不支持的
export type AcpBackendAll =
  | 'claude' // Claude ACP
  | 'gemini' // Google Gemini ACP
  | 'qwen' // Qwen Code ACP
  | 'openai' // OpenAI ACP (未来支持)
  | 'anthropic' // Anthropic ACP (未来支持)
  | 'cohere' // Cohere ACP (未来支持)
  | 'custom'; // 自定义 ACP 实现

// 后端配置接口
export interface AcpBackendConfig {
  id: string;
  name: string;
  cliCommand?: string;
  defaultCliPath?: string;
  supportedFeatures?: string[];
  authRequired?: boolean;
  enabled?: boolean; // 是否启用，用于控制后端的可用性
}

// 所有后端配置 - 包括暂时禁用的
export const ACP_BACKENDS_ALL: Record<AcpBackendAll, AcpBackendConfig> = {
  claude: {
    id: 'claude',
    name: 'Claude',
    cliCommand: 'claude',
    authRequired: true,
    supportedFeatures: ['text', 'files', 'tools'],
    enabled: true,
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    cliCommand: 'gemini',
    authRequired: true,
    supportedFeatures: ['text', 'files', 'tools'],
    enabled: false,
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen Code',
    cliCommand: 'qwen',
    defaultCliPath: 'npx @qwen-code/qwen-code',
    authRequired: true,
    supportedFeatures: ['text', 'files', 'tools'],
    enabled: true, // ✅ 已验证支持：Qwen CLI v0.0.10+ 支持 --experimental-acp
  },
  openai: {
    id: 'openai',
    name: 'OpenAI GPT',
    cliCommand: 'openai-acp',
    authRequired: true,
    supportedFeatures: ['text', 'files', 'tools'],
    enabled: false,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    cliCommand: 'anthropic-acp',
    authRequired: true,
    supportedFeatures: ['text', 'files', 'tools'],
    enabled: false,
  },
  cohere: {
    id: 'cohere',
    name: 'Cohere',
    cliCommand: 'cohere-acp',
    authRequired: true,
    supportedFeatures: ['text', 'files', 'tools'],
    enabled: false,
  },
  custom: {
    id: 'custom',
    name: 'Custom ACP',
    cliCommand: 'custom-acp',
    authRequired: true,
    supportedFeatures: ['text', 'files', 'tools'],
    enabled: false,
  },
};

// 仅启用的后端配置
export const ACP_ENABLED_BACKENDS: Record<string, AcpBackendConfig> = Object.fromEntries(Object.entries(ACP_BACKENDS_ALL).filter(([_, config]) => config.enabled));

// 当前启用的后端类型
export type AcpBackend = keyof typeof ACP_ENABLED_BACKENDS;
export type AcpBackendId = AcpBackend; // 向后兼容

// 工具函数
export function isValidAcpBackend(backend: string): backend is AcpBackend {
  return backend in ACP_ENABLED_BACKENDS;
}

export function getAcpBackendConfig(backend: AcpBackend): AcpBackendConfig {
  return ACP_ENABLED_BACKENDS[backend];
}

// 获取所有启用的后端配置
export function getEnabledAcpBackends(): AcpBackendConfig[] {
  return Object.values(ACP_ENABLED_BACKENDS);
}

// 获取所有后端配置（包括禁用的）
export function getAllAcpBackends(): AcpBackendConfig[] {
  return Object.values(ACP_BACKENDS_ALL);
}

// 检查后端是否启用
export function isAcpBackendEnabled(backend: AcpBackendAll): boolean {
  return ACP_BACKENDS_ALL[backend]?.enabled ?? false;
}

// ACP Error Type System - 优雅的错误处理
export enum AcpErrorType {
  CONNECTION_NOT_READY = 'CONNECTION_NOT_READY',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  UNKNOWN = 'UNKNOWN',
}

export interface AcpError {
  type: AcpErrorType;
  code: string;
  message: string;
  retryable: boolean;
  details?: any;
}

// ACP Result Type - Type-safe result handling
export type AcpResult<T = any> = { success: true; data: T } | { success: false; error: AcpError };

// Helper function to create ACP errors
export function createAcpError(type: AcpErrorType, message: string, retryable: boolean = false, details?: any): AcpError {
  return {
    type,
    code: type.toString(),
    message,
    retryable,
    details,
  };
}

export function isRetryableError(error: AcpError): boolean {
  return error.retryable || error.type === AcpErrorType.CONNECTION_NOT_READY;
}
