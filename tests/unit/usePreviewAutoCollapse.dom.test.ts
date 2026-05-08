/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { PreviewAutoCollapseMemory } from '@/renderer/pages/conversation/Preview/context/PreviewContext';

// Shared memory simulating PreviewProvider's app-root ref. It survives hook
// unmount/remount, mirroring how PreviewProvider sits above ChatLayout's
// `key={team.id}` boundary on the team page.
const memoryRef: { current: PreviewAutoCollapseMemory } = {
  current: {
    previousPreviewOpen: false,
    previousWorkspaceCollapsed: null,
    previousSiderCollapsed: null,
  },
};

vi.mock('@/renderer/pages/conversation/Preview/context', () => ({
  usePreviewContext: () => ({ autoCollapseMemoryRef: memoryRef }),
}));

import { usePreviewAutoCollapse } from '@/renderer/pages/conversation/hooks/usePreviewAutoCollapse';

type Params = Parameters<typeof usePreviewAutoCollapse>[0];

const baseParams = (overrides: Partial<Params> = {}): Params => ({
  isPreviewOpen: false,
  isDesktop: true,
  workspaceEnabled: true,
  rightSiderCollapsed: false,
  setRightSiderCollapsed: vi.fn(),
  siderCollapsed: false,
  setSiderCollapsed: vi.fn(),
  ...overrides,
});

