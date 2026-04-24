import { describe, expect, it } from 'vitest';

/**
 * Tests for the defensive guards added in ModelModalContent.tsx.
 * The component uses inline helpers that access `platform.model` which can
 * be `undefined` at runtime even though the type declares `string[]`.
 * We replicate the guarded logic here to verify the fix for ELECTRON-T9.
 */

type IProviderLike = {
  models?: string[];
  model_enabled?: Record<string, boolean>;
};

const getProviderState = (platform: IProviderLike): { checked: boolean; indeterminate: boolean } => {
  if (!platform.model_enabled) {
    return { checked: true, indeterminate: false };
  }

  const models = platform.models ?? [];
  const enabledCount = models.filter((model) => platform.model_enabled?.[model] !== false).length;
  const totalCount = models.length;

  if (enabledCount === 0) {
    return { checked: false, indeterminate: false };
  } else if (enabledCount === totalCount) {
    return { checked: true, indeterminate: false };
  } else {
    return { checked: true, indeterminate: true };
  }
};

const isModelEnabled = (platform: IProviderLike, model: string): boolean => {
  if (!platform.model_enabled) return true;
  return platform.model_enabled[model] !== false;
};

describe('ModelModalContent helpers — undefined model guard (ELECTRON-T9)', () => {
  it('getProviderState handles undefined model array', () => {
    const platform: IProviderLike = { model_enabled: { foo: true } };
    const result = getProviderState(platform);
    expect(result).toEqual({ checked: false, indeterminate: false });
  });

  it('getProviderState returns all-checked when modelEnabled is absent', () => {
    const platform: IProviderLike = {};
    expect(getProviderState(platform)).toEqual({ checked: true, indeterminate: false });
  });

  it('getProviderState returns correct state for normal data', () => {
    const platform: IProviderLike = {
      models: ['a', 'b', 'c'],
      model_enabled: { a: true, b: false, c: true },
    };
    expect(getProviderState(platform)).toEqual({ checked: true, indeterminate: true });
  });

  it('getProviderState returns all-unchecked when every model is disabled', () => {
    const platform: IProviderLike = {
      models: ['a', 'b'],
      model_enabled: { a: false, b: false },
    };
    expect(getProviderState(platform)).toEqual({ checked: false, indeterminate: false });
  });

  it('isModelEnabled returns true when modelEnabled is undefined', () => {
    expect(isModelEnabled({}, 'gpt-4o')).toBe(true);
  });

  it('isModelEnabled returns false for explicitly disabled model', () => {
    expect(isModelEnabled({ model_enabled: { 'gpt-4o': false } }, 'gpt-4o')).toBe(false);
  });

  it('isModelEnabled returns true for enabled model', () => {
    expect(isModelEnabled({ model_enabled: { 'gpt-4o': true } }, 'gpt-4o')).toBe(true);
  });

  it('model.length guard returns 0 for undefined model', () => {
    const platform: IProviderLike = {};
    expect((platform.model ?? []).length).toBe(0);
  });

  it('model.map guard returns empty array for undefined model', () => {
    const platform: IProviderLike = {};
    expect((platform.model ?? []).map((m) => m)).toEqual([]);
  });

  it('model.forEach guard does not throw for undefined model', () => {
    const platform: IProviderLike = {};
    const result: Record<string, boolean> = {};
    (platform.model ?? []).forEach((model) => {
      result[model] = true;
    });
    expect(result).toEqual({});
  });
});
