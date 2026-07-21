import { describe, expect, it } from 'vitest';

import { supportsOpenAiApiMode, updateModelSettings } from '@/common/utils/modelCapabilities';

describe('supportsOpenAiApiMode', () => {
  it('allows OpenAI-compatible providers', () => {
    expect(supportsOpenAiApiMode('openai')).toBe(true);
    expect(supportsOpenAiApiMode('custom')).toBe(true);
  });

  it('hides the selector for non-OpenAI wire protocols', () => {
    expect(supportsOpenAiApiMode('anthropic')).toBe(false);
    expect(supportsOpenAiApiMode('new-api', 'anthropic')).toBe(false);
  });

  it('uses the selected protocol for new-api providers', () => {
    expect(supportsOpenAiApiMode('new-api', 'openai')).toBe(true);
  });
});

describe('updateModelSettings', () => {
  it('applies explicit settings to every selected model without changing other models', () => {
    const result = updateModelSettings(
      { existing: { image_input: 'unsupported' } },
      ['gpt-4o', 'gpt-5.6-sol'],
      true,
      'responses'
    );

    expect(result.existing).toEqual({ image_input: 'unsupported' });
    expect(result['gpt-4o']).toEqual({ image_input: 'supported', openai_api_mode: 'responses' });
    expect(result['gpt-5.6-sol']).toEqual({ image_input: 'supported', openai_api_mode: 'responses' });
  });

  it('stores false when vision is disabled and the API mode is automatic', () => {
    const result = updateModelSettings(
      {
        'gpt-4o': { image_input: 'supported', openai_api_mode: 'chat_completions' },
        other: { image_input: 'supported' },
      },
      ['gpt-4o'],
      false,
      'auto'
    );

    expect(result).toEqual({
      'gpt-4o': { image_input: 'unsupported' },
      other: { image_input: 'supported' },
    });
  });

  it('defaults a newly configured model to vision disabled', () => {
    expect(updateModelSettings(undefined, ['gpt-4o'], false, 'auto')).toEqual({
      'gpt-4o': { image_input: 'unsupported' },
    });
  });
});
