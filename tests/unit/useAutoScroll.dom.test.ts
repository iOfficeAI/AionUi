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

// ResizeObserver mock that allows triggering callbacks
type ResizeObserverCallback = (entries: ResizeObserverEntry[]) => void;
let resizeObserverCallbacks: ResizeObserverCallback[] = [];

class ResizeObserverTestMock {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObserverCallbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    resizeObserverCallbacks = resizeObserverCallbacks.filter((cb) => cb !== this.callback);
  }
}

function triggerResizeObservers() {
  for (const cb of resizeObserverCallbacks) {
    cb([] as unknown as ResizeObserverEntry[]);
  }
}

// Create a real DOM element with overridable scroll properties
function createScrollerEl(props: { clientHeight: number; scrollHeight: number; scrollTop: number }): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientHeight', { get: () => props.clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { get: () => props.scrollHeight, configurable: true });
  el.scrollTop = props.scrollTop;
  return el;
}

describe('useAutoScroll - scroll to bottom on message send (#977)', () => {
  let mockVirtuosoHandle: ReturnType<typeof createMockVirtuosoHandle>;

  beforeEach(() => {
    mockVirtuosoHandle = createMockVirtuosoHandle();
    resizeObserverCallbacks = [];
    global.ResizeObserver = ResizeObserverTestMock as unknown as typeof ResizeObserver;
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

    // When not user-scrolled, should return 'auto' regardless of isAtBottom
    expect(result.current.handleFollowOutput(true)).toBe('auto');
    expect(result.current.handleFollowOutput(false)).toBe('auto');
  });
});

