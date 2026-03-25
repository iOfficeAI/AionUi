/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildAcpModelInfo, summarizeAcpModelInfo } from '../../src/process/agent/acp/modelInfo';
import type { AcpSessionConfigOption, AcpSessionModels } from '../../src/types/acpTypes';

describe('buildAcpModelInfo', () => {
  it('prefers stable configOptions model data when available', () => {
    const configOptions: AcpSessionConfigOption[] = [
      {
        id: 'model',
        name: 'Model',
        category: 'model',
        type: 'select',
        currentValue: 'gpt-5.4',
        options: [
          { value: 'gpt-5.3-codex', name: 'gpt-5.3-codex' },
          { value: 'gpt-5.4', name: 'gpt-5.4' },
        ],
      },
    ];

    const models: AcpSessionModels = {
      currentModelId: 'gpt-5.4/xhigh',
      availableModels: [{ modelId: 'gpt-5.4/xhigh', name: 'gpt-5.4 (xhigh)' }],
    };

    const result = buildAcpModelInfo(configOptions, models);

    expect(result).toEqual({
      currentModelId: 'gpt-5.4',
      currentModelLabel: 'gpt-5.4',
      availableModels: [
        { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
        { id: 'gpt-5.4', label: 'gpt-5.4' },
      ],
      canSwitch: true,
      source: 'configOption',
      configOptionId: 'model',
    });
  });

  it('falls back to unstable models data and supports modelId fields', () => {
    const models: AcpSessionModels = {
      currentModelId: 'gpt-5.3-codex/high',
      availableModels: [
        { modelId: 'gpt-5.3-codex/high', name: 'gpt-5.3-codex (high)' },
        { modelId: 'gpt-5.4/high', name: 'gpt-5.4 (high)' },
      ],
    };

    const result = buildAcpModelInfo(null, models);

    expect(result).toEqual({
      currentModelId: 'gpt-5.3-codex/high',
      currentModelLabel: 'gpt-5.3-codex (high)',
      availableModels: [
        { id: 'gpt-5.3-codex/high', label: 'gpt-5.3-codex (high)' },
        { id: 'gpt-5.4/high', label: 'gpt-5.4 (high)' },
      ],
      canSwitch: true,
      source: 'models',
    });
  });

  it('summarizes model info for diagnostics', () => {
    const summary = summarizeAcpModelInfo({
      currentModelId: 'gpt-5.4',
      currentModelLabel: 'gpt-5.4',
      availableModels: [
        { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
        { id: 'gpt-5.4', label: 'gpt-5.4' },
      ],
      canSwitch: true,
      source: 'configOption',
      configOptionId: 'model',
    });

    expect(summary).toEqual({
      source: 'configOption',
      currentModelId: 'gpt-5.4',
      currentModelLabel: 'gpt-5.4',
      availableModelCount: 2,
      canSwitch: true,
      sampleModelIds: ['gpt-5.3-codex', 'gpt-5.4'],
    });
  });
});
