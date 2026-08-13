/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import {
  applyAssistantSort,
  normalizeAssistantUsage,
  normalizeSortStrategy,
  recordAssistantUsage,
  type AssistantSortStrategy,
  type AssistantUsage,
} from '@/renderer/utils/model/assistantSort';

const mk = (id: string, source: Assistant['source'], sort_order: number, name = id): Assistant =>
  ({
    id,
    source,
    name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    agent_status: 'online',
    team_selectable: true,
    deletable: source === 'user',
  }) as Assistant;

describe('normalizeSortStrategy', () => {
  it('defaults unknown / missing values to manual', () => {
    expect(normalizeSortStrategy(undefined)).toBe('manual');
    expect(normalizeSortStrategy('bogus')).toBe('manual');
    expect(normalizeSortStrategy(42)).toBe('manual');
  });

  it('passes through known strategies', () => {
    expect(normalizeSortStrategy('manual')).toBe('manual');
    expect(normalizeSortStrategy('recent')).toBe('recent');
    expect(normalizeSortStrategy('frequency')).toBe('frequency');
    expect(normalizeSortStrategy('alphabetical')).toBe('alphabetical');
  });
});

describe('normalizeAssistantUsage', () => {
  it('returns an empty map for non-object / array / invalid values', () => {
    expect(normalizeAssistantUsage(undefined)).toEqual({});
    expect(normalizeAssistantUsage(null)).toEqual({});
    expect(normalizeAssistantUsage('bad')).toEqual({});
    expect(normalizeAssistantUsage(['writer'])).toEqual({});
  });

  it('keeps valid records and drops corrupt / empty ones', () => {
    const usage = normalizeAssistantUsage({
      writer: { lastUsedAt: 1710000000000, useCount: 3 },
      onlyCount: { useCount: 2 },
      onlyTime: { lastUsedAt: 1710000000001 },
      empty: {},
      badTime: { lastUsedAt: -1, useCount: 1 },
      badCount: { useCount: 0 },
      nan: { useCount: NaN },
      '': { useCount: 1 },
      stringRecord: 'nope',
      arrayRecord: [1, 2],
    });
    expect(usage).toEqual({
      writer: { lastUsedAt: 1710000000000, useCount: 3 },
      onlyCount: { useCount: 2 },
      onlyTime: { lastUsedAt: 1710000000001 },
      badTime: { useCount: 1 },
    });
  });
});

describe('recordAssistantUsage', () => {
  it('increments useCount and stamps lastUsedAt without mutating input', () => {
    const before: AssistantUsage = { writer: { lastUsedAt: 1000, useCount: 1 } };
    const after = recordAssistantUsage(before, 'writer', 2000);
    expect(before).toEqual({ writer: { lastUsedAt: 1000, useCount: 1 } });
    expect(after).toEqual({ writer: { lastUsedAt: 2000, useCount: 2 } });
  });

  it('creates a fresh record for an unseen assistant', () => {
    expect(recordAssistantUsage({}, 'hermes', 5000)).toEqual({
      hermes: { lastUsedAt: 5000, useCount: 1 },
    });
  });
});