describe('useAutoScroll - streaming guard refresh (#2017)', () => {
  let mockVirtuosoHandle: ReturnType<typeof createMockVirtuosoHandle>;

  beforeEach(() => {
    mockVirtuosoHandle = createMockVirtuosoHandle();
    resizeObserverCallbacks = [];
    global.ResizeObserver = ResizeObserverTestMock as unknown as typeof ResizeObserver;
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

  /**
   * Simulates the scroll sequence that occurs during Virtuoso auto-follow:
   * 1. Positive delta (Virtuoso scrolling down to follow content)
   * 2. Small negative delta (Virtuoso rAF adjustment)
   *
   * Before the fix: step 2 would set userScrolledRef=true, breaking auto-scroll.
   * After the fix: step 1 refreshes the guard, so step 2 is ignored.
   */
  it('should not detect Virtuoso rAF adjustments as user scroll-up during auto-follow', () => {
    const { result } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: [createMessage('left', '1')], itemCount: 1 },
    });

    // Simulate auto-follow: positive scroll (Virtuoso scrolling down)
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 100, scrollHeight: 1000, clientHeight: 500 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });

    // Simulate Virtuoso rAF micro-adjustment (small negative delta)
    // This happens within the guard window refreshed by the positive delta
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 85, scrollHeight: 1000, clientHeight: 500 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });

    // followOutput should still return 'auto' (userScrolled should be false)
    expect(result.current.handleFollowOutput(false)).toBe('auto');
  });

  it('should detect real user scroll-up when guard has expired', () => {
    const { result } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: [createMessage('left', '1')], itemCount: 1 },
    });

    // Set initial scroll position
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 500, scrollHeight: 1000, clientHeight: 500 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });

    // Advance past guard window
    vi.advanceTimersByTime(200);

    // Real user scroll-up (large negative delta, outside guard window)
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 400, scrollHeight: 1000, clientHeight: 500 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });

    // followOutput should return false (userScrolled is true)
    expect(result.current.handleFollowOutput(false)).toBe(false);
    // scroll button should show
    expect(result.current.showScrollButton).toBe(false); // button shown via atBottomStateChange
  });

  it('followOutput should set guard so subsequent scroll events are ignored', () => {
    const { result } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: [createMessage('left', '1')], itemCount: 1 },
    });

    // followOutput fires (new message added during streaming)
    act(() => {
      result.current.handleFollowOutput(false);
    });

    // Immediate scroll event with negative delta should be ignored (within guard)
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 500, scrollHeight: 1000, clientHeight: 500 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 450, scrollHeight: 1000, clientHeight: 500 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });

    // Still in auto-follow mode
    expect(result.current.handleFollowOutput(false)).toBe('auto');
  });

  it('followOutput should return false after user scrolled up', () => {
    const { result } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: [createMessage('left', '1')], itemCount: 1 },
    });

    // Set initial position
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 500, scrollHeight: 1000, clientHeight: 500 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });

    // Wait for guard to expire
    vi.advanceTimersByTime(200);

    // User scrolls up
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 300, scrollHeight: 1000, clientHeight: 500 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });

    expect(result.current.handleFollowOutput(false)).toBe(false);
  });

  it('atBottomStateChange(true) should reset userScrolled and close residual gap', () => {
    const { result } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: [createMessage('left', '1')], itemCount: 1 },
    });

    // Register a real DOM scroller element with a gap
    const scrollerProps = { clientHeight: 504, scrollHeight: 1050, scrollTop: 500 };
    const scrollerEl = createScrollerEl(scrollerProps);
    act(() => {
      result.current.handleScrollerRef(scrollerEl);
    });

    // Simulate user scrolled up then atBottom fires true
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 500, scrollHeight: 1050, clientHeight: 504 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });
    vi.advanceTimersByTime(200);
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 300, scrollHeight: 1050, clientHeight: 504 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });

    // User scrolled - followOutput returns false
    expect(result.current.handleFollowOutput(false)).toBe(false);

    // atBottomStateChange(true) should reset
    act(() => {
      result.current.handleAtBottomStateChange(true);
    });

    // Should close the gap: scrollTop = scrollHeight - clientHeight
    expect(scrollerEl.scrollTop).toBe(1050 - 504);
    // followOutput should return 'auto' again
    expect(result.current.handleFollowOutput(false)).toBe('auto');
  });

  it('atBottomStateChange(false) should scroll back when not user-scrolled (layout shift)', () => {
    const { result } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: [createMessage('left', '1')], itemCount: 1 },
    });

    // Register real DOM scroller
    const scrollerProps = { clientHeight: 462, scrollHeight: 1000, scrollTop: 490 };
    const scrollerEl = createScrollerEl(scrollerProps);
    act(() => {
      result.current.handleScrollerRef(scrollerEl);
    });

    // atBottomStateChange(false) fires due to layout shift (ThoughtDisplay appeared)
    // userScrolled is still false — should scroll back to bottom
    act(() => {
      result.current.handleAtBottomStateChange(false);
    });

    expect(scrollerEl.scrollTop).toBe(1000 - 462);
  });

  it('atBottomStateChange(false) should NOT scroll back when user scrolled up', () => {
    const { result } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: [createMessage('left', '1')], itemCount: 1 },
    });

    const scrollerEl = createScrollerEl({ clientHeight: 462, scrollHeight: 1000, scrollTop: 400 });
    act(() => {
      result.current.handleScrollerRef(scrollerEl);
    });

    // Simulate user scroll-up
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 500, scrollHeight: 1000, clientHeight: 462 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });
    vi.advanceTimersByTime(200);
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 300, scrollHeight: 1000, clientHeight: 462 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });

    const scrollTopBefore = scrollerEl.scrollTop;

    // atBottomStateChange(false) — user already scrolled, should NOT auto-scroll
    act(() => {
      result.current.handleAtBottomStateChange(false);
    });

    expect(scrollerEl.scrollTop).toBe(scrollTopBefore);
  });

  it('container resize (grow) should scroll to bottom after delay', () => {
    const { result } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: [createMessage('left', '1')], itemCount: 1 },
    });

    // Register real DOM scroller — simulate ThoughtDisplay visible (height 462)
    const scrollerProps = { clientHeight: 462, scrollHeight: 1000, scrollTop: 490 };
    const scrollerEl = createScrollerEl(scrollerProps);
    act(() => {
      result.current.handleScrollerRef(scrollerEl);
    });

    // Simulate container grow: ThoughtDisplay disappears (462 → 504)
    Object.defineProperty(scrollerEl, 'clientHeight', { get: () => 504, configurable: true });
    scrollerEl.scrollTop = 490; // gap = 1000 - 504 - 490 = 6

    act(() => {
      triggerResizeObservers();
    });

    // First correction fires at 50ms
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(scrollerEl.scrollTop).toBe(1000 - 504);
  });

  it('container resize should NOT correct when user has scrolled up', () => {
    const { result } = renderHook(({ messages, itemCount }) => useAutoScroll({ messages, itemCount }), {
      initialProps: { messages: [createMessage('left', '1')], itemCount: 1 },
    });

    const scrollerEl = createScrollerEl({ clientHeight: 462, scrollHeight: 1000, scrollTop: 300 });
    act(() => {
      result.current.handleScrollerRef(scrollerEl);
    });

    // Simulate user scroll-up
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 500, scrollHeight: 1000, clientHeight: 462 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });
    vi.advanceTimersByTime(200);
    act(() => {
      result.current.handleScroll({
        target: { scrollTop: 300, scrollHeight: 1000, clientHeight: 462 },
      } as unknown as React.UIEvent<HTMLDivElement>);
    });

    const scrollTopBefore = scrollerEl.scrollTop;

    // Container grows
    Object.defineProperty(scrollerEl, 'clientHeight', { get: () => 504, configurable: true });
    act(() => {
      triggerResizeObservers();
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should NOT have changed scrollTop
    expect(scrollerEl.scrollTop).toBe(scrollTopBefore);
  });
});