describe('usePreviewAutoCollapse', () => {
  beforeEach(() => {
    memoryRef.current = {
      previousPreviewOpen: false,
      previousWorkspaceCollapsed: null,
      previousSiderCollapsed: null,
    };
  });

  it('force-collapses sidebar and workspace when preview opens for the first time', () => {
    const setRightSiderCollapsed = vi.fn();
    const setSiderCollapsed = vi.fn();
    renderHook(() =>
      usePreviewAutoCollapse(
        baseParams({
          isPreviewOpen: true,
          rightSiderCollapsed: false,
          siderCollapsed: false,
          setRightSiderCollapsed,
          setSiderCollapsed,
        })
      )
    );

    expect(setRightSiderCollapsed).toHaveBeenCalledWith(true);
    expect(setSiderCollapsed).toHaveBeenCalledWith(true);
    expect(memoryRef.current.previousPreviewOpen).toBe(true);
    expect(memoryRef.current.previousWorkspaceCollapsed).toBe(false);
    expect(memoryRef.current.previousSiderCollapsed).toBe(false);
  });

  it('restores sidebar to its prior state when preview closes', () => {
    const setRightSiderCollapsed = vi.fn();
    const setSiderCollapsed = vi.fn();

    let isPreviewOpen = true;
    const { rerender } = renderHook(() =>
      usePreviewAutoCollapse(
        baseParams({
          isPreviewOpen,
          rightSiderCollapsed: false,
          siderCollapsed: false,
          setRightSiderCollapsed,
          setSiderCollapsed,
        })
      )
    );

    isPreviewOpen = false;
    rerender();

    expect(setRightSiderCollapsed).toHaveBeenLastCalledWith(false);
    expect(setSiderCollapsed).toHaveBeenLastCalledWith(false);
    expect(memoryRef.current.previousWorkspaceCollapsed).toBeNull();
    expect(memoryRef.current.previousSiderCollapsed).toBeNull();
    expect(memoryRef.current.previousPreviewOpen).toBe(false);
  });

  it('does not re-trigger force-collapse on remount when preview is still open (team-switch bug)', () => {
    // First mount — simulates ChatLayout under team A.
    const firstSetRight = vi.fn();
    const firstSetSider = vi.fn();
    const { unmount } = renderHook(() =>
      usePreviewAutoCollapse(
        baseParams({
          isPreviewOpen: true,
          rightSiderCollapsed: false,
          siderCollapsed: false,
          setRightSiderCollapsed: firstSetRight,
          setSiderCollapsed: firstSetSider,
        })
      )
    );
    expect(firstSetSider).toHaveBeenCalledWith(true);

    // ChatLayout remounts because team page does `key={team.id}`. The
    // PreviewProvider above stays mounted, so memoryRef.previousPreviewOpen
    // is still true. The user has reopened the sidebar in the meantime.
    unmount();

    const secondSetRight = vi.fn();
    const secondSetSider = vi.fn();
    renderHook(() =>
      usePreviewAutoCollapse(
        baseParams({
          isPreviewOpen: true,
          rightSiderCollapsed: true,
          siderCollapsed: false, // user-visible state after team switch
          setRightSiderCollapsed: secondSetRight,
          setSiderCollapsed: secondSetSider,
        })
      )
    );

    // The hook must NOT force-collapse again — the open transition already
    // happened under team A and the memory reflects that.
    expect(secondSetRight).not.toHaveBeenCalled();
    expect(secondSetSider).not.toHaveBeenCalled();
  });

  it('restores sidebar to its pre-open state after team switch when preview is closed', () => {
    // Regression for the original bug: after switching teams (ChatLayout
    // remount), closing the preview must still restore the sidebar to the
    // state captured before the FIRST open under the previous team — not
    // the post-switch state.

    // Team A: user starts with sidebar expanded, then opens preview.
    const firstSetRight = vi.fn();
    const firstSetSider = vi.fn();
    const { unmount } = renderHook(() =>
      usePreviewAutoCollapse(
        baseParams({
          isPreviewOpen: true,
          rightSiderCollapsed: false,
          siderCollapsed: false,
          setRightSiderCollapsed: firstSetRight,
          setSiderCollapsed: firstSetSider,
        })
      )
    );
    expect(firstSetSider).toHaveBeenCalledWith(true);
    expect(memoryRef.current.previousSiderCollapsed).toBe(false);
    expect(memoryRef.current.previousWorkspaceCollapsed).toBe(false);

    // ChatLayout remounts on team switch; PreviewProvider (memoryRef) survives.
    unmount();

    // Team B: hook remounts with isPreviewOpen still true. Sidebar is
    // currently collapsed from the previous force-collapse.
    let isPreviewOpen = true;
    const secondSetRight = vi.fn();
    const secondSetSider = vi.fn();
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        usePreviewAutoCollapse(
          baseParams({
            isPreviewOpen: open,
            rightSiderCollapsed: true,
            siderCollapsed: true,
            setRightSiderCollapsed: secondSetRight,
            setSiderCollapsed: secondSetSider,
          })
        ),
      { initialProps: { open: isPreviewOpen } }
    );

    // Remount alone must not trigger collapse again.
    expect(secondSetSider).not.toHaveBeenCalled();
    expect(secondSetRight).not.toHaveBeenCalled();

    // User now closes the preview under team B.
    isPreviewOpen = false;
    rerender({ open: isPreviewOpen });

    // Sidebar must be restored to the pre-open state captured under team A.
    expect(secondSetSider).toHaveBeenLastCalledWith(false);
    expect(secondSetRight).toHaveBeenLastCalledWith(false);

    // Memory is cleared so a future open captures fresh state.
    expect(memoryRef.current.previousSiderCollapsed).toBeNull();
    expect(memoryRef.current.previousWorkspaceCollapsed).toBeNull();
    expect(memoryRef.current.previousPreviewOpen).toBe(false);
  });

  it('skips collapse logic on non-desktop layouts', () => {
    const setRightSiderCollapsed = vi.fn();
    const setSiderCollapsed = vi.fn();
    renderHook(() =>
      usePreviewAutoCollapse(
        baseParams({
          isPreviewOpen: true,
          isDesktop: false,
          setRightSiderCollapsed,
          setSiderCollapsed,
        })
      )
    );

    expect(setRightSiderCollapsed).not.toHaveBeenCalled();
    expect(setSiderCollapsed).not.toHaveBeenCalled();
    expect(memoryRef.current.previousPreviewOpen).toBe(false);
  });
});
