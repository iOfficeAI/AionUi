/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type {
  GatewayAccount,
  GatewayCombo,
  GatewayComboTarget,
  GatewayPlatform,
  GatewayStatus,
  GatewayTelemetryLog,
} from '@/common/types/gateway/gatewayTypes';

export const GATEWAY_PLATFORM_OPTIONS: Array<{
  value: import('@/common/types/gateway/gatewayTypes').GatewayPlatform;
  label: string;
  defaultUrl: string;
  defaultModels: string[];
}> = [
  {
    value: 'gemini',
    label: 'Google Gemini',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  },
  {
    value: 'anthropic',
    label: 'Anthropic Claude',
    defaultUrl: 'https://api.anthropic.com/v1',
    defaultModels: ['claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku'],
  },
  {
    value: 'openai',
    label: 'OpenAI',
    defaultUrl: 'https://api.openai.com/v1',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    defaultUrl: 'https://api.deepseek.com/v1',
    defaultModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    value: 'groq',
    label: 'Groq',
    defaultUrl: 'https://api.groq.com/openai/v1',
    defaultModels: ['llama-3.3-70b-versatile', 'deepseek-r1-distill-llama-70b'],
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    defaultUrl: 'https://openrouter.ai/api/v1',
    defaultModels: ['anthropic/claude-3.7-sonnet', 'deepseek/deepseek-r1', 'google/gemini-2.5-pro'],
  },
  {
    value: 'omniroute',
    label: 'OmniRoute (Google Antigravity / Claude)',
    defaultUrl: 'http://localhost:20128/v1',
    defaultModels: [
      'antigravity/claude-sonnet-4-6',
      'antigravity/claude-opus-4-6-thinking',
      'antigravity/gemini-3.8-flash-tiered',
      'antigravity/gemini-3-flash',
      'antigravity/gemini-3.5-flash-lite',
      'claude-web/claude-sonnet-4-6',
    ],
  },
  {
    value: 'custom',
    label: 'Custom OpenAI-Compatible',
    defaultUrl: 'http://localhost:11434/v1',
    defaultModels: ['default'],
  },
];
