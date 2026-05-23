/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpSessionConfigOption } from './acpTypes';

export const CLAUDE_REASONING_EFFORT_CONFIG_ID = 'effort';
export const CODEX_REASONING_EFFORT_CONFIG_ID = 'model_reasoning_effort';
export const AIONRS_REASONING_EFFORT_CONFIG_ID = 'effort';

export type ReasoningEffortLevel = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

type ReasoningEffortSpec = {
  id: string;
  defaultValue: ReasoningEffortLevel;
  levels: ReasoningEffortLevel[];
};

const REASONING_EFFORT_LEVELS = new Set<ReasoningEffortLevel>(['none', 'low', 'medium', 'high', 'xhigh', 'max']);

const CLAUDE_REASONING_EFFORT_SPEC: ReasoningEffortSpec = {
  id: CLAUDE_REASONING_EFFORT_CONFIG_ID,
  defaultValue: 'medium',
  levels: ['low', 'medium', 'high', 'xhigh', 'max'],
};

const CODEX_REASONING_EFFORT_SPEC: ReasoningEffortSpec = {
  id: CODEX_REASONING_EFFORT_CONFIG_ID,
  defaultValue: 'medium',
  levels: ['low', 'medium', 'high', 'xhigh'],
};

const CODEX_GPT5_REASONING_EFFORT_SPEC: ReasoningEffortSpec = {
  id: CODEX_REASONING_EFFORT_CONFIG_ID,
  defaultValue: 'medium',
  levels: ['low', 'medium', 'high'],
};

const CODEX_GPT51_REASONING_EFFORT_SPEC: ReasoningEffortSpec = {
  id: CODEX_REASONING_EFFORT_CONFIG_ID,
  defaultValue: 'none',
  levels: ['none', 'low', 'medium', 'high'],
};

const CODEX_GPT51_CODEX_REASONING_EFFORT_SPEC: ReasoningEffortSpec = {
  id: CODEX_REASONING_EFFORT_CONFIG_ID,
  defaultValue: 'medium',
  levels: ['medium', 'high'],
};

const CODEX_GPT51_CODEX_MAX_REASONING_EFFORT_SPEC: ReasoningEffortSpec = {
  id: CODEX_REASONING_EFFORT_CONFIG_ID,
  defaultValue: 'medium',
  levels: ['medium', 'high', 'xhigh'],
};

const AIONRS_REASONING_EFFORT_SPEC: ReasoningEffortSpec = {
  id: AIONRS_REASONING_EFFORT_CONFIG_ID,
  defaultValue: 'medium',
  levels: ['low', 'medium', 'high'],
};

const CODEX_REASONING_EFFORT_BY_MODEL: Record<string, ReasoningEffortSpec> = {
  'gpt-5': CODEX_GPT5_REASONING_EFFORT_SPEC,
  'gpt-5-codex': CODEX_GPT5_REASONING_EFFORT_SPEC,
  'gpt-5.1': CODEX_GPT51_REASONING_EFFORT_SPEC,
  'gpt-5.1-codex': CODEX_GPT51_CODEX_REASONING_EFFORT_SPEC,
  'gpt-5.1-codex-mini': CODEX_GPT51_CODEX_REASONING_EFFORT_SPEC,
  'gpt-5.1-codex-max': CODEX_GPT51_CODEX_MAX_REASONING_EFFORT_SPEC,
  'gpt-5.4': CODEX_REASONING_EFFORT_SPEC,
  'gpt-5.4-mini': CODEX_REASONING_EFFORT_SPEC,
  'gpt-5.3-codex': CODEX_REASONING_EFFORT_SPEC,
  'gpt-5.2-codex': CODEX_REASONING_EFFORT_SPEC,
  'gpt-5.2': CODEX_REASONING_EFFORT_SPEC,
  'codex-auto-review': CODEX_REASONING_EFFORT_SPEC,
};

function buildReasoningEffortOption(spec: ReasoningEffortSpec): AcpSessionConfigOption {
  return {
    id: spec.id,
    name: 'Reasoning Effort',
    category: 'thought_level',
    type: 'select',
    currentValue: spec.defaultValue,
    selectedValue: spec.defaultValue,
    options: spec.levels.map((level) => ({ value: level, name: level })),
  };
}

