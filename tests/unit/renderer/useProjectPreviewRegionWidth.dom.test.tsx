/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useProjectPreviewRegionWidth } from '@/renderer/hooks/ui/useProjectPreviewRegionWidth';

const MIN_CHAT = 360;
const MIN_PREVIEW = 340;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('chat-preview-width-px', '480'); // requested width
});

describe('useProjectPreviewRegionWidth (P4 ordered clamp)', () => {
  it('uses the requested width when there is ample room', () => {
    // available 2000, explorer 300 → max = 2000-360-300 = 1340 → min(480,1340)=480
    const { result } = renderHook(() => useProjectPreviewRegionWidth(2000, 300, true));
    expect(result.current.widthPx).toBe(480);
  });

  it('clamps so chat keeps MIN_CHAT after the explorer + preview chrome', () => {
    // available 1256, explorer 501, preview chrome 24 (ml-8+mr-12+border+buffer)
    // → max = 1256-360-501-24 = 371 → min(480,371)=371
    // ⇒ occupied preview+chrome = 371+24 = 395; content = 1256-501-395 = 360 = MIN_CHAT
    const CHROME = 24;
    const { result } = renderHook(() => useProjectPreviewRegionWidth(1256, 501, true));
    expect(result.current.widthPx).toBe(371);
    expect(1256 - 501 - result.current.widthPx - CHROME).toBe(MIN_CHAT);
  });

  it('gets more room when the explorer is collapsed (width 0)', () => {
    // available 1256, explorer 0 → max = 896 → min(480,896)=480
    const { result } = renderHook(() => useProjectPreviewRegionWidth(1256, 0, true));
    expect(result.current.widthPx).toBe(480);
  });

  it('never drops below MIN_PREVIEW even when the row is very tight', () => {
    // available 900, explorer 400 → max = max(340, 900-360-400=140) = 340 (floor)
    const { result } = renderHook(() => useProjectPreviewRegionWidth(900, 400, true));
    expect(result.current.widthPx).toBe(MIN_PREVIEW);
  });
});
