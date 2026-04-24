/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildAcpModelInfo, summarizeAcpModelInfo } from '../../src/process/agent/acp/modelInfo';
import type { AcpModelInfo } from '../../src/common/types/acpTypes';
import type { AcpSessionConfigOption, AcpSessionModels } from '../../src/types/acpTypes';

describe('buildAcpModelInfo', () => {
  it('prefers externally provided model info before ACP data', () => {
    const preferredModelInfo: AcpModelInfo = {
      current_model_id: 'claude-opus-4-6',
      current_model_label: 'Claude Opus 4.6',
      available_models: [
        { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
        { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      ],
      can_switch: false,
      source: 'models',
      source_detail: 'cc-switch',
    };

    const config_options: AcpSessionConfigOption[] = [
      {
        id: 'model',
        name: 'Model',
        category: 'model',
        type: 'select',
        current_value: 'gpt-5.4',
        options: [{ value: 'gpt-5.4', name: 'gpt-5.4' }],
      },
    ];

    const models: AcpSessionModels = {
      current_model_id: 'gpt-5.4/high',
      available_models: [{ model_id: 'gpt-5.4/high', name: 'gpt-5.4 (high)' }],
    };

    const result = buildAcpModelInfo(config_options, models, preferredModelInfo);

    expect(result).toEqual(preferredModelInfo);
  });

  it('prefers stable config_options model data when available', () => {
    const config_options: AcpSessionConfigOption[] = [
      {
        id: 'model',
        name: 'Model',
        category: 'model',
        type: 'select',
        current_value: 'gpt-5.4',
        options: [
          { value: 'gpt-5.3-codex', name: 'gpt-5.3-codex' },
          { value: 'gpt-5.4', name: 'gpt-5.4' },
        ],
      },
    ];

    const models: AcpSessionModels = {
      current_model_id: 'gpt-5.4/xhigh',
      available_models: [{ model_id: 'gpt-5.4/xhigh', name: 'gpt-5.4 (xhigh)' }],
    };

    const result = buildAcpModelInfo(config_options, models, {
      current_model_id: null,
      current_model_label: null,
      available_models: [],
      can_switch: false,
      source: 'models',
    });

    expect(result).toEqual({
      current_model_id: 'gpt-5.4',
      current_model_label: 'gpt-5.4',
      available_models: [
        { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
        { id: 'gpt-5.4', label: 'gpt-5.4' },
      ],
      can_switch: true,
      source: 'configOption',
      source_detail: 'acp-config-option',
      config_option_id: 'model',
    });
  });

  it('falls back to unstable models data and supports model_id fields', () => {
    const models: AcpSessionModels = {
      current_model_id: 'gpt-5.3-codex/high',
      available_models: [
        { model_id: 'gpt-5.3-codex/high', name: 'gpt-5.3-codex (high)' },
        { model_id: 'gpt-5.4/high', name: 'gpt-5.4 (high)' },
      ],
    };

    const result = buildAcpModelInfo(null, models);

    expect(result).toEqual({
      current_model_id: 'gpt-5.3-codex/high',
      current_model_label: 'gpt-5.3-codex (high)',
      available_models: [
        { id: 'gpt-5.3-codex/high', label: 'gpt-5.3-codex (high)' },
        { id: 'gpt-5.4/high', label: 'gpt-5.4 (high)' },
      ],
      can_switch: true,
      source: 'models',
      source_detail: 'acp-models',
    });
  });

  it('summarizes model info for diagnostics', () => {
    const summary = summarizeAcpModelInfo({
      current_model_id: 'gpt-5.4',
      current_model_label: 'gpt-5.4',
      available_models: [
        { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
        { id: 'gpt-5.4', label: 'gpt-5.4' },
      ],
      can_switch: true,
      source: 'configOption',
      source_detail: 'acp-config-option',
      config_option_id: 'model',
    });

    expect(summary).toEqual({
      source: 'configOption',
      source_detail: 'acp-config-option',
      current_model_id: 'gpt-5.4',
      current_model_label: 'gpt-5.4',
      availableModelCount: 2,
      can_switch: true,
      sampleModelIds: ['gpt-5.3-codex', 'gpt-5.4'],
    });
  });
});
