/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useAutoScroll - Auto-scroll hook with user scroll detection
 *
 * Strategy:
 * - followOutput handles auto-scroll when totalCount changes (new items).
 * - When external UI (ThoughtDisplay, CommandQueuePanel) shrinks the Virtuoso
 *   container, a ResizeObserver sets a scroll guard so the resulting scroll
 *   adjustment isn't misdetected as user scroll-up. Then atBottomStateChange
 *   fires false, and since userScrolled is still false, we scroll back to bottom
 *   via Virtuoso's own scrollToIndex API.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { TMessage } from '@/common/chat/chatLib';

// Ignore scroll events within this window after a programmatic scroll (ms)
const PROGRAMMATIC_SCROLL_GUARD_MS = 150;

interface UseAutoScrollOptions {
  /** Message list for detecting new messages */
  messages: TMessage[];
  /** Total item count for scroll target */
  itemCount: number;
}

interface UseAutoScrollReturn {
  /** Ref to attach to Virtuoso component */
  virtuosoRef: React.RefObject<VirtuosoHandle | null>;
  /** Callback to attach to Virtuoso scrollerRef for resize guard */
  handleScrollerRef: (ref: HTMLElement | Window | null) => void;
  /** Scroll event handler for Virtuoso onScroll */
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  /** Virtuoso atBottomStateChange callback */
  handleAtBottomStateChange: (atBottom: boolean) => void;
  /** Virtuoso followOutput callback for streaming auto-scroll */
  handleFollowOutput: (isAtBottom: boolean) => false | 'auto';
  /** Whether to show scroll-to-bottom button */
  showScrollButton: boolean;
  /** Manually scroll to bottom (e.g., when clicking button) */
  scrollToBottom: (behavior?: 'smooth' | 'auto') => void;
  /** Hide the scroll button */
  hideScrollButton: () => void;
}

