/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { normalizePresetAssistantExtra } from '../../src/common/utils/presetAssistantExtra';

describe('normalizePresetAssistantExtra', () => {
  it('populates canonical presetRules from presetContext for AionRS', () => {
    const normalized = normalizePresetAssistantExtra(
      {
        presetAssistantId: 'assistant-1',
        presetContext: 'RULES FROM LEGACY PATH',
        enabledSkills: ['portfolio-construction', 'excel'],
      },
      {
        type: 'aionrs',
        isPreset: true,
        failClosed: true,
        model: { name: 'MiniMax', platform: 'openai-compatible', useModel: 'minimax-m2.7' },
      }
    );

    expect(normalized.presetRules).toBe('RULES FROM LEGACY PATH');
    expect(normalized.presetContext).toBe('RULES FROM LEGACY PATH');
    expect(normalized.presetRulesHash).toMatch(/^fnv1a32:/);
    expect(normalized.skillPackHash).toMatch(/^fnv1a32:/);
    expect(normalized.contextProvenance).toMatchObject({
      assistant: { id: 'assistant-1', rulesHash: normalized.presetRulesHash },
      skills: { enabled: ['portfolio-construction', 'excel'], skillPackHash: normalized.skillPackHash },
      model: { provider: 'MiniMax', platform: 'openai-compatible', useModel: 'minimax-m2.7' },
    });
  });

  it('keeps presetContext as a backward-compatible alias when presetRules exists', () => {
    const normalized = normalizePresetAssistantExtra(
      {
        presetAssistantId: 'assistant-1',
        presetRules: 'CANONICAL RULES',
      },
      { type: 'aionrs', isPreset: true, failClosed: true }
    );

    expect(normalized.presetRules).toBe('CANONICAL RULES');
    expect(normalized.presetContext).toBe('CANONICAL RULES');
  });

  it('fails closed for preset AionRS conversations without rules', () => {
    expect(() =>
      normalizePresetAssistantExtra(
        {
          presetAssistantId: 'assistant-1',
        },
        { type: 'aionrs', isPreset: true, failClosed: true }
      )
    ).toThrow(/missing presetRules\/presetContext/);
  });
});
