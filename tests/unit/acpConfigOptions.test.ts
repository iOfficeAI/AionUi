/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  CLAUDE_REASONING_EFFORT_CONFIG_ID,
  CODEX_REASONING_EFFORT_CONFIG_ID,
  applyPreferredAcpConfigOptions,
  getSelectedAcpConfigOptionValues,
  getDefaultAcpConfigOptions,
  isReasoningEffortLevel,
} from '@/common/types/acpConfigOptions';

function getCodexReasoningLevels(modelId: string): string[] {
  const option = getDefaultAcpConfigOptions('codex', modelId)[0];
  expect(option?.id).toBe(CODEX_REASONING_EFFORT_CONFIG_ID);
  return option.options?.map((choice) => choice.value) || [];
}

describe('getDefaultAcpConfigOptions', () => {
  it('uses raw Claude CLI effort levels including max', () => {
    const option = getDefaultAcpConfigOptions('claude')[0];

    expect(option?.id).toBe(CLAUDE_REASONING_EFFORT_CONFIG_ID);
    expect(option.currentValue).toBe('medium');
    expect(option.selectedValue).toBe('medium');
    expect(option.options?.map((choice) => choice.value)).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(option.options?.map((choice) => choice.name)).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('accepts only canonical reasoning effort values used by the UI', () => {
    expect(isReasoningEffortLevel('none')).toBe(true);
    expect(isReasoningEffortLevel('low')).toBe(true);
    expect(isReasoningEffortLevel('medium')).toBe(true);
    expect(isReasoningEffortLevel('high')).toBe(true);
    expect(isReasoningEffortLevel('xhigh')).toBe(true);
    expect(isReasoningEffortLevel('max')).toBe(true);
    expect(isReasoningEffortLevel('middle')).toBe(false);
    expect(isReasoningEffortLevel('minimal')).toBe(false);
  });

  it('ignores saved reasoning effort values that are not in the real option list', () => {
    const [option] = applyPreferredAcpConfigOptions(getDefaultAcpConfigOptions('claude'), {
      effort: 'middle',
    });

    expect(option.currentValue).toBe('medium');
    expect(option.selectedValue).toBe('medium');
  });

  it('extracts only real selected config option values for backend application', () => {
    const selected = getSelectedAcpConfigOptionValues(getDefaultAcpConfigOptions('codex', 'gpt-5.4'), {
      model_reasoning_effort: 'middle',
    });

    expect(selected).toEqual({ model_reasoning_effort: 'medium' });
  });

  it('falls back to medium when cached reasoning effort current value is invalid', () => {
    const selected = getSelectedAcpConfigOptionValues([
      {
        id: 'model_reasoning_effort',
        name: 'Reasoning Effort',
        category: 'thought_level',
        type: 'select',
        currentValue: 'middle',
        selectedValue: 'middle',
        options: [
          { value: 'low', name: 'low' },
          { value: 'medium', name: 'medium' },
          { value: 'high', name: 'high' },
        ],
      },
    ]);

    expect(selected).toEqual({ model_reasoning_effort: 'medium' });
  });

  it('uses GPT-5 base reasoning levels for legacy Codex model IDs', () => {
    expect(getCodexReasoningLevels('gpt-5-codex')).toEqual(['low', 'medium', 'high']);
  });

  it('uses GPT-5.1 Codex reasoning levels without low or xhigh', () => {
    expect(getCodexReasoningLevels('gpt-5.1-codex-mini')).toEqual(['medium', 'high']);
  });

  it('uses GPT-5.1 Codex Max reasoning levels with xhigh', () => {
    expect(getCodexReasoningLevels('gpt-5.1-codex-max')).toEqual(['medium', 'high', 'xhigh']);
  });

  it('uses GPT-5.2 and newer Codex reasoning levels with low and xhigh', () => {
    expect(getCodexReasoningLevels('gpt-5.3-codex/high')).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(getCodexReasoningLevels('gpt-5.4')).toEqual(['low', 'medium', 'high', 'xhigh']);
  });

  it('uses raw labels for Codex reasoning levels', () => {
    const option = getDefaultAcpConfigOptions('codex', 'gpt-5.4')[0];

    expect(option.options?.map((choice) => choice.name)).toEqual(['low', 'medium', 'high', 'xhigh']);
  });

  it('uses GPT-5.1 base reasoning levels with none', () => {
    const option = getDefaultAcpConfigOptions('codex', 'gpt-5.1')[0];

    expect(option.currentValue).toBe('none');
    expect(option.selectedValue).toBe('none');
    expect(option.options?.map((choice) => choice.value)).toEqual(['none', 'low', 'medium', 'high']);
  });

  it('does not invent default reasoning levels for ACP backends without known support', () => {
    expect(getDefaultAcpConfigOptions('qwen')).toEqual([]);
    expect(getDefaultAcpConfigOptions('custom')).toEqual([]);
  });
});
