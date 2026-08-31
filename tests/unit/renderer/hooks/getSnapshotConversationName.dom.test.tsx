/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/utils/emitter', () => ({
  addEventListener: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: {
        invoke: vi.fn().mockResolvedValue({
          items: [
            { id: 'c1', name: 'Quarterly report review' },
            { id: 'c2', name: '  padded name  ' },
            { id: 'c3', name: '   ' },
            { id: 'c4' },
          ],
        }),
      },
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

import {
  getSnapshotConversationName,
  useConversationListSync,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';

describe('getSnapshotConversationName', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the trimmed name for a loaded conversation, undefined otherwise', async () => {
    renderHook(() => useConversationListSync());

    // The store loads conversations asynchronously on mount.
    await waitFor(() => {
      expect(getSnapshotConversationName('c1')).toBe('Quarterly report review');
    });

    expect(getSnapshotConversationName('c2')).toBe('padded name');
    // Whitespace-only name → treated as no name.
    expect(getSnapshotConversationName('c3')).toBeUndefined();
    // Missing name field → undefined.
    expect(getSnapshotConversationName('c4')).toBeUndefined();
    // Unknown conversation id → undefined.
    expect(getSnapshotConversationName('nope')).toBeUndefined();
  });
});
