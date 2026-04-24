/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { AcpSessionConfigOption } from '../../../../src/common/types/acpTypes';
import {
  filterSelectableCronConfigOptions,
  getCronConfigOptionTranslationKey,
  getCronConfigOptions,
  resolveCronAgentBackend,
  resolveCronInitialConfigValues,
  resolveCronInitialMode,
} from '../../../../src/renderer/pages/cron/cronAgentConfigUtils';

describe('resolveCronAgentBackend', () => {
  it('uses presetAgentType for preset assistants', () => {
    expect(
      resolveCronAgentBackend({
        backend: 'custom',
        customAgentId: 'assistant-1',
        isPreset: true,
        name: 'Codex Assistant',
        presetAgentType: 'codex',
      })
    ).toBe('codex');
  });

  it('falls back to the raw backend for non-preset agents', () => {
    expect(
      resolveCronAgentBackend({
        backend: 'claude',
        name: 'Claude Code',
      })
    ).toBe('claude');
  });
});

describe('resolveCronInitialMode', () => {
  it('keeps a persisted mode when it is still valid', () => {
    expect(resolveCronInitialMode('codex', { preferredMode: 'default' }, 'autoEdit')).toBe('autoEdit');
  });

  it('falls back to the saved preference when the persisted mode is unavailable', () => {
    expect(resolveCronInitialMode('claude', { preferredMode: 'plan' }, 'autoEdit')).toBe('plan');
  });

  it('maps legacy yoloMode config to the backend-specific mode value', () => {
    expect(resolveCronInitialMode('claude', { yoloMode: true })).toBe('bypassPermissions');
  });
});

describe('cron config option helpers', () => {
  const selectableOption: AcpSessionConfigOption = {
    id: 'model_reasoning_effort',
    name: 'Reasoning effort',
    type: 'select',
    category: 'reasoning',
    currentValue: 'medium',
    options: [
      { value: 'medium', name: 'Medium' },
      { value: 'high', name: 'High' },
    ],
  };
  const filteredOption: AcpSessionConfigOption = {
    id: 'model',
    name: 'Model',
    type: 'select',
    category: 'model',
    currentValue: 'gpt-5.4',
    options: [
      { value: 'gpt-5.4', name: 'gpt-5.4' },
      { value: 'gpt-5.3', name: 'gpt-5.3' },
    ],
  };

  it('filters out non-user-facing config options and keeps selectable ones', () => {
    expect(filterSelectableCronConfigOptions([selectableOption, filteredOption])).toEqual([selectableOption]);
  });

  it('uses cached config options first and falls back to codex defaults when needed', () => {
    expect(getCronConfigOptions('codex', { codex: [selectableOption] })).toEqual([selectableOption]);
    expect(getCronConfigOptions('codex')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'reasoning_effort',
        }),
      ])
    );
  });

  it('prefers persisted config values, then saved preferences, and ignores invalid values', () => {
    expect(
      resolveCronInitialConfigValues(
        [selectableOption],
        {
          model_reasoning_effort: 'high',
        },
        {
          model_reasoning_effort: 'invalid',
        }
      )
    ).toEqual({
      model_reasoning_effort: 'high',
    });
  });

  it('normalizes model-prefixed option ids to existing translation keys', () => {
    expect(getCronConfigOptionTranslationKey('model_reasoning_effort')).toBe('reasoning_effort');
    expect(getCronConfigOptionTranslationKey('output_format')).toBe('output_format');
  });
});
