import { describe, expect, it } from 'vitest';
import {
  MODEL_NAME_LIMIT_DEFAULTS,
  PROTOCOL_LIMIT_DEFAULTS,
  SYSTEM_LIMIT_DEFAULTS,
  resolveModelLimits,
} from '@/common/config/modelLimits';

describe('resolveModelLimits', () => {
  it('returns model-name limits for exact match (gpt-4o)', () => {
    expect(resolveModelLimits('gpt-4o', 'openai')).toEqual({
      contextWindowSize: 128000,
      maxContentLength: 100000,
      maxResponseLength: 4096,
    });
  });

  it('returns model-name limits for variant (gpt-4o-mini)', () => {
    expect(resolveModelLimits('gpt-4o-mini', 'openai')).toEqual({
      contextWindowSize: 128000,
      maxContentLength: 100000,
      maxResponseLength: 4096,
    });
  });

  it('returns model-name limits for dated variant (claude-3-5-sonnet-20240620)', () => {
    expect(resolveModelLimits('claude-3-5-sonnet-20240620', 'anthropic')).toEqual({
      contextWindowSize: 200000,
      maxContentLength: 180000,
      maxResponseLength: 8192,
    });
  });

  it('returns model-name limits for gemini-2.x with preview suffix', () => {
    expect(resolveModelLimits('gemini-2.5-pro-preview-06-05', 'gemini')).toEqual({
      contextWindowSize: 1000000,
      maxContentLength: 900000,
      maxResponseLength: 8192,
    });
  });

  it('returns 1M / 615k / 384k defaults for DeepSeek model names', () => {
    expect(resolveModelLimits('deepseek-v3', 'openai')).toEqual({
      contextWindowSize: 1000000,
      maxContentLength: 615000,
      maxResponseLength: 384000,
    });
    expect(resolveModelLimits('deepseek-r1', 'openai')).toEqual({
      contextWindowSize: 1000000,
      maxContentLength: 615000,
      maxResponseLength: 384000,
    });
  });

  it('falls back to openai protocol defaults when name does not match', () => {
    expect(resolveModelLimits('my-unknown-model', 'openai')).toEqual(PROTOCOL_LIMIT_DEFAULTS.openai);
  });

  it('falls back to anthropic protocol defaults when name does not match', () => {
    expect(resolveModelLimits('my-unknown-model', 'anthropic')).toEqual(PROTOCOL_LIMIT_DEFAULTS.anthropic);
  });

  it('falls back to gemini protocol defaults when name does not match', () => {
    expect(resolveModelLimits('my-unknown-model', 'gemini')).toEqual(PROTOCOL_LIMIT_DEFAULTS.gemini);
  });

  it('falls back to unknown protocol defaults when name does not match', () => {
    expect(resolveModelLimits('my-unknown-model', 'unknown')).toEqual(PROTOCOL_LIMIT_DEFAULTS.unknown);
  });

  it('falls back to protocol defaults when model name is empty', () => {
    expect(resolveModelLimits('', 'openai')).toEqual(PROTOCOL_LIMIT_DEFAULTS.openai);
  });

  it('falls back to protocol defaults when model name is undefined', () => {
    expect(resolveModelLimits(undefined, 'anthropic')).toEqual(PROTOCOL_LIMIT_DEFAULTS.anthropic);
  });

  it('is case-insensitive (GPT-4O matches gpt-4o)', () => {
    expect(resolveModelLimits('GPT-4O', 'openai')).toEqual(resolveModelLimits('gpt-4o', 'openai'));
  });

  it('exposes SYSTEM_LIMIT_DEFAULTS equal to PROTOCOL_LIMIT_DEFAULTS.unknown', () => {
    expect(SYSTEM_LIMIT_DEFAULTS).toEqual(PROTOCOL_LIMIT_DEFAULTS.unknown);
  });

  it('exports a non-empty MODEL_NAME_LIMIT_DEFAULTS list', () => {
    expect(MODEL_NAME_LIMIT_DEFAULTS.length).toBeGreaterThan(0);
  });
});