function isReasoningEffortOption(option: AcpSessionConfigOption): boolean {
  return (
    option.category === 'thought_level' ||
    option.id === CLAUDE_REASONING_EFFORT_CONFIG_ID ||
    option.id === CODEX_REASONING_EFFORT_CONFIG_ID ||
    option.id === 'reasoning_effort'
  );
}

export function resolveSelectedAcpConfigOptionValue(option: AcpSessionConfigOption): string | undefined {
  const candidates = [option.currentValue, option.selectedValue];
  if (option.type === 'select' && option.options?.length) {
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && option.options.some((choice) => choice.value === candidate)) {
        return candidate;
      }
    }
    const fallback = isReasoningEffortOption(option)
      ? option.options.find((choice) => choice.value === 'medium') || option.options[0]
      : option.options[0];
    return typeof fallback?.value === 'string' ? fallback.value : undefined;
  }

  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return typeof value === 'string' ? value : undefined;
}

function normalizeCodexModelId(modelId: string | undefined): string | undefined {
  const trimmed = modelId?.trim();
  if (!trimmed) return undefined;
  return trimmed.split('/')[0];
}

function resolveCodexReasoningEffortSpec(modelId?: string): ReasoningEffortSpec {
  const normalizedModelId = normalizeCodexModelId(modelId);
  return (normalizedModelId && CODEX_REASONING_EFFORT_BY_MODEL[normalizedModelId]) || CODEX_REASONING_EFFORT_SPEC;
}

function resolveReasoningEffortSpec(backend: string, modelId?: string): ReasoningEffortSpec | undefined {
  if (backend === 'claude') return CLAUDE_REASONING_EFFORT_SPEC;
  if (backend === 'codex') return resolveCodexReasoningEffortSpec(modelId);
  if (backend === 'aionrs') return AIONRS_REASONING_EFFORT_SPEC;
  return undefined;
}

export function getDefaultAcpConfigOptions(backend: string, modelId?: string): AcpSessionConfigOption[] {
  const spec = resolveReasoningEffortSpec(backend, modelId);
  return spec ? [buildReasoningEffortOption(spec)] : [];
}

export function mergeDefaultAcpConfigOptions(
  backend: string,
  modelId: string | undefined,
  configOptions: AcpSessionConfigOption[]
): AcpSessionConfigOption[] {
  const defaults = getDefaultAcpConfigOptions(backend, modelId);
  if (defaults.length === 0) return configOptions;

  const merged = [...configOptions];
  for (const defaultOption of defaults) {
    const hasEquivalentOption = merged.some(
      (option) =>
        option.id === defaultOption.id || (isReasoningEffortOption(option) && isReasoningEffortOption(defaultOption))
    );
    if (!hasEquivalentOption) {
      merged.push(defaultOption);
    }
  }
  return merged;
}

export function applyPreferredAcpConfigOptions(
  configOptions: AcpSessionConfigOption[],
  preferredConfigOptions?: Record<string, string>
): AcpSessionConfigOption[] {
  if (!preferredConfigOptions || Object.keys(preferredConfigOptions).length === 0) return configOptions;

  return configOptions.map((option) => {
    const preferred = preferredConfigOptions[option.id];
    if (!preferred) return option;
    if (option.type === 'select' && option.options?.length) {
      const isSupported = option.options.some((choice) => choice.value === preferred);
      if (!isSupported) return option;
    }
    return { ...option, currentValue: preferred, selectedValue: preferred };
  });
}

export function getSelectedAcpConfigOptionValues(
  configOptions: AcpSessionConfigOption[],
  preferredConfigOptions?: Record<string, string>
): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const option of applyPreferredAcpConfigOptions(configOptions, preferredConfigOptions)) {
    if (option.category === 'model' || option.category === 'mode') continue;
    const value = resolveSelectedAcpConfigOptionValue(option);
    if (value) {
      selected[option.id] = value;
    }
  }
  return selected;
}

export function isReasoningEffortLevel(value: string): value is ReasoningEffortLevel {
  return REASONING_EFFORT_LEVELS.has(value as ReasoningEffortLevel);
}
