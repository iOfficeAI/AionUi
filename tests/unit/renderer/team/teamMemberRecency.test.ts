/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TeamAssistantOption } from '@/renderer/pages/team/components/assistantSelectUtils';
import {
  normalizeMemberRecency,
  sortCandidatesByRecency,
  touchMemberRecency,
} from '@/renderer/pages/team/utils/teamMemberRecency';

const option = (id: string, name = id): TeamAssistantOption => ({ id, name });

describe('normalizeMemberRecency', () => {
  it('returns an empty map for non-object / array / invalid values', () => {
    expect(normalizeMemberRecency(undefined)).toEqual({});
    expect(normalizeMemberRecency(null)).toEqual({});
    expect(normalizeMemberRecency('bad')).toEqual({});
    expect(normalizeMemberRecency(42)).toEqual({});
    expect(normalizeMemberRecency(['writer'])).toEqual({});
  });

  it('keeps string keys with positive finite timestamps and drops the rest', () => {
    expect(
      normalizeMemberRecency({
        writer: 1710000000000,
        blocked: -1,
        zero: 0,
        nan: NaN,
        infinity: Infinity,
        '': 1710000000000,
      })
    ).toEqual({ writer: 1710000000000 });
  });
});

describe('touchMemberRecency', () => {
  it('returns a new map setting the timestamp without mutating the input', () => {
    const before = { writer: 1710000000000 };
    const after = touchMemberRecency(before, 'writer', 1710000000999);
    expect(before).toEqual({ writer: 1710000000000 });
    expect(after).toEqual({ writer: 1710000000999 });
  });

  it('keeps unrelated entries when adding a new assistant', () => {
    expect(touchMemberRecency({ writer: 1710000000000 }, 'hermes', 1720000000000)).toEqual({
      writer: 1710000000000,
      hermes: 1720000000000,
    });
  });
});

describe('sortCandidatesByRecency', () => {
  const writer = option('writer');
  const hermes = option('hermes');
  const claude = option('claude');
  const gemini = option('gemini');
  const candidates = [writer, hermes, claude, gemini];

  it('floats used candidates to the top newest-first, keeping unused orders behind', () => {
    const sorted = sortCandidatesByRecency(candidates, { claude: 3000, writer: 1000 });
    expect(sorted).toEqual([claude, writer, hermes, gemini]);
  });

  it('falls back to the original order when nothing has been used', () => {
    expect(sortCandidatesByRecency(candidates, {})).toEqual(candidates);
    expect(sortCandidatesByRecency(candidates, { unknown: 5 })).toEqual(candidates);
  });

  it('is stable for ties on a shared timestamp', () => {
    expect(sortCandidatesByRecency(candidates, { writer: 1, hermes: 1 })).toEqual(candidates);
  });

  it('keeps candidate object identity', () => {
    const sorted = sortCandidatesByRecency(candidates, { gemini: 1 });
    expect(sorted.includes(gemini)).toBe(true);
    expect(sorted[0]).toBe(gemini);
  });
});
