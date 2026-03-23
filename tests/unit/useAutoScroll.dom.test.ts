/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoScroll } from '../../src/renderer/pages/conversation/Messages/useAutoScroll';
import type { TMessage, IMessageText } from '../../src/common/chat/chatLib';

// Mock VirtuosoHandle
const createMockVirtuosoHandle = () => ({
  scrollToIndex: vi.fn(),
  scrollTo: vi.fn(),
  scrollBy: vi.fn(),
  getState: vi.fn(),
  autoscrollToBottom: vi.fn(),
});

describe('useAutoScroll - scroll to bottom on message send (#977)', () => {
  let mockVirtuosoHandle: ReturnType<typeof createMockVirtuosoHandle>;

  beforeEach(() => {
    mockVirtuosoHandle = createMockVirtuosoHandle();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const createMessage = (position: 'left' | 'right', id: string): IMessageText => ({
    id,
    msg_id: id,
    type: 'text',
    position,
    conversation_id: 'test-conv',
    content: { content: 'test message' },
    createdAt: Date.now(),
  });

  it('should scroll to bottom when user sends a message (position=right)', async () => {
    const initialMessages: TMessage[] = [createMessage('left', '1'), createMessage('right', '2')];

    const { result, rerender } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: initialMessages, itemCount: 2 },
    });

    // Manually set the ref to mock Virtuoso
    (result.current.virtuosoRef as any).current = mockVirtuosoHandle;

    // Add a new user message (position=right)
    const newMessages: TMessage[] = [...initialMessages, createMessage('right', '3')];

    rerender({ messages: newMessages, itemCount: 3 });

    // Wait for double RAF
    await act(async () => {
      vi.runAllTimers();
    });

    // Should have called scrollToIndex with 'LAST'
    expect(mockVirtuosoHandle.scrollToIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'LAST',
        behavior: 'auto',
        align: 'end',
      })
    );
  });

  it('should NOT scroll when AI responds (position=left)', async () => {
    const initialMessages: TMessage[] = [createMessage('right', '1')];

    const { result, rerender } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: initialMessages, itemCount: 1 },
    });

    (result.current.virtuosoRef as any).current = mockVirtuosoHandle;

    // Add AI response (position=left)
    const newMessages: TMessage[] = [...initialMessages, createMessage('left', '2')];

    rerender({ messages: newMessages, itemCount: 2 });

    await act(async () => {
      vi.runAllTimers();
    });

    // Should NOT call scrollToIndex for AI messages
    expect(mockVirtuosoHandle.scrollToIndex).not.toHaveBeenCalled();
  });

  it('should reset userScrolled flag when user sends message', async () => {
    const initialMessages: TMessage[] = [createMessage('left', '1')];

    const { result, rerender } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: initialMessages, itemCount: 1 },
    });

    (result.current.virtuosoRef as any).current = mockVirtuosoHandle;

    // Simulate user scrolling up
    act(() => {
      const mockEvent = {
        target: { scrollTop: 0 },
      } as unknown as React.UIEvent<HTMLDivElement>;

      // First set a high scroll position
      result.current.handleScroll({
        target: { scrollTop: 500 },
      } as unknown as React.UIEvent<HTMLDivElement>);

      // Then scroll up (delta < -10)
      result.current.handleScroll(mockEvent);
    });

    // Add user message - should force scroll
    const newMessages: TMessage[] = [...initialMessages, createMessage('right', '2')];

    rerender({ messages: newMessages, itemCount: 2 });

    await act(async () => {
      vi.runAllTimers();
    });

    // Should still scroll because user sent a message
    expect(mockVirtuosoHandle.scrollToIndex).toHaveBeenCalled();
  });

  it('should show scroll button when not at bottom', () => {
    const { result } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: [], itemCount: 0 },
    });

    // Initially hidden
    expect(result.current.showScrollButton).toBe(false);

    // Simulate not at bottom
    act(() => {
      result.current.handleAtBottomStateChange(false);
    });

    expect(result.current.showScrollButton).toBe(true);

    // Back to bottom
    act(() => {
      result.current.handleAtBottomStateChange(true);
    });

    expect(result.current.showScrollButton).toBe(false);
  });

  it('should provide scrollToBottom function for manual scroll', () => {
    const { result } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: [], itemCount: 5 },
    });

    (result.current.virtuosoRef as any).current = mockVirtuosoHandle;

    act(() => {
      result.current.scrollToBottom('smooth');
    });

    expect(mockVirtuosoHandle.scrollToIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 4, // itemCount - 1
        behavior: 'smooth',
        align: 'end',
      })
    );
  });

  it('should handle followOutput correctly based on scroll state', () => {
    const { result } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: [], itemCount: 0 },
    });

    // When at bottom and not user-scrolled, should return 'auto'
    expect(result.current.handleFollowOutput(true)).toBe('auto');

    // When not at bottom, should return false
    expect(result.current.handleFollowOutput(false)).toBe(false);
  });
});
