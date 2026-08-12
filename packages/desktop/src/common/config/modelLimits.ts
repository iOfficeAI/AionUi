/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Model token-limit defaults.
 *
 * Used to seed the three per-model limit fields
 * (`contextWindowSize`, `maxContentLength`, `maxResponseLength`) when the
 * user adds a new model. Once saved, defaults never overwrite the user's
 * values — see `docs/superpowers/specs/2026-08-12-model-token-defaults-design.md`.
 */

export type ProtocolFamily = 'openai' | 'anthropic' | 'gemini' | 'unknown';

export interface ModelLimits {
  contextWindowSize: number;
  maxContentLength: number;
  maxResponseLength: number;
}

export const MODEL_NAME_LIMIT_DEFAULTS: ReadonlyArray<{
  pattern: RegExp;
  limits: ModelLimits;
}> = [
  // OpenAI
  {
    pattern: /^gpt-4o(-mini)?$/i,
    limits: { contextWindowSize: 128000, maxContentLength: 100000, maxResponseLength: 4096 },
  },
  {
    pattern: /^gpt-4\.1(-mini)?$/i,
    limits: { contextWindowSize: 1000000, maxContentLength: 900000, maxResponseLength: 4096 },
  },
  {
    pattern: /^gpt-4-turbo/i,
    limits: { contextWindowSize: 128000, maxContentLength: 100000, maxResponseLength: 4096 },
  },
  {
    pattern: /^o1(-mini|-preview)?$/i,
    limits: { contextWindowSize: 200000, maxContentLength: 180000, maxResponseLength: 32768 },
  },
  {
    pattern: /^o3(-mini)?(-pro)?$/i,
    limits: { contextWindowSize: 200000, maxContentLength: 180000, maxResponseLength: 32768 },
  },
  {
    pattern: /^o4-mini$/i,
    limits: { contextWindowSize: 200000, maxContentLength: 180000, maxResponseLength: 32768 },
  },

  // Anthropic
  {
    pattern: /^claude-(3-5|3-7|sonnet-4|opus-4|haiku-4)/i,
    limits: { contextWindowSize: 200000, maxContentLength: 180000, maxResponseLength: 8192 },
  },
  {
    pattern: /^claude-3-opus/i,
    limits: { contextWindowSize: 200000, maxContentLength: 180000, maxResponseLength: 4096 },
  },
  {
    pattern: /^claude-3-haiku/i,
    limits: { contextWindowSize: 200000, maxContentLength: 180000, maxResponseLength: 4096 },
  },

  // Gemini
  {
    pattern: /^gemini-1\.5-pro/i,
    limits: { contextWindowSize: 1000000, maxContentLength: 900000, maxResponseLength: 8192 },
  },
  {
    pattern: /^gemini-1\.5-flash/i,
    limits: { contextWindowSize: 1000000, maxContentLength: 900000, maxResponseLength: 8192 },
  },
  {
    pattern: /^gemini-2\./i,
    limits: { contextWindowSize: 1000000, maxContentLength: 900000, maxResponseLength: 8192 },
  },

  // DeepSeek
  {
    pattern: /^deepseek-(v3|r1|chat|coder)/i,
    limits: { contextWindowSize: 1000000, maxContentLength: 615000, maxResponseLength: 384000 },
  },

  // Qwen
  {
    pattern: /^qwen-(2\.5|3|max|long)/i,
    limits: { contextWindowSize: 128000, maxContentLength: 100000, maxResponseLength: 4096 },
  },
];

export const PROTOCOL_LIMIT_DEFAULTS: Readonly<Record<ProtocolFamily, ModelLimits>> = {
  openai: { contextWindowSize: 128000, maxContentLength: 100000, maxResponseLength: 4096 },
  anthropic: { contextWindowSize: 200000, maxContentLength: 180000, maxResponseLength: 8192 },
  gemini: { contextWindowSize: 1000000, maxContentLength: 900000, maxResponseLength: 8192 },
  unknown: { contextWindowSize: 32000, maxContentLength: 24000, maxResponseLength: 4096 },
};

export const SYSTEM_LIMIT_DEFAULTS: ModelLimits = PROTOCOL_LIMIT_DEFAULTS.unknown;

export const resolveModelLimits = (modelName: string | undefined, protocol: ProtocolFamily): ModelLimits => {
  if (modelName) {
    const match = MODEL_NAME_LIMIT_DEFAULTS.find((entry) => entry.pattern.test(modelName));
    if (match) return match.limits;
  }
  return PROTOCOL_LIMIT_DEFAULTS[protocol];
};
