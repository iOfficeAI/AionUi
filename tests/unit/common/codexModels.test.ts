import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CODEX_MODEL_ID,
  DEFAULT_CODEX_MODELS,
  mergeCodexModelInfoWithDefaults,
} from '@/common/types/codex/codexModels';

describe('codexModels', () => {
  it('uses gpt-5.6-sol as the maintained Codex default', () => {
    expect(DEFAULT_CODEX_MODEL_ID).toBe('gpt-5.6-sol');
    expect(DEFAULT_CODEX_MODELS[0]).toMatchObject({
      id: 'gpt-5.6-sol',
      label: 'gpt-5.6-sol',
    });
  });

  it('adds gpt-5.6-sol to stale Codex model lists', () => {
    expect(
      mergeCodexModelInfoWithDefaults({
        currentModelId: 'gpt-5.5',
        currentModelLabel: 'GPT-5.5',
        availableModels: [{ id: 'gpt-5.5', label: 'GPT-5.5' }],
        canSwitch: false,
        source: 'models',
        sourceDetail: 'codex-stream',
      })
    ).toMatchObject({
      currentModelId: 'gpt-5.5',
      availableModels: expect.arrayContaining([
        { id: 'gpt-5.6-sol', label: 'gpt-5.6-sol' },
        { id: 'gpt-5.5', label: 'GPT-5.5' },
      ]),
      canSwitch: true,
    });
  });

  it('lets the configured Codex model override stale runtime current_model values', () => {
    expect(
      mergeCodexModelInfoWithDefaults(
        {
          currentModelId: 'gpt-5.5',
          currentModelLabel: 'GPT-5.5',
          availableModels: [{ id: 'gpt-5.5', label: 'GPT-5.5' }],
          canSwitch: false,
          source: 'models',
          sourceDetail: 'codex-stream',
        },
        { preferredModelId: 'gpt-5.6-sol' }
      )
    ).toMatchObject({
      currentModelId: 'gpt-5.6-sol',
      currentModelLabel: 'gpt-5.6-sol',
      availableModels: expect.arrayContaining([
        { id: 'gpt-5.6-sol', label: 'gpt-5.6-sol' },
        { id: 'gpt-5.5', label: 'GPT-5.5' },
      ]),
      canSwitch: true,
    });
  });
});
