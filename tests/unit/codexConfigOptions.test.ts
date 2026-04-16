/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDefaultAcpConfigOptions } from '../../src/common/types/codex/codexConfigOptions';
import { describe, expect, it } from 'vitest';

describe('codex config options defaults', () => {
  it('provides Guid fallback reasoning options for codex', () => {
    expect(getDefaultAcpConfigOptions('codex')).toEqual([
      {
        id: 'model_reasoning_effort',
        name: 'Reasoning effort',
        category: 'reasoning',
        type: 'select',
        currentValue: 'medium',
        options: [
          { value: 'medium', name: 'Medium' },
          { value: 'high', name: 'High' },
          { value: 'xhigh', name: 'Maximum' },
        ],
      },
    ]);
  });

  it('does not expose fallback config options for other backends', () => {
    expect(getDefaultAcpConfigOptions('claude')).toEqual([]);
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
          { value: 'minimal', name: 'Minimal' },
          { value: 'low', name: 'Low' },
          { value: 'medium', name: 'Medium' },
          { value: 'high', name: 'High' },
        ],
      },
    ]);
  });
});
