/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoist mocks ---

const { mockNavigate, mockOn, mockOff } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockOn: vi.fn().mockImplementation(() => mockOff),
  mockOff: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../../src/common', () => ({
  ipcBridge: {
    deepLink: {
      received: {
        on: (handler: unknown) => {
          mockOn(handler);
          return mockOff;
        },
      },
    },
  },
}));

import { useDeepLink } from '../../../src/renderer/hooks/system/useDeepLink';

describe('useDeepLink — navigate action', () => {
  let capturedHandler: ((payload: { action: string; params: Record<string, string> }) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandler = null;

    // Capture the handler registered by the hook
    mockOn.mockImplementation((handler: (payload: { action: string; params: Record<string, string> }) => void) => {
      capturedHandler = handler;
    });
  });

  function setupHook() {
    renderHook(() => useDeepLink());
    expect(capturedHandler).not.toBeNull();
  }

  it('navigates to /team/:id when route is allowed', () => {
    setupHook();

    act(() => {
      capturedHandler!({ action: 'navigate', params: { route: '/team/abc-123-def' } });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/team/abc-123-def');
  });

  it('navigates to /conversation/:id when route is allowed', () => {
    setupHook();

    act(() => {
      capturedHandler!({ action: 'navigate', params: { route: '/conversation/xyz-789' } });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/conversation/xyz-789');
  });

  it('does not navigate when route is not in whitelist', () => {
    setupHook();

    act(() => {
      capturedHandler!({ action: 'navigate', params: { route: '/evil/path' } });
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate when route is empty string', () => {
    setupHook();

    act(() => {
      capturedHandler!({ action: 'navigate', params: { route: '' } });
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate when route param is missing', () => {
    setupHook();

    act(() => {
      capturedHandler!({ action: 'navigate', params: {} });
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate for /team/ without an id segment', () => {
    setupHook();

    act(() => {
      capturedHandler!({ action: 'navigate', params: { route: '/team/' } });
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate for /settings/model even though it looks valid', () => {
    setupHook();

    act(() => {
      capturedHandler!({ action: 'navigate', params: { route: '/settings/model' } });
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
