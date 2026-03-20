import { describe, it, expect } from 'vitest';
import { scoreModel } from '../../src/renderer/utils/model/modelFallback';

// NOTE: resolveFallbackTarget is not tested here because it depends on
// IProvider and GeminiModeOption types that require complex mocking of
// internal module types. It should be covered by integration or hook-level
// tests in the future.

describe('scoreModel', () => {
  it('returns -2 for model names containing "lite"', () => {
    expect(scoreModel('gemini-2.0-flash-lite')).toBe(-3); // flash(-1) + lite(-2)
  });

  it('returns -2 for a pure lite model', () => {
    expect(scoreModel('gemini-lite')).toBe(-2);
  });

  it('returns -1 for model names containing "flash"', () => {
    expect(scoreModel('gemini-2.0-flash')).toBe(-1);
  });

  it('returns 2 for model names containing "pro"', () => {
    expect(scoreModel('gemini-2.0-pro')).toBe(2);
  });

  it('returns 0 for unknown model names without matching keywords', () => {
    expect(scoreModel('gemini-2.0-standard')).toBe(0);
  });

  it('handles case-insensitive matching', () => {
    expect(scoreModel('Gemini-FLASH')).toBe(-1);
    expect(scoreModel('Gemini-PRO')).toBe(2);
    expect(scoreModel('Gemini-LITE')).toBe(-2);
  });

  it('accumulates scores for models with multiple keywords', () => {
    // A model name containing both "flash" and "lite"
    expect(scoreModel('flash-lite-model')).toBe(-3);
  });

  it('handles edge case of "pro" and "flash" in same name', () => {
    // Unlikely in practice but tests accumulation logic
    expect(scoreModel('pro-flash-model')).toBe(1); // pro(+2) + flash(-1)
  });

  it('returns 0 for empty string', () => {
    expect(scoreModel('')).toBe(0);
  });

  it('sorts candidates correctly when used for fallback ordering', () => {
    const models = ['gemini-2.0-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-standard'];
    const sorted = [...models].toSorted((a, b) => scoreModel(a) - scoreModel(b));

    // Lightest first: flash-lite(-3), flash(-1), standard(0), pro(2)
    expect(sorted).toEqual(['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-standard', 'gemini-2.0-pro']);
  });
});
