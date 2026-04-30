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

const mockComposeMessage = vi.hoisted(() => vi.fn((_msg, list, _cb) => list));

vi.mock('@/common/chat/chatLib', () => ({
  composeMessage: mockComposeMessage,
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

  it('addMessage primes the in-memory list before accumulate updates run', async () => {
    const msg = { id: 'msg-1', msg_id: 'msg-1', type: 'text', position: 'left', conversation_id: 'conv-flush' } as any;
    addMessage('conv-flush', msg);
    await vi.advanceTimersByTimeAsync(0);

    addOrUpdateMessage('conv-flush', { ...msg, id: 'msg-2', msg_id: 'msg-2' });
    await vi.advanceTimersByTimeAsync(2100);

    expect(mockComposeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'msg-2' }),
      [expect.objectContaining({ id: 'msg-1' })],
      expect.any(Function)
    );
  });

  it('addOrUpdateMessage with accumulate uses debounced flush (2s)', async () => {
    const initMsg = {
      id: 'msg-init',
      msg_id: 'msg-init',
      type: 'text',
      position: 'left',
      conversation_id: 'conv-debounce',
    } as any;
    addMessage('conv-debounce', initMsg);
    await vi.advanceTimersByTimeAsync(0);
    mockComposeMessage.mockClear();

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
    expect(mockComposeMessage).not.toHaveBeenCalled();

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(2100);

    // Now the flush should have run
    expect(mockComposeMessage).toHaveBeenCalled();
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
    addOrUpdateMessage('conv-rm', { ...msg, id: 'msg-rm-3', msg_id: 'msg-rm-3' });
    await vi.advanceTimersByTimeAsync(2100);

    // composeMessage sees only the second instance's inserted message
    expect(mockComposeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'msg-rm-3' }),
      [expect.objectContaining({ id: 'msg-rm-2' })],
      expect.any(Function)
    );
  });

  it('removeFromMessageCache is no-op for unknown conversation', () => {
    // Should not throw
    expect(() => removeFromMessageCache('nonexistent')).not.toThrow();
  });

  it('flush handles errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockComposeMessage.mockImplementationOnce(() => {
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
    addOrUpdateMessage('conv-err', { ...msg, id: 'msg-err-2', msg_id: 'msg-err-2' });

    await vi.advanceTimersByTimeAsync(2100);

    expect(consoleSpy).toHaveBeenCalledWith('[Message] flush error:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('flush re-runs if new messages arrive during flush', async () => {
    const msg1 = { id: 'm1', msg_id: 'm1', type: 'text', position: 'left', conversation_id: 'conv-rerun' } as any;
    const msg2 = { id: 'm2', msg_id: 'm2', type: 'text', position: 'left', conversation_id: 'conv-rerun' } as any;

    addMessage('conv-rerun', msg1);
    await vi.advanceTimersByTimeAsync(0);

    let firstCall = true;
    mockComposeMessage.mockImplementation(() => {
      if (firstCall) {
        firstCall = false;
        addOrUpdateMessage('conv-rerun', msg2);
      }
      return [msg1];
    });

    addOrUpdateMessage('conv-rerun', { ...msg1, id: 'm1-update', msg_id: 'm1-update' });
    await vi.advanceTimersByTimeAsync(2100);
    await vi.advanceTimersByTimeAsync(2100);

    expect(mockComposeMessage).toHaveBeenCalledTimes(2);
  });

  it('constructor no longer depends on database bootstrap', async () => {
    const msg = {
      id: 'msg-fail',
      msg_id: 'msg-fail',
      type: 'text',
      position: 'left',
      conversation_id: 'conv-fail-init',
    } as any;
    addMessage('conv-fail-init', msg);
    await vi.advanceTimersByTimeAsync(0);
    addOrUpdateMessage('conv-fail-init', { ...msg, id: 'msg-fail-2', msg_id: 'msg-fail-2' });
    await vi.advanceTimersByTimeAsync(2100);

    expect(mockComposeMessage).toHaveBeenCalled();
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
