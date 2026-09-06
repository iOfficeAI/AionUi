/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePreviewRegionHold } from '@/renderer/pages/conversation/Preview/hooks/usePreviewRegionHold';

type Props = { isSplitGroupRoute: boolean; isPreviewOpen: boolean; deliberateCloseCount: number };
const mount = (initial: Props) => renderHook((props: Props) => usePreviewRegionHold(props), { initialProps: initial });

/**
 * The preview's open state is stored per project scope, so following the
 * focus across columns of different projects flips it on every click. The
 * hold is what keeps the right-hand region on screen through that.
 */
describe('usePreviewRegionHold', () => {
  it('holds the region once the panel is up on a split route, through a scope swap that says "closed"', () => {
    const { result, rerender } = mount({ isSplitGroupRoute: true, isPreviewOpen: true, deliberateCloseCount: 0 });
    expect(result.current).toBe(true);
    // Focus moves to a column whose project scope has the panel closed.
    rerender({ isSplitGroupRoute: true, isPreviewOpen: false, deliberateCloseCount: 0 });
    expect(result.current).toBe(true);
    // And back again: still held, nothing flapped.
    rerender({ isSplitGroupRoute: true, isPreviewOpen: true, deliberateCloseCount: 0 });
    expect(result.current).toBe(true);
  });

  it('does not hold anything while the panel was never up', () => {
    const { result } = mount({ isSplitGroupRoute: true, isPreviewOpen: false, deliberateCloseCount: 0 });
    expect(result.current).toBe(false);
  });

  it('lets a deliberate close dismiss the region', () => {
    const { result, rerender } = mount({ isSplitGroupRoute: true, isPreviewOpen: true, deliberateCloseCount: 0 });
    rerender({ isSplitGroupRoute: true, isPreviewOpen: false, deliberateCloseCount: 1 });
    expect(result.current).toBe(false);
  });

  it('ends the hold on leaving the split routes', () => {
    const { result, rerender } = mount({ isSplitGroupRoute: true, isPreviewOpen: true, deliberateCloseCount: 0 });
    rerender({ isSplitGroupRoute: false, isPreviewOpen: false, deliberateCloseCount: 0 });
    expect(result.current).toBe(false);
  });

  it('is not tripped by a close count it was born with', () => {
    // Mounting after earlier closes must not read those as a fresh close.
    const { result, rerender } = mount({ isSplitGroupRoute: true, isPreviewOpen: true, deliberateCloseCount: 3 });
    rerender({ isSplitGroupRoute: true, isPreviewOpen: false, deliberateCloseCount: 3 });
    expect(result.current).toBe(true);
  });
});
