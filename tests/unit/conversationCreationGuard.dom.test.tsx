/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef, useCallback } from 'react';

/**
 * Tests for the conversation creation concurrency guard pattern used in:
 * - ConversationTabs.tsx handleCreateConversation
 * - ChatConversation.tsx _AddNewConversation
 *
 * Under weak network conditions, rapid clicks can fire multiple IPC calls
 * before the first one resolves, creating duplicate conversations (#1609).
 * The ref-based guard ensures only one creation runs at a time.
 */

function useCreationGuard(createFn: () => Promise<void>) {
  const isCreatingRef = useRef(false);

  const guardedCreate = useCallback(async () => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    try {
      await createFn();
    } finally {
      isCreatingRef.current = false;
    }
  }, [createFn]);

  return { guardedCreate, isCreatingRef };
}

describe('Conversation creation concurrency guard (#1609)', () => {
  let createFn: ReturnType<typeof vi.fn>;
  let resolvers: Array<() => void>;

  beforeEach(() => {
    resolvers = [];
    createFn = vi.fn(() => new Promise<void>((resolve) => resolvers.push(resolve)));
  });

  it('should allow a single creation call', async () => {
    const { result } = renderHook(() => useCreationGuard(createFn));

    await act(async () => {
      const promise = result.current.guardedCreate();
      resolvers[0]();
      await promise;
    });

    expect(createFn).toHaveBeenCalledTimes(1);
  });

  it('should block concurrent creation calls while one is in progress', async () => {
    const { result } = renderHook(() => useCreationGuard(createFn));

    // Start first creation (does not resolve yet)
    let firstPromise: Promise<void>;
    await act(async () => {
      firstPromise = result.current.guardedCreate();
    });

    // Attempt second creation while first is still pending
    await act(async () => {
      void result.current.guardedCreate();
    });

    // Attempt third creation
    await act(async () => {
      void result.current.guardedCreate();
    });

    // Only one call should have been made
    expect(createFn).toHaveBeenCalledTimes(1);

    // Resolve the first creation
    await act(async () => {
      resolvers[0]();
      await firstPromise!;
    });

    // Guard should be released — next call should work
    await act(async () => {
      const promise = result.current.guardedCreate();
      resolvers[1]();
      await promise;
    });

    expect(createFn).toHaveBeenCalledTimes(2);
  });

  it('should release the guard even if creation fails', async () => {
    const failingFn = vi.fn(() => Promise.reject(new Error('network error')));
    const { result } = renderHook(() => useCreationGuard(failingFn));

    // First call fails
    await act(async () => {
      await result.current.guardedCreate().catch(() => {});
    });

    expect(failingFn).toHaveBeenCalledTimes(1);
    expect(result.current.isCreatingRef.current).toBe(false);

    // Second call should work (guard released)
    await act(async () => {
      await result.current.guardedCreate().catch(() => {});
    });

    expect(failingFn).toHaveBeenCalledTimes(2);
  });

  it('should simulate rapid clicks under weak network (N clicks = 1 creation)', async () => {
    const { result } = renderHook(() => useCreationGuard(createFn));
    const clickCount = 10;

    // Simulate 10 rapid clicks
    const promises: Promise<void>[] = [];
    await act(async () => {
      for (let i = 0; i < clickCount; i++) {
        promises.push(result.current.guardedCreate());
      }
    });

    // Only 1 creation call should have been made
    expect(createFn).toHaveBeenCalledTimes(1);

    // Resolve and verify
    await act(async () => {
      resolvers[0]();
      await Promise.all(promises);
    });

    expect(createFn).toHaveBeenCalledTimes(1);
  });
});
