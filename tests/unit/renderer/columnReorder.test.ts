/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { moveColumn, reorderColumns, resolveColumnDropIndex } from '@/renderer/pages/split/columnReorder';

const order = ['a', 'b', 'c'];
const over = (overId: string, pointerX: number) => ({ overId, pointerX, overLeft: 100, overWidth: 200 });

describe('resolveColumnDropIndex', () => {
  it('lands before the column under the pointer when the pointer is in its left half', () => {
    expect(resolveColumnDropIndex({ activeId: 'c', ...over('a', 120), order })).toBe(0);
  });

  it('lands after the column under the pointer when the pointer is in its right half', () => {
    expect(resolveColumnDropIndex({ activeId: 'c', ...over('a', 280), order })).toBe(1);
  });

  it('is a no-op on its own slot, from either side', () => {
    // Left half of b when dragging b: the slot before b is where b is.
    expect(resolveColumnDropIndex({ activeId: 'b', ...over('b', 120), order })).toBeNull();
    // Right half of b: the slot after b, minus b itself, is still where b is.
    expect(resolveColumnDropIndex({ activeId: 'b', ...over('b', 280), order })).toBeNull();
    // The right half of a is the slot before b — b's own place.
    expect(resolveColumnDropIndex({ activeId: 'b', ...over('a', 280), order })).toBeNull();
    // And the left half of c is the slot after b — also b's own place.
    expect(resolveColumnDropIndex({ activeId: 'b', ...over('c', 120), order })).toBeNull();
  });

  it('answers nothing for a column or target it does not know', () => {
    expect(resolveColumnDropIndex({ activeId: 'z', ...over('a', 120), order })).toBeNull();
    expect(resolveColumnDropIndex({ activeId: 'a', ...over('z', 120), order })).toBeNull();
  });
});

describe('reorderColumns', () => {
  it('moves the third column to the first slot', () => {
    expect(reorderColumns(order, 'c', 0)).toEqual(['c', 'a', 'b']);
  });

  it('moves the first column to the last slot', () => {
    expect(reorderColumns(order, 'a', 3)).toEqual(['b', 'c', 'a']);
  });

  it('moves the first column after the second', () => {
    expect(reorderColumns(order, 'a', 2)).toEqual(['b', 'a', 'c']);
  });

  it('leaves an unknown column alone', () => {
    expect(reorderColumns(order, 'z', 0)).toEqual(order);
  });
});

describe('moveColumn', () => {
  it('moves one slot left or right', () => {
    expect(moveColumn(order, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveColumn(order, 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('stays put at either edge', () => {
    expect(moveColumn(order, 'a', -1)).toEqual(order);
    expect(moveColumn(order, 'c', 1)).toEqual(order);
  });
});
