import { describe, expect, it } from 'vitest';
import { relativizePath, truncate, buildLineRangeLabel, diffCountLabel } from './toolBlockPresentation';

describe('relativizePath', () => {
  it('strips the workspace prefix', () => {
    expect(relativizePath('/ws/src/a.ts', '/ws')).toBe('src/a.ts');
    expect(relativizePath('/ws/src/a.ts', '/ws/')).toBe('src/a.ts');
  });
  it('returns the basename-relative form when outside workspace', () => {
    expect(relativizePath('/other/x.ts', '/ws')).toBe('x.ts');
  });
  it('handles empty input', () => {
    expect(relativizePath(undefined, '/ws')).toBeUndefined();
  });
});

describe('truncate', () => {
  it('truncates long text with ellipsis at word-safe length', () => {
    expect(truncate('a'.repeat(80), 60)).toHaveLength(63);
    expect(truncate('short', 60)).toBe('short');
    expect(truncate(undefined, 60)).toBeUndefined();
  });
});

describe('buildLineRangeLabel', () => {
  it('formats L ranges', () => {
    expect(buildLineRangeLabel(12, 30)).toBe('L12-30');
    expect(buildLineRangeLabel(12, 12)).toBe('L12');
    expect(buildLineRangeLabel(undefined, 30)).toBeUndefined();
  });
});

describe('diffCountLabel', () => {
  it('formats +N/-M pills', () => {
    expect(diffCountLabel({ added: 12, removed: 3 })).toEqual({ added: '+12', removed: '-3' });
    expect(diffCountLabel({ added: 0, removed: 0 })).toBeUndefined();
    expect(diffCountLabel(undefined)).toBeUndefined();
  });
});
