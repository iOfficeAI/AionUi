import { describe, it, expect } from 'vitest';
import {
  cumulative,
  logScale,
  topN,
  pct,
  formatTokens,
  cumulativeBySegment,
} from '@renderer/pages/settings/UsageStats/chartMath';

describe('chartMath', () => {
  it('cumulative = prefix sum', () => {
    expect(cumulative([1, 2, 3, 4])).toEqual([1, 3, 6, 10]);
    expect(cumulative([])).toEqual([]);
  });
  it('logScale uses log10(v+1), 0 stays 0', () => {
    expect(logScale(0)).toBe(0);
    expect(logScale(9)).toBeCloseTo(1, 5); // log10(10)=1
    expect(logScale(99)).toBeCloseTo(2, 5);
  });
  it('topN sorts desc by value and slices', () => {
    const r = topN(
      [
        { k: 'a', v: 3 },
        { k: 'b', v: 9 },
        { k: 'c', v: 1 },
      ],
      (x) => x.v,
      2
    );
    expect(r.map((x) => x.k)).toEqual(['b', 'a']);
  });
  it('pct guards divide-by-zero', () => {
    expect(pct(25, 100)).toBe(25);
    expect(pct(5, 0)).toBe(0);
  });
  it('cumulativeBySegment = per-segment prefix sum', () => {
    const buckets = [{ claude: 100 }, { codex: 100 }, { claude: 50, codex: 30 }];
    const got = cumulativeBySegment(buckets);
    expect(got).toEqual([{ claude: 100 }, { claude: 100, codex: 100 }, { claude: 150, codex: 130 }]);
  });
  it('cumulativeBySegment handles empty buckets and missing segments', () => {
    expect(cumulativeBySegment([])).toEqual([]);
    expect(cumulativeBySegment([{}, { a: 5 }])).toEqual([{}, { a: 5 }]);
  });
  it('formatTokens uses K/M/B with 2 decimals, raw below 1000', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(42)).toBe('42');
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1_000)).toBe('1.00K');
    expect(formatTokens(1_234)).toBe('1.23K');
    expect(formatTokens(1_934_382)).toBe('1.93M');
    expect(formatTokens(2_064_603_210)).toBe('2.06B');
    expect(formatTokens(-1_500)).toBe('-1.50K'); // 负数对称处理
  });
});
