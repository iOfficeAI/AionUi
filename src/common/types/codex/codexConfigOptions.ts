/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import type { AcpBackend, AcpSessionConfigOption } from '@/common/types/acpTypes';

/**
 * Default Codex config options shown on the Guid page when a live ACP probe
 * hasn't populated cached configOptions yet.
 */
export const DEFAULT_CODEX_CONFIG_OPTIONS: AcpSessionConfigOption[] = [
  {
    id: 'model_reasoning_effort',
    name: 'Reasoning effort',
    category: 'reasoning',
    type: 'select',
    currentValue: 'medium',
    options: [
      { value: 'low', name: 'Low' },
      { value: 'medium', name: 'Medium' },
      { value: 'high', name: 'High' },
      { value: 'xhigh', name: 'Xhigh' },
    ],
  },
];

const DEFAULT_CHATGPT_REASONING_EFFORT = 'medium';

const CHATGPT_REASONING_EFFORT_OPTIONS = [
  { value: 'low', name: 'Low' },
  { value: 'medium', name: 'Medium' },
  { value: 'high', name: 'High' },
  { value: 'xhigh', name: 'Xhigh' },
];

const CHATGPT_REASONING_EFFORT_VALUES = new Set(CHATGPT_REASONING_EFFORT_OPTIONS.map((choice) => choice.value));

export function isChatgptReasoningEffortValue(value?: string | null): value is string {
  return typeof value === 'string' && CHATGPT_REASONING_EFFORT_VALUES.has(value);
}

export function createChatgptReasoningEffortConfigOption(currentValue?: string): AcpSessionConfigOption {
  return {
    id: 'reasoning_effort',
    name: 'Reasoning effort',
    category: 'reasoning',
    type: 'select',
    currentValue: isChatgptReasoningEffortValue(currentValue) ? currentValue : DEFAULT_CHATGPT_REASONING_EFFORT,
    options: CHATGPT_REASONING_EFFORT_OPTIONS.map((choice) => ({ ...choice })),
  };
}

export const DEFAULT_CHATGPT_CONFIG_OPTIONS: AcpSessionConfigOption[] = [createChatgptReasoningEffortConfigOption()];

export function getDefaultAcpConfigOptions(
  backend: AcpBackend | 'custom' | 'aionrs' | undefined,
  currentModel?: TProviderWithModel
): AcpSessionConfigOption[] {
  if (backend === 'codex') {
    return DEFAULT_CODEX_CONFIG_OPTIONS;
  }

  if (backend === 'aionrs' && currentModel?.platform === 'chatgpt') {
    return DEFAULT_CHATGPT_CONFIG_OPTIONS;
  }

  return [];
}
