/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import type { AcpBackend, AcpSessionConfigOption } from '@/common/types/acpTypes';

const DEFAULT_REASONING_EFFORT = 'medium';
const CODEX_REASONING_EFFORT_CONFIG_ID = 'reasoning_effort';
const LEGACY_CODEX_REASONING_EFFORT_CONFIG_ID = 'model_reasoning_effort';
const REASONING_EFFORT_OPTIONS = [
  { value: 'low', name: 'Low' },
  { value: 'medium', name: 'Medium' },
  { value: 'high', name: 'High' },
  { value: 'xhigh', name: 'Xhigh' },
];

const REASONING_EFFORT_VALUES = new Set(REASONING_EFFORT_OPTIONS.map((choice) => choice.value));

/**
 * Default Codex config options shown on the Guid page when a live ACP probe
 * hasn't populated cached configOptions yet.
 */
export const DEFAULT_CODEX_CONFIG_OPTIONS: AcpSessionConfigOption[] = [
  {
    id: CODEX_REASONING_EFFORT_CONFIG_ID,
    name: 'Reasoning effort',
    category: 'reasoning',
    type: 'select',
    currentValue: DEFAULT_REASONING_EFFORT,
    options: REASONING_EFFORT_OPTIONS,
  },
];

export function isChatgptReasoningEffortValue(value?: string | null): value is string {
  return typeof value === 'string' && REASONING_EFFORT_VALUES.has(value);
}

export function createChatgptReasoningEffortConfigOption(currentValue?: string): AcpSessionConfigOption {
  return {
    id: 'reasoning_effort',
    name: 'Reasoning effort',
    category: 'reasoning',
    type: 'select',
    currentValue: isChatgptReasoningEffortValue(currentValue) ? currentValue : DEFAULT_REASONING_EFFORT,
    options: REASONING_EFFORT_OPTIONS.map((choice) => ({ ...choice })),
  };
}

export const DEFAULT_CHATGPT_CONFIG_OPTIONS: AcpSessionConfigOption[] = [createChatgptReasoningEffortConfigOption()];

export function normalizeCodexConfigOptions(options: AcpSessionConfigOption[]): AcpSessionConfigOption[] {
  return options.map((option) =>
    option.id === LEGACY_CODEX_REASONING_EFFORT_CONFIG_ID ? { ...option, id: CODEX_REASONING_EFFORT_CONFIG_ID } : option
  );
}

export function normalizeCodexConfigOptionValues(values?: Record<string, string>): Record<string, string> {
  if (!values) {
    return {};
  }

  const next = { ...values };
  const legacyValue = next[LEGACY_CODEX_REASONING_EFFORT_CONFIG_ID];
  if (legacyValue && !next[CODEX_REASONING_EFFORT_CONFIG_ID]) {
    next[CODEX_REASONING_EFFORT_CONFIG_ID] = legacyValue;
  }
  delete next[LEGACY_CODEX_REASONING_EFFORT_CONFIG_ID];
  return next;
}

function cloneConfigOptions(options: AcpSessionConfigOption[]): AcpSessionConfigOption[] {
  return options.map((option) => ({
    ...option,
    options: option.options?.map((choice) => ({ ...choice })),
  }));
}

export function getDefaultAcpConfigOptions(
  backend: AcpBackend | 'custom' | undefined,
  currentModel?: TProviderWithModel
): AcpSessionConfigOption[] {
  if (backend === 'codex') {
    return cloneConfigOptions(DEFAULT_CODEX_CONFIG_OPTIONS);
  }

  if (backend === 'aionrs' && currentModel?.platform === 'chatgpt') {
    return cloneConfigOptions(DEFAULT_CHATGPT_CONFIG_OPTIONS);
  }

  return [];
}
