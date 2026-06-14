/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { normalizeAcpModelId, normalizeAcpModelInfo } from '@/renderer/utils/model/normalizeAcpModelInfo';

describe('normalizeAcpModelId', () => {
  it('strips /enabled and /disabled suffixes', () => {
    expect(normalizeAcpModelId('glm-5.1/enabled')).toBe('glm-5.1');
    expect(normalizeAcpModelId('glm-5.1/disabled')).toBe('glm-5.1');
    expect(normalizeAcpModelId('GLM-5.1/Enabled')).toBe('GLM-5.1');
  });

  it('keeps clean ids untouched', () => {
    expect(normalizeAcpModelId('claude-sonnet-4-5')).toBe('claude-sonnet-4-5');
    expect(normalizeAcpModelId('vendor/model-name')).toBe('vendor/model-name');
  });
});

describe('normalizeAcpModelInfo', () => {
  it('returns null for null input', () => {
    expect(normalizeAcpModelInfo(null)).toBeNull();
  });

  it('deduplicates suffixed duplicates and cleans labels (issue #3297)', () => {
    const result = normalizeAcpModelInfo({
      current_model_id: 'glm-5.1/enabled',
      current_model_label: 'GLM-5.1 (enabled)',
      available_models: [
        { id: 'glm-5.1/enabled', label: 'GLM-5.1 (enabled)' },
        { id: 'glm-5.1/disabled', label: 'GLM-5.1 (disabled)' },
        { id: 'kimi-k2.6/enabled', label: 'Kimi K2.6 (enabled)' },
        { id: 'kimi-k2.6/disabled', label: 'Kimi K2.6 (disabled)' },
      ],
    });
    expect(result).toEqual({
      current_model_id: 'glm-5.1',
      current_model_label: 'GLM-5.1',
      available_models: [
        { id: 'glm-5.1', label: 'GLM-5.1' },
        { id: 'kimi-k2.6', label: 'Kimi K2.6' },
      ],
    });
  });

  it('prefers the /enabled variant when /disabled comes first', () => {
    const result = normalizeAcpModelInfo({
      current_model_id: null,
      current_model_label: null,
      available_models: [
        { id: 'glm-5.0/disabled', label: 'GLM-5.0 (disabled)' },
        { id: 'glm-5.0/enabled', label: 'GLM-5.0 (enabled)' },
      ],
    });
    expect(result.available_models).toEqual([{ id: 'glm-5.0', label: 'GLM-5.0' }]);
  });

  it('leaves a clean model list unchanged', () => {
    const info = {
      current_model_id: 'claude-sonnet-4-5',
      current_model_label: 'Claude Sonnet 4.5',
      available_models: [
        { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
        { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      ],
    };
    expect(normalizeAcpModelInfo(info)).toEqual(info);
  });

  it('keeps the first entry when exact duplicates appear without suffixes', () => {
    const result = normalizeAcpModelInfo({
      current_model_id: null,
      current_model_label: null,
      available_models: [
        { id: 'glm-5.1', label: 'GLM-5.1' },
        { id: 'glm-5.1', label: 'GLM-5.1 copy' },
      ],
    });
    expect(result.available_models).toEqual([{ id: 'glm-5.1', label: 'GLM-5.1' }]);
  });

  it('preserves null current model fields', () => {
    const result = normalizeAcpModelInfo({
      current_model_id: null,
      current_model_label: null,
      available_models: [{ id: 'glm-5.1/enabled', label: 'GLM-5.1 (enabled)' }],
    });
    expect(result.current_model_id).toBeNull();
    expect(result.current_model_label).toBeNull();
  });

  it('falls back to the clean id when label is empty', () => {
    const result = normalizeAcpModelInfo({
      current_model_id: null,
      current_model_label: null,
      available_models: [{ id: 'glm-5.1/enabled', label: '' }],
    });
    expect(result.available_models).toEqual([{ id: 'glm-5.1', label: 'glm-5.1' }]);
  });
});
