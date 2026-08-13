/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/utils/emitter', () => ({
  addEventListener: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: { invoke: vi.fn().mockResolvedValue({ items: [] }) },
    },
    application: {
      writeRendererLog: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
    conversation: {
      listChanged: { on: vi.fn() },
      responseStream: { on: vi.fn() },
      turnCompleted: { on: vi.fn() },
    },
  },
}));

import { useConversationListSync } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';

const STORAGE_KEY = 'conversation-manual-unread-ids';

describe('useConversationListSync manual unread persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('isManualUnread reflects the persisted set and survives a reload', () => {
    const { result, unmount } = renderHook(() => useConversationListSync());

    act(() => {
      result.current.markManualUnread('conv-1');
    });
    expect(result.current.isManualUnread('conv-1')).toBe(true);
    expect(result.current.isManualUnread('conv-2')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(['conv-1']));

    unmount();

    // A fresh hook reads the persisted value from localStorage.
    const { result: second } = renderHook(() => useConversationListSync());
    expect(second.current.isManualUnread('conv-1')).toBe(true);
  });

  it('clearManualUnread removes the id and updates localStorage', () => {
    const { result } = renderHook(() => useConversationListSync());

    act(() => {
      result.current.markManualUnread('conv-1');
      result.current.markManualUnread('conv-2');
    });
    expect(result.current.isManualUnread('conv-1')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(['conv-1', 'conv-2']));

    act(() => {
      result.current.clearManualUnread('conv-1');
    });
    expect(result.current.isManualUnread('conv-1')).toBe(false);
    expect(result.current.isManualUnread('conv-2')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(['conv-2']));
  });

  it('ignores malformed stored values', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    const { result } = renderHook(() => useConversationListSync());

    expect(result.current.isManualUnread('conv-1')).toBe(false);
  });
});
