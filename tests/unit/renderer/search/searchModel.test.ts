import { describe, expect, it } from 'vitest';

import {
  rankSearchHits,
  scoreSearchHit,
  searchHitKey,
  searchHitToMentionItem,
  type SearchHit,
} from '@/renderer/pages/conversation/explorer/search/searchModel';

const hit = (pe_id: string, relative_path: string): SearchHit => ({
  pe_id,
  relative_path,
  name: relative_path.split('/').pop() ?? relative_path,
});

describe('scoreSearchHit', () => {
  it('ranks exact name above stem above prefix above substring', () => {
    const q = 'button';
    const exact = scoreSearchHit({ pe_id: 'p', relative_path: 'a/button', name: 'button' }, q);
    const stem = scoreSearchHit(hit('p', 'a/button.tsx'), q);
    const prefix = scoreSearchHit(hit('p', 'a/buttonGroup.tsx'), q);
    const substr = scoreSearchHit(hit('p', 'a/iconButton.tsx'), q);
    expect(exact).toBeGreaterThan(stem);
    expect(stem).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substr);
  });

  it('falls back to path tiers when the name does not match', () => {
    const pathPrefix = scoreSearchHit(hit('p', 'button/readme.md'), 'button');
    const pathSubstr = scoreSearchHit(hit('p', 'src/button/readme.md'), 'button');
    expect(pathPrefix).toBeGreaterThan(pathSubstr);
    expect(pathSubstr).toBeGreaterThan(0);
  });

  it('is case-insensitive and trims the query', () => {
    expect(scoreSearchHit(hit('p', 'Button.tsx'), '  BUTTON  ')).toBe(350);
  });

  it('returns 0 for an empty query and -1 for no match', () => {
    expect(scoreSearchHit(hit('p', 'a.ts'), '')).toBe(0);
    expect(scoreSearchHit(hit('p', 'a.ts'), 'zzz')).toBe(-1);
  });
});

describe('rankSearchHits', () => {
  it('orders by score desc and drops non-matches', () => {
    const hits = [hit('p', 'src/iconButton.tsx'), hit('p', 'button.tsx'), hit('p', 'unrelated.ts')];
    const ranked = rankSearchHits(hits, 'button');
    expect(ranked.map((h) => h.name)).toEqual(['button.tsx', 'iconButton.tsx']);
  });

  it('breaks score ties by relative_path for stable order regardless of arrival order', () => {
    const a = hit('p1', 'z/button.tsx');
    const b = hit('p2', 'a/button.tsx');
    // Same tier (exact stem) → tie broken by path: a/... before z/...
    expect(rankSearchHits([a, b], 'button').map((h) => h.relative_path)).toEqual(['a/button.tsx', 'z/button.tsx']);
    expect(rankSearchHits([b, a], 'button').map((h) => h.relative_path)).toEqual(['a/button.tsx', 'z/button.tsx']);
  });

  it('browse mode (empty query) keeps all hits, path-sorted', () => {
    const ranked = rankSearchHits([hit('p', 'z.ts'), hit('p', 'a.ts')], '');
    expect(ranked.map((h) => h.relative_path)).toEqual(['a.ts', 'z.ts']);
  });
});

describe('searchHitToMentionItem (search→add-to-chat, project ref)', () => {
  it('carries a project chat-ref built from the hit identity — zero conversion', () => {
    const item = searchHitToMentionItem({ pe_id: 'pe1', relative_path: 'src/Button.tsx', name: 'Button.tsx' });
    expect(item).toEqual({
      path: 'src/Button.tsx',
      name: 'Button.tsx',
      isFile: true,
      relativePath: 'src/Button.tsx',
      chatRef: { kind: 'project', pe_id: 'pe1', relative_path: 'src/Button.tsx' },
    });
  });
});

describe('searchHitKey', () => {
  it('is distinct per pe_id + relative_path', () => {
    expect(searchHitKey(hit('p1', 'a.ts'))).not.toBe(searchHitKey(hit('p2', 'a.ts')));
    expect(searchHitKey(hit('p1', 'a.ts'))).toBe(searchHitKey(hit('p1', 'a.ts')));
  });
});
