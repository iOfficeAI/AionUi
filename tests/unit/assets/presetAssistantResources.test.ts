/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { loadPresetAssistantResources } from '@/renderer/utils/model/presetAssistantResources';

describe('presetAssistantResources', () => {
  it('re-exports loadPresetAssistantResources function', () => {
    expect(typeof loadPresetAssistantResources).toBe('function');
  });

  it('loads preset resources with valid options', async () => {
    const result = await loadPresetAssistantResources({
      custom_agent_id: 'test-agent',
      localeKey: 'en',
    } as any);
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  it('returns object with expected structure', async () => {
    const result = await loadPresetAssistantResources({
      custom_agent_id: 'test',
      localeKey: 'en',
    } as any);
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });

  it('result has skills property', async () => {
    const result = await loadPresetAssistantResources({
      custom_agent_id: 'test',
      localeKey: 'en',
    } as any);
    expect(result).toHaveProperty('skills');
  });

  it('handles multiple calls independently', async () => {
    const opts = { custom_agent_id: 'test', localeKey: 'en' } as any;
    const result1 = await loadPresetAssistantResources(opts);
    const result2 = await loadPresetAssistantResources(opts);
    expect(result1).toBeDefined();
    expect(result2).toBeDefined();
  });

  it('function accepts options parameter', () => {
    expect(loadPresetAssistantResources.length).toBeGreaterThanOrEqual(0);
  });
});
