/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Covers the "mark conversation as unread" context-menu feature. The toggle in
 * `GroupedHistory/index.tsx` delegates to the completion-unread store exposed
 * by `useConversationListSync`. These tests assert that store contract directly:
 * marking flips `hasCompletionUnread` true, clearing flips it false, both are
 * idempotent, and each mutation drives a re-render so the sidebar dot updates.
 */

import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: { invoke: vi.fn(() => Promise.resolve({ items: [] })) },
    },
    conversation: {
      listChanged: { on: () => () => {} },
      responseStream: { on: () => () => {} },
      turnCompleted: { on: () => () => {} },
    },
    application: {
      writeRendererLog: { invoke: vi.fn(() => Promise.resolve()) },
    },
  },
}));
vi.mock('@/renderer/utils/emitter', () => ({ addEventListener: () => () => {} }));

import {
  useConversationListSync,
  setCompletionUnreadForTest,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';

afterEach(() => {
  cleanup();
  setCompletionUnreadForTest([]);
});

beforeEach(() => {
  setCompletionUnreadForTest([]);
});

describe('useConversationListSync — completion-unread toggle contract', () => {
  it('marks a conversation unread and reflects it on the next render', () => {
    const { result } = renderHook(() => useConversationListSync());

    expect(result.current.hasCompletionUnread('c1')).toBe(false);

    act(() => {
      result.current.markCompletionUnread('c1');
    });

    expect(result.current.hasCompletionUnread('c1')).toBe(true);
  });

  it('clearing an unread conversation flips it back to read', () => {
    const { result } = renderHook(() => useConversationListSync());

    act(() => {
      result.current.markCompletionUnread('c1');
    });
    expect(result.current.hasCompletionUnread('c1')).toBe(true);

    act(() => {
      result.current.clearCompletionUnread('c1');
    });
    expect(result.current.hasCompletionUnread('c1')).toBe(false);
  });

  it('is idempotent: marking twice keeps it unread, clearing a read one is a no-op', () => {
    const { result } = renderHook(() => useConversationListSync());

    act(() => {
      result.current.markCompletionUnread('c1');
      result.current.markCompletionUnread('c1');
    });
    expect(result.current.hasCompletionUnread('c1')).toBe(true);

    act(() => {
      result.current.clearCompletionUnread('c1');
      result.current.clearCompletionUnread('c1');
    });
    expect(result.current.hasCompletionUnread('c1')).toBe(false);
  });

  it('keeps other conversations independent', () => {
    const { result } = renderHook(() => useConversationListSync());

    act(() => {
      result.current.markCompletionUnread('c1');
    });

    expect(result.current.hasCompletionUnread('c1')).toBe(true);
    expect(result.current.hasCompletionUnread('c2')).toBe(false);

    act(() => {
      result.current.markCompletionUnread('c2');
    });
    expect(result.current.hasCompletionUnread('c1')).toBe(true);
    expect(result.current.hasCompletionUnread('c2')).toBe(true);
  });
});
