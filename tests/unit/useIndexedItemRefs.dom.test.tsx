/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useIndexedItemRefs } from '../../src/renderer/hooks/ui/useIndexedItemRefs';

describe('useIndexedItemRefs', () => {
  it('trims refs when item count shrinks', () => {
    const { result, rerender } = renderHook(({ count }) => useIndexedItemRefs<HTMLButtonElement>(count), {
      initialProps: { count: 3 },
    });

    const first = document.createElement('button');
    const second = document.createElement('button');
    const third = document.createElement('button');

    act(() => {
      result.current.setItemRef(0)(first);
      result.current.setItemRef(1)(second);
      result.current.setItemRef(2)(third);
    });

    expect(result.current.itemRefs.current).toHaveLength(3);
    expect(result.current.itemRefs.current[2]).toBe(third);

    rerender({ count: 1 });

    expect(result.current.itemRefs.current).toHaveLength(1);
    expect(result.current.itemRefs.current[0]).toBe(first);
  });
});
