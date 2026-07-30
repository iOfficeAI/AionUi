/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useProjectExplorerColumnWidth } from '@/renderer/hooks/ui/useProjectExplorerColumnWidth';

// Constants mirrored from layoutCalc for readable expectations.
const MIN_WS = 220;
const RESERVE_CHAT = 360;
const RESERVE_PREVIEW = 340;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('chat-workspace-width-px', '400'); // requested width
});

describe('useProjectExplorerColumnWidth (P2 two-level clamp)', () => {
  it('uses the requested width when the row is wide enough (preview open)', () => {
    // available 1500, reserve 360+340=700 → maxByContainer=800 → min(400,800)=400
    const { result } = renderHook(() => useProjectExplorerColumnWidth(1500, true, true));
    expect(result.current.widthPx).toBe(400);
  });

  it('clamps down (to the MIN floor) when preview open leaves too little room', () => {
    // available 900, reserve 700 → maxByContainer=max(220,200)=220 → clamped to MIN
    const { result } = renderHook(() => useProjectExplorerColumnWidth(900, true, true));
    expect(result.current.widthPx).toBe(MIN_WS);
  });

  it('reserves less when preview is closed (chat-only), so the requested width fits', () => {
    // available 900, reserve 360 → maxByContainer=540 → min(400,540)=400
    const { result } = renderHook(() => useProjectExplorerColumnWidth(900, false, true));
    expect(result.current.widthPx).toBe(400);
  });

  it('clamps to leave exactly the reserve (chat + preview + preview chrome) when the row is moderately narrow (preview open)', () => {
    // available 1000, reserve = 360 + 340 + 24 (preview chrome) = 724 → max=276 → min(400,276)=276
    const CHROME = 24;
    const { result } = renderHook(() => useProjectExplorerColumnWidth(1000, true, true));
    expect(result.current.widthPx).toBe(1000 - (RESERVE_CHAT + RESERVE_PREVIEW + CHROME));
  });
});
