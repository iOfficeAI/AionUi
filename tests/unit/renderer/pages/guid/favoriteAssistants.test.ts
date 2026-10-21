/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { computeOverflowAssistantIds, resolveFavoriteFrontRow } from '@/renderer/pages/guid/hooks/favoriteAssistants';

type TestAssistant = { id: string; name: string };

function assistants(ids: string[]): TestAssistant[] {
  return ids.map((id) => ({ id, name: id }));
}

describe('resolveFavoriteFrontRow — fallback (no favorites)', () => {
  it('returns the first `visibleLimit` enabled assistants when nothing is selected', () => {
    const result = resolveFavoriteFrontRow(assistants(['a', 'b', 'c', 'd']), undefined, 2);

    expect(result).toEqual({ frontRowIds: ['a', 'b'], hasCustomFavorites: false });
  });

  it('returns the first `visibleLimit` when the selected id is inside them', () => {
    const result = resolveFavoriteFrontRow(assistants(['a', 'b', 'c', 'd']), [], 2, 'b');

    expect(result).toEqual({ frontRowIds: ['a', 'b'], hasCustomFavorites: false });
  });

  it('promotes a selected assistant that sits beyond the limit', () => {
    const result = resolveFavoriteFrontRow(assistants(['a', 'b', 'c', 'd']), [], 2, 'c');

    expect(result).toEqual({ frontRowIds: ['a', 'c'], hasCustomFavorites: false });
  });

  it('keeps the default front row when the selected id is unknown', () => {
    const result = resolveFavoriteFrontRow(assistants(['a', 'b', 'c', 'd']), [], 2, 'missing');

    expect(result).toEqual({ frontRowIds: ['a', 'b'], hasCustomFavorites: false });
  });

  it('keeps the default front row when no selected id is given', () => {
    const result = resolveFavoriteFrontRow(assistants(['a', 'b', 'c', 'd']), [], 2, null);

    expect(result).toEqual({ frontRowIds: ['a', 'b'], hasCustomFavorites: false });
  });

  it('handles an enabled list shorter than the limit', () => {
    const result = resolveFavoriteFrontRow(assistants(['a']), [], 3);

    expect(result).toEqual({ frontRowIds: ['a'], hasCustomFavorites: false });
  });
});

describe('resolveFavoriteFrontRow — custom favorites', () => {
  it('fills the front row with pinned favorites in pinned order', () => {
    const result = resolveFavoriteFrontRow(assistants(['a', 'b', 'c', 'd']), ['c', 'a'], 2);

    expect(result).toEqual({ frontRowIds: ['c', 'a'], hasCustomFavorites: true });
  });

  it('crops pinned favorites beyond the visible limit', () => {
    const result = resolveFavoriteFrontRow(assistants(['a', 'b', 'c', 'd']), ['d', 'c', 'b'], 2);

    expect(result).toEqual({ frontRowIds: ['d', 'c'], hasCustomFavorites: true });
  });

  it('drops pinned favorites that are no longer enabled', () => {
    const result = resolveFavoriteFrontRow(assistants(['a', 'b', 'c', 'd']), ['gone', 'b', 'also-gone'], 2);

    expect(result).toEqual({ frontRowIds: ['b'], hasCustomFavorites: true });
  });

  it('appends the selected assistant when the front row still has room', () => {
    const result = resolveFavoriteFrontRow(assistants(['a', 'b', 'c', 'd']), ['c'], 2, 'd');

    expect(result).toEqual({ frontRowIds: ['c', 'd'], hasCustomFavorites: true });
  });

  it('replaces the last front-row slot when full and the selected assistant is outside', () => {
    const result = resolveFavoriteFrontRow(assistants(['a', 'b', 'c', 'd']), ['c', 'a'], 2, 'd');

    expect(result).toEqual({ frontRowIds: ['c', 'd'], hasCustomFavorites: true });
  });

  it('keeps the front row unchanged when the selected assistant is already in it', () => {
    const result = resolveFavoriteFrontRow(assistants(['a', 'b', 'c', 'd']), ['c', 'a'], 2, 'a');

    expect(result).toEqual({ frontRowIds: ['c', 'a'], hasCustomFavorites: true });
  });

  it('does not promote a selected assistant that is not enabled', () => {
    const result = resolveFavoriteFrontRow(assistants(['a', 'b', 'c', 'd']), ['c'], 2, 'missing');

    expect(result).toEqual({ frontRowIds: ['c'], hasCustomFavorites: true });
  });

  it('falls back to default behaviour when all pinned favorites disappear', () => {
    const result = resolveFavoriteFrontRow(assistants(['a', 'b', 'c']), ['gone'], 2);

    expect(result).toEqual({ frontRowIds: ['a', 'b'], hasCustomFavorites: false });
  });
});

describe('computeOverflowAssistantIds', () => {
  it('returns enabled assistants not present in the front row, in enabled order', () => {
    expect(computeOverflowAssistantIds(assistants(['a', 'b', 'c', 'd']), ['c', 'a'])).toEqual(['b', 'd']);
  });

  it('returns everything when the front row is empty', () => {
    expect(computeOverflowAssistantIds(assistants(['a', 'b']), [])).toEqual(['a', 'b']);
  });

  it('returns nothing when the front row covers all enabled assistants', () => {
    expect(computeOverflowAssistantIds(assistants(['a', 'b']), ['a', 'b'])).toEqual([]);
  });
});
