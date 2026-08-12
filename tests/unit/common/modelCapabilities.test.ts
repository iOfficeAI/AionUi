import { describe, expect, it } from 'vitest';
import { updateModelSettings } from '@/common/utils/modelCapabilities';

describe('updateModelSettings', () => {
  it('writes three new limit fields on a fresh model entry', () => {
    const result = updateModelSettings(undefined, ['gpt-4o'], 'auto', 'auto', {
      contextWindowSize: 128000,
      maxContentLength: 64000,
      maxResponseLength: 4096,
    });

    expect(result).toEqual({
      'gpt-4o': {
        context_window_size: 128000,
        max_content_length: 64000,
        max_response_length: 4096,
      },
    });
  });

  it('clears existing image_input when caller passes auto, but preserves other untouched settings keys', () => {
    // Passing 'auto' for imageInput resets that override (existing behavior).
    // Limits unrelated to imageInput are still written.
    const current = {
      'gpt-4o': { image_input: 'supported' as const },
    };

    const result = updateModelSettings(current, ['gpt-4o'], 'auto', 'auto', { contextWindowSize: 200000 });

    expect(result['gpt-4o']).toEqual({
      context_window_size: 200000,
    });
  });

  it('does not touch unrelated models in the same map', () => {
    const current = {
      'gpt-3.5': { image_input: 'unsupported' as const },
    };

    const result = updateModelSettings(current, ['gpt-4o'], 'auto', 'auto', { maxResponseLength: 8192 });

    expect(result['gpt-3.5']).toEqual({ image_input: 'unsupported' });
    expect(result['gpt-4o']).toEqual({ max_response_length: 8192 });
  });

  it('removes entry only when image, openai mode, and limits are all auto/undefined', () => {
    const current = {
      'gpt-4o': {
        image_input: 'supported' as const,
        context_window_size: 128000,
      },
    };

    const result = updateModelSettings(current, ['gpt-4o'], 'auto', 'auto', undefined);

    expect(result).toEqual({});
  });

  it('clears image_input when caller passes auto, even if limits also clear', () => {
    // Existing behavior: passing 'auto' for imageInput resets the override.
    // Combined with empty limits, the whole entry is removed.
    const current = {
      'gpt-4o': { image_input: 'supported' as const },
    };

    const result = updateModelSettings(current, ['gpt-4o'], 'auto', 'auto', undefined);

    expect(result).toEqual({});
  });

  it('treats partial limits object as empty and removes entry when no other fields set', () => {
    const current = {
      'gpt-4o': { max_response_length: 4096 },
    };

    const result = updateModelSettings(current, ['gpt-4o'], 'auto', 'auto', { contextWindowSize: undefined });

    expect(result).toEqual({});
  });
});