describe('applyAssistantSort', () => {
  // Disable one so we can assert it is dropped in every strategy.
  const withDisabled = [
    mk('alpha', 'builtin', 30, 'Alpha'),
    mk('bravo', 'user', 10, 'Bravo'),
    mk('charlie', 'generated', 20, 'Charlie'),
    Object.assign(mk('disabled', 'builtin', 40, 'Disabled'), { enabled: false }),
  ];
  const usage: AssistantUsage = {
    charlie: { lastUsedAt: 3000, useCount: 5 },
    alpha: { lastUsedAt: 1000, useCount: 2 },
    bravo: { lastUsedAt: 2000, useCount: 7 },
  };
  const opts = { usage, localeKey: 'en-US' } as const;

  it('manual returns the enabledOrder base unchanged', () => {
    const result = applyAssistantSort(withDisabled, {
      ...opts,
      strategy: 'manual',
      preferredOrder: ['bravo', 'alpha', 'charlie', 'disabled'],
    });
    expect(result.map((a) => a.id)).toEqual(['bravo', 'alpha', 'charlie']);
  });

  it('manual without a preferred order keeps legacy source order and drops disabled', () => {
    const result = applyAssistantSort(withDisabled, { strategy: 'manual', localeKey: 'en-US' });
    // generated (charlie) < user (bravo) < builtin (alpha); disabled dropped.
    expect(result.map((a) => a.id)).toEqual(['charlie', 'bravo', 'alpha']);
  });

  it('recent sorts most-recently-used first and keeps never-used behind in base order', () => {
    const result = applyAssistantSort(withDisabled, { ...opts, strategy: 'recent' });
    expect(result.map((a) => a.id)).toEqual(['charlie', 'bravo', 'alpha']);
  });

  it('frequency sorts by use count descending', () => {
    const result = applyAssistantSort(withDisabled, { ...opts, strategy: 'frequency' });
    expect(result.map((a) => a.id)).toEqual(['bravo', 'charlie', 'alpha']);
  });

  it('alphabetical sorts by name using the given locale collator', () => {
    const result = applyAssistantSort(withDisabled, { ...opts, strategy: 'alphabetical' });
    expect(result.map((a) => a.id)).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('automatic strategies tie-break by base order for equal stats', () => {
    // Both alpha and bravo have the same recency/count → base order wins.
    const tieUsage: AssistantUsage = {
      alpha: { lastUsedAt: 100, useCount: 1 },
      bravo: { lastUsedAt: 100, useCount: 1 },
      charlie: { lastUsedAt: 100, useCount: 1 },
    };
    const recent = applyAssistantSort(withDisabled, { usage: tieUsage, localeKey: 'en-US', strategy: 'recent' });
    const frequency = applyAssistantSort(withDisabled, { usage: tieUsage, localeKey: 'en-US', strategy: 'frequency' });
    // Base order is [charlie, bravo, alpha] (legacy). Ties keep that order.
    expect(recent.map((a) => a.id)).toEqual(['charlie', 'bravo', 'alpha']);
    expect(frequency.map((a) => a.id)).toEqual(['charlie', 'bravo', 'alpha']);
  });

  it('frequency falls back to zero count for assistants with no usage entry', () => {
    // Only charlie has usage; alpha/bravo fall back to a zero count (base order).
    const result = applyAssistantSort(withDisabled, {
      ...opts,
      strategy: 'frequency',
      usage: { charlie: { useCount: 5 } },
    });
    expect(result[0].id).toBe('charlie');
    expect(result.slice(1).map((a) => a.id)).toEqual(['bravo', 'alpha']);
  });

  it('alphabetical tie-breaks equal names by base order', () => {
    const sameNames = [
      mk('beta', 'generated', 1, 'Same'),
      mk('alpha', 'user', 2, 'Same'),
      mk('gamma', 'builtin', 3, 'Same'),
    ];
    const result = applyAssistantSort(sameNames, { usage: {}, localeKey: 'en-US', strategy: 'alphabetical' });
    // Equal display names → base (legacy source) order wins.
    expect(result.map((a) => a.id)).toEqual(['beta', 'alpha', 'gamma']);
  });

  it('handles an empty usage map under automatic strategies', () => {
    const recent = applyAssistantSort(withDisabled, { usage: {}, localeKey: 'en-US', strategy: 'recent' });
    const alpha = applyAssistantSort(withDisabled, { usage: {}, localeKey: 'en-US', strategy: 'alphabetical' });
    expect(recent.map((a) => a.id)).toEqual(['charlie', 'bravo', 'alpha']);
    expect(alpha.map((a) => a.id)).toEqual(['alpha', 'bravo', 'charlie']);
  });
});

describe('applyAssistantSort strategy type guard', () => {
  it('accepts the four strategies (compile-time contract)', () => {
    const strategies: AssistantSortStrategy[] = ['manual', 'recent', 'frequency', 'alphabetical'];
    expect(strategies).toHaveLength(4);
  });
});
