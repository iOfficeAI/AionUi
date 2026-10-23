/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type GatewayPlatform =
  | 'gemini'
  | 'anthropic'
  | 'openai'
  | 'groq'
  | 'deepseek'
  | 'openrouter'
  | 'omniroute'
  | 'custom';

export type GatewayAccount = {
  id: string;
  name: string;
  platform: GatewayPlatform;
  baseUrl: string;
  apiKey: string;
  models: string[];
  enabled: boolean;
  quotaLimit?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    requestsPerDay?: number;
  };
  quotaRemaining?: {
    requestsRemaining?: number;
    tokensRemaining?: number;
    resetTimestamp?: number;
    lastUpdated?: number;
  };
  status: 'active' | 'rate_limited' | 'error' | 'disabled';
  cooldownUntil?: number;
};

export type GatewayComboTarget = {
  accountId: string;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
};

export type GatewayCombo = {
  id: string;
  name: string;
  description?: string;
  strategy: 'priority' | 'round-robin';
  targets: GatewayComboTarget[];
  enabled: boolean;
};

export type GatewayTelemetryLog = {
  id: string;
  timestamp: number;
  caller?: string;
  requestedModelOrCombo: string;
  resolvedAccountId: string;
  resolvedAccountName: string;
  resolvedModel: string;
  fallbackAttempts: Array<{
    accountId: string;
    accountName: string;
    model: string;
    error: string;
    statusCode?: number;
  }>;
  tokens: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    thoughtTokens?: number;
    totalTokens: number;
  };
  latencyMs: number;
  statusCode: number;
  status: 'success' | 'fallback_success' | 'failed';
  costEstimate?: {
    amount: number;
    currency: string;
  };
};

export type GatewayStatus = {
  running: boolean;
  port: number;
  accountsCount: number;
  combosCount: number;
  activeCooldownsCount: number;
};
