/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for ConversationManageWithDB (message queue):
 *   - flush() with async lock pattern (replaces unbounded promise chain)
 *   - dispose() clears timer and stack
 *   - removeFromMessageCache() lifecycle
 *   - addMessage / addOrUpdateMessage basic paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockDb = vi.hoisted(() => ({
  getConversation: vi.fn(() => ({ success: true, data: { id: 'conv-1' } })),
  getConversationMessages: vi.fn(() => ({ data: [] })),
  insertMessage: vi.fn(),
  updateMessage: vi.fn(),
  createConversation: vi.fn(() => ({ success: true })),
}));

vi.mock('@process/services/database/export', () => ({
  getDatabase: vi.fn(() => Promise.resolve(mockDb)),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessChat: {
    get: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock('@/common/chat/chatLib', () => ({
  composeMessage: vi.fn((_msg, list, _cb) => list),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  addMessage,
  addOrUpdateMessage,
  removeFromMessageCache,
  executePendingCallbacks,
  nextTickToLocalFinish,
} from '../../src/process/utils/message';

describe('message queue (ConversationManageWithDB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('addMessage triggers immediate flush via insert path', async () => {
    const msg = { id: 'msg-1', msg_id: 'msg-1', type: 'text', position: 'left', conversation_id: 'conv-flush' } as any;
    addMessage('conv-flush', msg);

    // Let the constructor's dbPromise + ensureConversationExists resolve
    await vi.advanceTimersByTimeAsync(0);
    // Let the flush itself resolve
    await vi.advanceTimersByTimeAsync(0);

    expect(mockDb.insertMessage).toHaveBeenCalledWith(msg);
  });

  it('addOrUpdateMessage with accumulate uses debounced flush (2s)', async () => {
    // First trigger init to complete by adding a dummy insert
    const initMsg = {
      id: 'msg-init',
      msg_id: 'msg-init',
      type: 'text',
      position: 'left',
      conversation_id: 'conv-debounce',
    } as any;
    addMessage('conv-debounce', initMsg);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    mockDb.getConversationMessages.mockClear();

    // Now test the accumulate path with debounce
    const msg = {
      id: 'msg-2',
      msg_id: 'msg-2',
      type: 'text',
      position: 'left',
      conversation_id: 'conv-debounce',
    } as any;
    addOrUpdateMessage('conv-debounce', msg);

    // Not flushed yet (debounce is 2000ms)
    expect(mockDb.getConversationMessages).not.toHaveBeenCalled();

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(2100);

    // Now the flush should have run
    expect(mockDb.getConversationMessages).toHaveBeenCalled();
  });

  it('addOrUpdateMessage rejects undefined message', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    addOrUpdateMessage('conv-x', undefined as any);
    expect(consoleSpy).toHaveBeenCalledWith('[Message] Cannot add or update undefined message');
    consoleSpy.mockRestore();
  });

  it('addOrUpdateMessage rejects message without id', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    addOrUpdateMessage('conv-x', { type: 'text' } as any);
    expect(consoleSpy).toHaveBeenCalledWith('[Message] Message missing required id field:', expect.any(Object));
    consoleSpy.mockRestore();
  });

  it('removeFromMessageCache disposes and deletes from cache', async () => {
    const msg = { id: 'msg-rm', msg_id: 'msg-rm', type: 'text', position: 'left', conversation_id: 'conv-rm' } as any;
    addMessage('conv-rm', msg);
    await vi.advanceTimersByTimeAsync(0);

    // Now remove
    removeFromMessageCache('conv-rm');

    // Adding another message to same conv should create a new instance (not reuse disposed one)
    addMessage('conv-rm', { ...msg, id: 'msg-rm-2', msg_id: 'msg-rm-2' });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    // insertMessage should be called for both messages (separate instances)
    expect(mockDb.insertMessage).toHaveBeenCalledTimes(2);
  });

  it('removeFromMessageCache is no-op for unknown conversation', () => {
    // Should not throw
    expect(() => removeFromMessageCache('nonexistent')).not.toThrow();
  });

  it('flush handles errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDb.getConversationMessages.mockImplementationOnce(() => {
      throw new Error('DB read error');
    });

    const msg = {
      id: 'msg-err',
      msg_id: 'msg-err',
      type: 'text',
      position: 'left',
      conversation_id: 'conv-err',
    } as any;
    addMessage('conv-err', msg);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(consoleSpy).toHaveBeenCalledWith('[Message] flush error:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('flush re-runs if new messages arrive during flush', async () => {
    // First message triggers flush
    const msg1 = { id: 'm1', msg_id: 'm1', type: 'text', position: 'left', conversation_id: 'conv-rerun' } as any;
    const msg2 = { id: 'm2', msg_id: 'm2', type: 'text', position: 'left', conversation_id: 'conv-rerun' } as any;

    // Make getConversationMessages add a second message during first flush
    let firstCall = true;
    mockDb.getConversationMessages.mockImplementation(() => {
      if (firstCall) {
        firstCall = false;
        // Simulate adding another message while flush is in progress
        addMessage('conv-rerun', msg2);
      }
      return { data: [] };
    });

    addMessage('conv-rerun', msg1);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    // Both messages should have been inserted
    expect(mockDb.insertMessage).toHaveBeenCalledWith(msg1);
    expect(mockDb.insertMessage).toHaveBeenCalledWith(msg2);
  });

  it('constructor handles ensureConversationExists failure gracefully', async () => {
    mockDb.getConversation.mockReturnValueOnce({ success: false, data: null });

    const msg = {
      id: 'msg-fail',
      msg_id: 'msg-fail',
      type: 'text',
      position: 'left',
      conversation_id: 'conv-fail-init',
    } as any;
    addMessage('conv-fail-init', msg);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    // Should still work — initialized is set to true in catch path
    expect(mockDb.insertMessage).toHaveBeenCalled();
  });

  it('executePendingCallbacks runs all callbacks', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    nextTickToLocalFinish(fn1);
    nextTickToLocalFinish(fn2);
    executePendingCallbacks();
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it('executePendingCallbacks handles errors in callbacks', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badFn = () => {
      throw new Error('callback error');
    };
    const goodFn = vi.fn();
    nextTickToLocalFinish(badFn);
    nextTickToLocalFinish(goodFn);
    executePendingCallbacks();
    expect(consoleSpy).toHaveBeenCalledWith('[Message] Error in pending callback:', expect.any(Error));
    expect(goodFn).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });
});
