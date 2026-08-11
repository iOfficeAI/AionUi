/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createCodexReasoningEffortConfigOption,
  getDefaultAcpConfigOptions,
  normalizeCodexConfigOptions,
  normalizeCodexConfigOptionValues,
} from '../../src/common/types/codex/codexConfigOptions';
import { describe, expect, it } from 'vitest';

describe('codex config options defaults', () => {
  it('provides Guid fallback reasoning options for codex', () => {
    expect(getDefaultAcpConfigOptions('codex')).toEqual([
      {
        id: 'reasoning_effort',
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
    ]);
  });

  it('does not expose fallback config options for other backends', () => {
    expect(getDefaultAcpConfigOptions('claude')).toEqual([]);
  });

  it('uses the selected Codex model reasoning capabilities', () => {
    expect(
      createCodexReasoningEffortConfigOption({
        modelInfo: {
          currentModelId: 'gpt-5.6-sol',
          currentModelLabel: 'GPT-5.6 Sol',
          availableModels: [
            {
              id: 'gpt-5.6-sol',
              label: 'GPT-5.6 Sol',
              supportedReasoningEfforts: ['low', 'medium', 'xhigh', 'max', 'ultra'],
              defaultReasoningEffort: 'low',
            },
          ],
          canSwitch: false,
          source: 'models',
        },
        currentValue: 'max',
      })
    ).toMatchObject({
      currentValue: 'max',
      options: [
        { value: 'low', name: 'Low' },
        { value: 'medium', name: 'Medium' },
        { value: 'xhigh', name: 'Xhigh' },
        { value: 'max', name: 'Max' },
        { value: 'ultra', name: 'Ultra' },
      ],
    });
  });

  it('falls back to the model default when the selected effort is unsupported', () => {
    expect(
      createCodexReasoningEffortConfigOption({
        modelInfo: {
          currentModelId: 'gpt-5.5',
          currentModelLabel: 'GPT-5.5',
          availableModels: [
            {
              id: 'gpt-5.5',
              label: 'GPT-5.5',
              supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
              defaultReasoningEffort: 'medium',
            },
          ],
          canSwitch: false,
          source: 'models',
        },
        currentValue: 'max',
      })
    ).toMatchObject({
      currentValue: 'medium',
      options: expect.not.arrayContaining([expect.objectContaining({ value: 'max' })]),
    });
  });

  it('normalizes legacy codex reasoning option ids from existing caches', () => {
    expect(
      normalizeCodexConfigOptions([
        {
          id: 'model_reasoning_effort',
          name: 'Reasoning effort',
          category: 'reasoning',
          type: 'select',
          currentValue: 'high',
          options: [{ value: 'high', name: 'High' }],
        },
      ])
    ).toEqual([
      expect.objectContaining({
        id: 'reasoning_effort',
        currentValue: 'high',
      }),
    ]);

    expect(normalizeCodexConfigOptionValues({ model_reasoning_effort: 'high' })).toEqual({
      reasoning_effort: 'high',
    });
  });

  it('provides Guid fallback reasoning options for aionrs ChatGPT models', () => {
    expect(
      getDefaultAcpConfigOptions('aionrs', {
        id: 'chatgpt-provider',
        name: 'ChatGPT',
        platform: 'chatgpt',
        useModel: 'gpt-5',
        baseUrl: 'https://chatgpt.com',
        apiKey: '',
      })
    ).toEqual([
      {
        id: 'reasoning_effort',
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
    ]);
  });
});
