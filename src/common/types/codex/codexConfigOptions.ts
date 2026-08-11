/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import type { AcpBackend, AcpModelInfo, AcpSessionConfigOption } from '@/common/types/acpTypes';

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

type CodexReasoningEffortConfig = {
  modelInfo?: AcpModelInfo | null;
  selectedModelId?: string | null;
  currentValue?: string;
};

function formatReasoningEffortName(value: string): string {
  if (value === 'xhigh') return 'Xhigh';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getCodexModelCapabilities(
  modelInfo?: AcpModelInfo | null,
  selectedModelId?: string | null
): AcpModelInfo['availableModels'][number] | undefined {
  const modelId = selectedModelId || modelInfo?.currentModelId;
  return modelId ? modelInfo?.availableModels.find((model) => model.id === modelId) : undefined;
}

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

/** Build a Codex reasoning selector from the selected model's app-server capabilities. */
export function createCodexReasoningEffortConfigOption(
  config: CodexReasoningEffortConfig = {}
): AcpSessionConfigOption {
  const model = getCodexModelCapabilities(config.modelInfo, config.selectedModelId);
  const supportedValues = Array.from(
    new Set(model?.supportedReasoningEfforts?.map((value) => value.trim()).filter(Boolean) || [])
  );
  const values = supportedValues.length > 0 ? supportedValues : REASONING_EFFORT_OPTIONS.map((choice) => choice.value);
  const defaultValue =
    (model?.defaultReasoningEffort && values.includes(model.defaultReasoningEffort)
      ? model.defaultReasoningEffort
      : undefined) || (values.includes(DEFAULT_REASONING_EFFORT) ? DEFAULT_REASONING_EFFORT : values[0]);
  const currentValue = config.currentValue && values.includes(config.currentValue) ? config.currentValue : defaultValue;

  return {
    id: CODEX_REASONING_EFFORT_CONFIG_ID,
    name: 'Reasoning effort',
    category: 'reasoning',
    type: 'select',
    currentValue,
    options: values.map((value) => ({ value, name: formatReasoningEffortName(value) })),
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
    return [createCodexReasoningEffortConfigOption()];
  }

  if (backend === 'aionrs' && currentModel?.platform === 'chatgpt') {
    return cloneConfigOptions(DEFAULT_CHATGPT_CONFIG_OPTIONS);
  }

  return [];
}
