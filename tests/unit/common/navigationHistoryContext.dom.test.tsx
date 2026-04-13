/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NavigationHistoryProvider,
  useNavigationHistory,
} from '../../../src/renderer/hooks/context/NavigationHistoryContext';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockPathname = '/';
let mockSearch = '';
let mockHash = '';
const mockNavigate = vi.fn();

// Track listeners registered by useLocation via useEffect deps.
// We simulate location changes by mutating the mock values and
// re-rendering the hook.
vi.mock('react-router-dom', () => ({
  useLocation: () => ({
    pathname: mockPathname,
    search: mockSearch,
    hash: mockHash,
  }),
  useNavigate: () => mockNavigate,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
  <NavigationHistoryProvider>{children}</NavigationHistoryProvider>
);

/** Change the mock location and re-render so the useEffect fires. */
function navigateTo(
  hook: ReturnType<typeof renderHook<ReturnType<typeof useNavigationHistory>, unknown>>,
  pathname: string,
  search = '',
  hash = ''
) {
  mockPathname = pathname;
  mockSearch = search;
  mockHash = hash;
  hook.rerender(undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NavigationHistoryContext', () => {
  beforeEach(() => {
    mockPathname = '/';
    mockSearch = '';
    mockHash = '';
    mockNavigate.mockReset();
  });

  it('starts with canBack=false and canForward=false', () => {
    const { result } = renderHook(() => useNavigationHistory(), { wrapper });
    expect(result.current?.canBack).toBe(false);
    expect(result.current?.canForward).toBe(false);
  });

  it('pushing a new path enables canBack', () => {
    const hook = renderHook(() => useNavigationHistory(), { wrapper });
    expect(hook.result.current?.canBack).toBe(false);

    navigateTo(hook, '/conversation/1');
    expect(hook.result.current?.canBack).toBe(true);
    expect(hook.result.current?.canForward).toBe(false);
  });

  it('back() navigates to previous path with replace: true', () => {
    const hook = renderHook(() => useNavigationHistory(), { wrapper });

    navigateTo(hook, '/conversation/1');
    navigateTo(hook, '/conversation/2');

    act(() => {
      hook.result.current?.back();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/conversation/1', { replace: true });
    expect(hook.result.current?.canBack).toBe(true); // can still go back to /
    expect(hook.result.current?.canForward).toBe(true);
  });

  it('forward() navigates to next path with replace: true', () => {
    const hook = renderHook(() => useNavigationHistory(), { wrapper });

    navigateTo(hook, '/conversation/1');
    navigateTo(hook, '/conversation/2');

    act(() => {
      hook.result.current?.back();
    });
    mockNavigate.mockClear();

    act(() => {
      hook.result.current?.forward();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/conversation/2', { replace: true });
    expect(hook.result.current?.canForward).toBe(false);
  });

  it('new navigation after back() truncates forward stack', () => {
    const hook = renderHook(() => useNavigationHistory(), { wrapper });

    navigateTo(hook, '/a');
    navigateTo(hook, '/b');
    navigateTo(hook, '/c');

    // Go back twice: cursor at /a
    // After each back(), simulate the navigate() effect by updating mock location
    // so the useLocation hook returns the target path on re-render.
    act(() => hook.result.current?.back());
    navigateTo(hook, '/b'); // simulate navigate landing on /b
    act(() => hook.result.current?.back());
    navigateTo(hook, '/a'); // simulate navigate landing on /a
    expect(hook.result.current?.canForward).toBe(true);

    // New navigation from /a → /d should truncate /b and /c
    navigateTo(hook, '/d');
    expect(hook.result.current?.canForward).toBe(false);
    expect(hook.result.current?.canBack).toBe(true);
  });

  it('back() at start does nothing', () => {
    const hook = renderHook(() => useNavigationHistory(), { wrapper });

    act(() => {
      hook.result.current?.back();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(hook.result.current?.canBack).toBe(false);
  });

  it('forward() at end does nothing', () => {
    const hook = renderHook(() => useNavigationHistory(), { wrapper });

    act(() => {
      hook.result.current?.forward();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(hook.result.current?.canForward).toBe(false);
  });

  it('duplicate consecutive paths are not pushed', () => {
    const hook = renderHook(() => useNavigationHistory(), { wrapper });

    navigateTo(hook, '/conversation/1');
    navigateTo(hook, '/conversation/1');
    navigateTo(hook, '/conversation/1');

    expect(hook.result.current?.canBack).toBe(true);

    // Going back once should reach / (only one /conversation/1 was pushed)
    act(() => hook.result.current?.back());
    expect(hook.result.current?.canBack).toBe(false);
  });

  it('caps stack at 50 entries', () => {
    const hook = renderHook(() => useNavigationHistory(), { wrapper });

    for (let i = 1; i <= 55; i++) {
      navigateTo(hook, `/page/${i}`);
    }

    // Should be able to go back 49 times (50 entries, cursor at 49)
    let backCount = 0;
    while (hook.result.current?.canBack) {
      act(() => hook.result.current?.back());
      backCount++;
      // Safety valve
      if (backCount > 100) break;
    }

    expect(backCount).toBe(49);
  });

  it('tracks search and hash changes as distinct entries', () => {
    const hook = renderHook(() => useNavigationHistory(), { wrapper });

    navigateTo(hook, '/settings', '?tab=general');
    navigateTo(hook, '/settings', '?tab=about');

    expect(hook.result.current?.canBack).toBe(true);

    act(() => hook.result.current?.back());
    expect(mockNavigate).toHaveBeenCalledWith('/settings?tab=general', { replace: true });
  });
});