export function useAutoScroll({ messages, itemCount }: UseAutoScrollOptions): UseAutoScrollReturn {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [scrollerEl, setScrollerEl] = useState<HTMLElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Refs for scroll control
  const userScrolledRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const previousListLengthRef = useRef(messages.length);
  const lastProgrammaticScrollTimeRef = useRef(0);
  const scrollerElRef = useRef<HTMLElement | null>(null);
  const followOutputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Capture Virtuoso's scroll container
  const handleScrollerRef = useCallback((ref: HTMLElement | Window | null) => {
    const el = ref instanceof HTMLElement ? ref : null;
    scrollerElRef.current = el;
    setScrollerEl(el);
  }, []);

  // ResizeObserver: when the container resizes, set the programmatic scroll guard
  // so Virtuoso's resulting scroll adjustment won't be misdetected as user scroll-up.
  // On container grow (e.g. ThoughtDisplay disappears), also scroll to the true bottom
  // after Virtuoso finishes its internal adjustments, since the gap may fall within
  // atBottomThreshold and not trigger atBottomStateChange(false).
  useEffect(() => {
    if (!scrollerEl) return;

    let prevHeight = scrollerEl.clientHeight;
    let growTimer: ReturnType<typeof setTimeout> | null = null;

    const observer = new ResizeObserver(() => {
      const newHeight = scrollerEl.clientHeight;
      const delta = prevHeight - newHeight;
      prevHeight = newHeight;

      if (delta !== 0 && !userScrolledRef.current) {
        lastProgrammaticScrollTimeRef.current = Date.now();

        // Container grew (e.g. ThoughtDisplay disappeared) — scroll to true bottom
        // after Virtuoso finishes its rAF-based processing (~16ms). Using 50ms
        // as first pass for fast correction, then 250ms to catch any re-layout.
        // NOTE: immediate/rAF scrolls conflict with Virtuoso's internal adjustments,
        // so we must wait until Virtuoso settles before correcting.
        if (delta < 0) {
          if (growTimer) clearTimeout(growTimer);
          const scrollToTrueBottom = () => {
            if (!userScrolledRef.current && scrollerElRef.current) {
              const el = scrollerElRef.current;
              const gap = el.scrollHeight - el.clientHeight - el.scrollTop;
              if (gap > 2) {
                lastProgrammaticScrollTimeRef.current = Date.now();
                el.scrollTop = el.scrollHeight - el.clientHeight;
              }
            }
          };
          growTimer = setTimeout(() => {
            scrollToTrueBottom();
            growTimer = setTimeout(scrollToTrueBottom, 200);
          }, 50);
        }
      }
    });

    observer.observe(scrollerEl);
    return () => {
      observer.disconnect();
      if (growTimer) clearTimeout(growTimer);
    };
  }, [scrollerEl]);

  // Scroll to bottom helper - only for user messages and button clicks
  const scrollToBottom = useCallback(
    (behavior: 'smooth' | 'auto' = 'smooth') => {
      if (!virtuosoRef.current) return;

      lastProgrammaticScrollTimeRef.current = Date.now();
      virtuosoRef.current.scrollToIndex({
        index: itemCount - 1,
        behavior,
        align: 'end',
      });
    },
    [itemCount]
  );

  // Virtuoso native followOutput - handles streaming auto-scroll internally
  // without external scrollToIndex calls that cause jitter.
  // Setting the scroll guard here prevents Virtuoso's auto-scroll adjustments
  // from being misdetected as user scroll-up during streaming.
  // A debounced timer catches residual gaps after streaming ends — Virtuoso's
  // final layout may leave a small gap with no further scroll events to trigger
  // our handleScroll snap.
  const handleFollowOutput = useCallback((_isAtBottom: boolean): false | 'auto' => {
    if (userScrolledRef.current) return false;
    lastProgrammaticScrollTimeRef.current = Date.now();
    if (followOutputTimerRef.current) clearTimeout(followOutputTimerRef.current);
    followOutputTimerRef.current = setTimeout(() => {
      if (!userScrolledRef.current && scrollerElRef.current) {
        const el = scrollerElRef.current;
        const gap = el.scrollHeight - el.clientHeight - el.scrollTop;
        if (gap > 2) {
          lastProgrammaticScrollTimeRef.current = Date.now();
          el.scrollTop = el.scrollHeight - el.clientHeight;
        }
      }
    }, 500);
    return 'auto';
  }, []);

  // Bottom state detection + container resize compensation.
  // When atBottom transitions true → false and user hasn't scrolled up,
  // this is a layout shift (ThoughtDisplay appeared) — scroll back to bottom.
  // NOTE: atBottom=true sets a SHORT guard (50ms) — enough to absorb Virtuoso's
  // internal rAF-based scroll adjustments, but short enough that real user scroll-up
  // (which takes >50ms to travel past atBottomThreshold) won't be blocked.
  // A full 150ms guard here caused jitter: user scrolls up → guard blocks detection
  // → atBottomStateChange(false) scrolls back → cycle.
  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setShowScrollButton(!atBottom);

    if (atBottom) {
      userScrolledRef.current = false;
      // Short guard: expire 50ms from now (not the full PROGRAMMATIC_SCROLL_GUARD_MS)
      lastProgrammaticScrollTimeRef.current = Date.now() - (PROGRAMMATIC_SCROLL_GUARD_MS - 50);
      // Close any residual gap within atBottomThreshold (e.g. after ThoughtDisplay
      // disappears or streaming ends, gap may settle at ~50px — still "at bottom"
      // per Virtuoso but visually clipped).
      const el = scrollerElRef.current;
      if (el) {
        const gap = el.scrollHeight - el.clientHeight - el.scrollTop;
        if (gap > 2) {
          el.scrollTop = el.scrollHeight - el.clientHeight;
        }
      }
    } else if (!userScrolledRef.current) {
      // Layout shift pushed us off bottom — scroll back to bottom immediately.
      const el = scrollerElRef.current;
      if (el) {
        lastProgrammaticScrollTimeRef.current = Date.now();
        el.scrollTop = el.scrollHeight - el.clientHeight;
      }
    }
  }, []);

  // Detect user scrolling up
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const currentScrollTop = target.scrollTop;

    // Ignore scroll events shortly after a programmatic scroll or container resize
    const timeSinceGuard = Date.now() - lastProgrammaticScrollTimeRef.current;
    if (timeSinceGuard < PROGRAMMATIC_SCROLL_GUARD_MS) {
      lastScrollTopRef.current = currentScrollTop;
      return;
    }

    const delta = currentScrollTop - lastScrollTopRef.current;
    if (delta < -10) {
      userScrolledRef.current = true;
    }

    // When in auto-follow mode and Virtuoso is scrolling down (following content),
    // refresh the scroll guard so Virtuoso's subsequent scroll adjustments (which
    // may produce small negative deltas) won't be misdetected as user scroll-up.
    if (!userScrolledRef.current && delta > 0) {
      lastProgrammaticScrollTimeRef.current = Date.now();
    }

    lastScrollTopRef.current = currentScrollTop;
  }, []);

  // Force scroll when user sends a message
  useEffect(() => {
    const currentListLength = messages.length;
    const prevLength = previousListLengthRef.current;
    const isNewMessage = currentListLength > prevLength;

    previousListLengthRef.current = currentListLength;

    if (!isNewMessage) return;

    const lastMessage = messages[messages.length - 1];

    // User sent a message - force scroll regardless of userScrolled state
    if (lastMessage?.position === 'right') {
      userScrolledRef.current = false;
      // Use double RAF to ensure DOM is updated before scrolling (#977)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (virtuosoRef.current) {
            lastProgrammaticScrollTimeRef.current = Date.now();
            virtuosoRef.current.scrollToIndex({
              index: 'LAST',
              behavior: 'auto',
              align: 'end',
            });
          }
        });
      });
    }
  }, [messages]);

  // Scroll to bottom when streaming content updates existing messages.
  // Virtuoso's followOutput only fires when totalCount changes (new items added),
  // but during ACP/Gemini streaming the existing text message grows in-place
  // without changing the item count. This effect detects those content updates
  // and scrolls to bottom when the user hasn't scrolled away.
  useEffect(() => {
    if (userScrolledRef.current) return;
    const el = scrollerElRef.current;
    if (!el) return;

    const gap = el.scrollHeight - el.clientHeight - el.scrollTop;
    if (gap > 2) {
      lastProgrammaticScrollTimeRef.current = Date.now();
      el.scrollTop = el.scrollHeight - el.clientHeight;
    }
  }, [messages]);

  // Hide scroll button handler
  const hideScrollButton = useCallback(() => {
    userScrolledRef.current = false;
    setShowScrollButton(false);
  }, []);

  return {
    virtuosoRef,
    handleScrollerRef,
    handleScroll,
    handleAtBottomStateChange,
    handleFollowOutput,
    showScrollButton,
    scrollToBottom,
    hideScrollButton,
  };
}
