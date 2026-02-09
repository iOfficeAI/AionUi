/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useAutoScroll - Auto-scroll hook with user scroll detection
 * Automatically scrolls to bottom during streaming, but respects user scroll
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { TMessage } from '@/common/chatLib';

// Smooth scroll animation duration in ms
const SCROLL_ANIMATION_DURATION = 300;
// Minimum scroll delta to detect user scrolling up
const USER_SCROLL_THRESHOLD = 10;

interface UseAutoScrollOptions {
  /** Message list for detecting streaming state */
  messages: TMessage[];
  /** Total item count for scroll target */
  itemCount: number;
}

interface UseAutoScrollReturn {
  /** Ref to attach to Virtuoso component */
  virtuosoRef: React.RefObject<VirtuosoHandle | null>;
  /** Scroll event handler for Virtuoso onScroll */
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  /** Whether to show scroll-to-bottom button */
  showScrollButton: boolean;
  /** Manually scroll to bottom (e.g., when clicking button) */
  scrollToBottom: (behavior?: 'smooth' | 'auto') => void;
  /** Hide the scroll button */
  hideScrollButton: () => void;
}

export function useAutoScroll({ messages, itemCount }: UseAutoScrollOptions): UseAutoScrollReturn {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Refs for scroll control
  const isAutoScrollingRef = useRef(false);
  const userScrolledRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const previousListLengthRef = useRef(messages.length);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(
    (behavior: 'smooth' | 'auto' = 'smooth') => {
      if (!virtuosoRef.current) return;

      isAutoScrollingRef.current = true;
      virtuosoRef.current.scrollToIndex({
        index: itemCount - 1,
        behavior: behavior,
        align: 'end',
      });

      // Reset flag after animation completes
      const delay = behavior === 'smooth' ? SCROLL_ANIMATION_DURATION : 0;
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, delay);
    },
    [itemCount]
  );

  // Handle scroll events to detect user scrolling
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const currentScrollTop = target.scrollTop;

    // Ignore programmatic scroll events
    if (isAutoScrollingRef.current) {
      lastScrollTopRef.current = currentScrollTop;
      return;
    }

    // Update scroll button visibility
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    setShowScrollButton(!isAtBottom);

    // Detect user scrolling up (always, not just during streaming)
    const delta = currentScrollTop - lastScrollTopRef.current;
    if (delta < -USER_SCROLL_THRESHOLD) {
      userScrolledRef.current = true;
    }

    // Reset userScrolledRef only when user manually scrolls back to bottom
    if (isAtBottom) {
      userScrolledRef.current = false;
    }

    lastScrollTopRef.current = currentScrollTop;
  }, []);

  // Smart scroll when message list updates
  useEffect(() => {
    const currentListLength = messages.length;
    const prevLength = previousListLengthRef.current;
    const isNewMessage = currentListLength > prevLength;

    // Update recorded list length
    previousListLengthRef.current = currentListLength;

    // Check if latest message is from user (position === 'right')
    const lastMessage = messages[messages.length - 1];
    const isUserMessage = lastMessage?.position === 'right';

    // If user sent a message, force scroll to bottom and reset scroll state
    if (isUserMessage && isNewMessage) {
      userScrolledRef.current = false;
      requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
      return;
    }

    // Auto-scroll for new messages only if user hasn't scrolled up
    if (isNewMessage && !userScrolledRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom('smooth');
      });
    }
  }, [messages, scrollToBottom]);

  // Hide scroll button handler
  const hideScrollButton = useCallback(() => {
    userScrolledRef.current = false;
    setShowScrollButton(false);
  }, []);

  return {
    virtuosoRef,
    handleScroll,
    showScrollButton,
    scrollToBottom,
    hideScrollButton,
  };
}
