/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { dispatchChatMessageJump, dispatchChatSearchPanelOpen } from '@/renderer/utils/chat/chatMinimapEvents';
import { IconSearch } from '@arco-design/web-react/icon';
import classNames from 'classnames';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMessageList } from '../hooks';
import type { MessageAnchorItem } from './anchors';
import { useConversationAnchors } from './useConversationAnchors';
import {
  needsScroll,
  resolveScrollTopForIndex,
  resolveSearchButtonTop,
  resolveStackTop,
  resolveTickIndexAtOffset,
  resolveViewportHeight,
  TICK_GAP,
  tickCenterOffset,
  tickStackHeight,
} from './geometry';
import styles from './MessageAnchorRail.module.css';

const CARD_EDGE_INSET = 8;
const FALLBACK_CARD_HEIGHT = 96;
/**
 * Gap between the tick viewport's edge and a "more this way" hint. Small enough
 * that the hint reads as belonging to the stack, large enough that it does not
 * look like one more tick.
 */
const SCROLL_HINT_OFFSET = 7;

/**
 * Distance from the hovered tick decides how far a tick is pulled out, so the
 * selection reads as one lifted line with its neighbours trailing off. Anything
 * further away stays at rest.
 */
const tickToneFor = (distance: number): string | undefined => {
  if (distance === 0) return styles.tickActive;
  if (distance === 1) return styles.tickNear;
  if (distance === 2) return styles.tickFar;
  return undefined;
};

/**
 * A vertical rail of ticks pinned to the chat area's left edge — one tick per
 * user message. The whole rail is a single hover target: wherever the pointer
 * lands, the closest tick is selected, so users never have to aim at a 2px line.
 * Clicking scrolls the chat to the selected message.
 *
 * The rail is a jump target, not a map of the conversation: tick spacing is fixed
 * at a comfortable gap and a long conversation scrolls inside the rail rather
 * than compressing. Keyword search stays in the conversation title's panel; the
 * rail only offers a shortcut to it.
 */
const MessageAnchorRail: React.FC = () => {
  const { t } = useTranslation();
  const messages = useMessageList();
  const conversationContext = useConversationContextSafe();
  const conversationId = conversationContext?.conversation_id;

  // Covers the whole conversation, not just the pages the chat area has loaded, so
  // reopening an old conversation shows every turn without scrolling up first.
  const anchors = useConversationAnchors(conversationId, messages);

  // A callback ref, not a plain one: the rail is not rendered until a second
  // anchor arrives, so a mount-only effect would run while there is no element to
  // measure and never look again — leaving the tick stack stuck at the top.
  // Keying the observer on the node makes it attach the moment the rail appears.
  const [railNode, setRailNode] = useState<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [railHeight, setRailHeight] = useState(0);
  const [cardHeight, setCardHeight] = useState(FALLBACK_CARD_HEIGHT);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // Mirrors the viewport's scrollTop. Hover maths runs against the *stack*, so it
  // has to add back however far the viewport has been scrolled.
  const [scrollTop, setScrollTop] = useState(0);

  // The rail is absolutely positioned, so measure its parent to learn how much
  // height the tick stack has to spread over. Whether the rail is shown at all
  // stays a CSS decision (see the container query in the stylesheet), not a JS
  // one — the header keeps its own search trigger unconditionally, so nothing
  // outside the rail needs to know when the container query hides it.
  useEffect(() => {
    const host = railNode?.parentElement;
    if (!railNode || !host || typeof ResizeObserver === 'undefined') return;

    const measure = () => setRailHeight(host.getBoundingClientRect().height);

    const observer = new ResizeObserver(measure);
    observer.observe(host);
    measure();
    return () => observer.disconnect();
  }, [railNode]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (card) setCardHeight(card.getBoundingClientRect().height);
  }, [activeIndex]);

  // Anchors shrink when a conversation is trimmed or switched; drop a stale
  // selection so the preview card can't point at a message that no longer exists.
  useEffect(() => {
    setActiveIndex((current) => (current !== null && current >= anchors.length ? null : current));
  }, [anchors.length]);

  const jumpToAnchor = useCallback(
    (anchor: MessageAnchorItem | undefined) => {
      if (!anchor || !conversationId) return;
      dispatchChatMessageJump({
        conversation_id: conversationId,
        messageId: anchor.messageId,
        msgId: anchor.msgId,
        align: 'start',
        behavior: 'smooth',
      });
    },
    [conversationId]
  );

  const stackHeight = tickStackHeight(anchors.length);
  const viewportHeight = resolveViewportHeight(railHeight, anchors.length);
  const scrollable = needsScroll(railHeight, anchors.length);
  const stackTop = resolveStackTop(railHeight, anchors.length);
  // The button leads the stack, so it travels with it rather than pinning to the top edge.
  const searchTop = resolveSearchButtonTop(railHeight, anchors.length);

  // Follow the conversation: when a new turn arrives, bring it into view so the
  // newest anchor is always reachable without scrolling the rail by hand.
  //
  // Keyed strictly on the anchor count. An earlier version also depended on the
  // hover state, which meant every pointer-leave re-ran this and yanked the rail
  // back to the bottom — so a user who scrolled up could never stay there.
  const followedCountRef = useRef(0);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !scrollable || anchors.length === 0) return;
    if (anchors.length === followedCountRef.current) return;
    followedCountRef.current = anchors.length;
    viewport.scrollTop = resolveScrollTopForIndex(anchors.length - 1, anchors.length, viewportHeight);
  }, [anchors.length, scrollable, viewportHeight]);

  const openSearchPanel = useCallback(() => {
    if (!conversationId) return;
    dispatchChatSearchPanelOpen({ conversation_id: conversationId });
  }, [conversationId]);

  // Last known pointer position, in viewport-local coordinates. Scrolling has to
  // re-run the magnet against this: the pointer has not moved, but a different
  // tick is now underneath it, so the selection must follow the wheel rather than
  // riding away with the stack.
  const pointerYRef = useRef<number | null>(null);

  const selectAtPointer = useCallback(() => {
    const viewport = viewportRef.current;
    const pointerY = pointerYRef.current;
    if (!viewport || pointerY === null) return;
    // Measure against the viewport (not the rail) and add the scroll offset, so
    // the magnet still picks the tick actually under the pointer once scrolled.
    const offsetY = pointerY + viewport.scrollTop;
    setActiveIndex(resolveTickIndexAtOffset(offsetY, anchors.length));
  }, [anchors.length]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      pointerYRef.current = event.clientY - viewport.getBoundingClientRect().top;
      selectAtPointer();
    },
    [selectAtPointer]
  );

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(event.currentTarget.scrollTop);
      // Re-select under the stationary pointer so hover survives the scroll.
      selectAtPointer();
    },
    [selectAtPointer]
  );

  // Keep a keyboard-focused tick on screen: tabbing through a scrolled rail must
  // not leave the selection somewhere the user cannot see.
  const revealIndex = useCallback(
    (index: number) => {
      const viewport = viewportRef.current;
      if (!viewport || !scrollable) return;
      viewport.scrollTop = resolveScrollTopForIndex(index, anchors.length, viewportHeight);
    },
    [anchors.length, scrollable, viewportHeight]
  );

  // A single anchor carries no navigational value — the whole turn is already on
  // screen — so the rail stays hidden until there is somewhere to jump to.
  if (anchors.length < 2) return null;

  const activeAnchor = activeIndex === null ? undefined : anchors[activeIndex];
  // The card is positioned against the rail, so the tick's offset within the
  // stack has to be shifted by the viewport's own position and scroll.
  const activeCenter = activeIndex === null ? 0 : stackTop + tickCenterOffset(activeIndex) - scrollTop;
  const cardTop = Math.min(
    Math.max(activeCenter - cardHeight / 2, CARD_EDGE_INSET),
    Math.max(CARD_EDGE_INSET, railHeight - cardHeight - CARD_EDGE_INSET)
  );

  // "There is more this way" affordances. Without them a scrolled rail looks
  // identical to a complete one, so the hidden anchors are undiscoverable. Each
  // hint disappears the moment that direction is exhausted, so the rail always
  // reports how much conversation is left rather than showing a permanent chrome.
  // 1px of slack absorbs sub-pixel scroll positions at the extremes.
  const canScrollUp = scrollable && scrollTop > 1;
  const canScrollDown = scrollable && scrollTop + viewportHeight < stackHeight - 1;

  return (
    <div
      ref={setRailNode}
      className={classNames(styles.rail, 'absolute start-0 top-0 bottom-0 z-20')}
      data-testid='message-anchor-rail'
      aria-label={t('messages.anchorRail.label')}
      role='navigation'
    >
      {/* Scroll host. Sized to whatever the search button leaves behind, so a long
          conversation scrolls at a comfortable gap instead of compressing into an
          unreadable bar. Short conversations never overflow, so no scrollbar. */}
      <div
        ref={viewportRef}
        className={classNames(styles.viewport, scrollable && styles.viewportScrollable)}
        style={{ top: stackTop, height: viewportHeight }}
        data-testid='message-anchor-rail-zone'
        data-scrollable={scrollable ? 'true' : undefined}
        onScroll={handleScroll}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          pointerYRef.current = null;
          setActiveIndex(null);
        }}
        onClick={() => jumpToAnchor(activeAnchor)}
      >
        <div className={styles.ticks} style={{ height: stackHeight, rowGap: TICK_GAP }}>
          {anchors.map((anchor, index) => (
            <span
              key={anchor.messageId}
              role='button'
              tabIndex={0}
              data-testid='message-anchor-tick'
              data-anchor-index={anchor.index}
              data-anchor-active={activeIndex === index ? 'true' : undefined}
              aria-label={t('messages.anchorRail.tickAria', { index: anchor.index })}
              className={classNames(
                styles.tick,
                activeIndex === null ? undefined : tickToneFor(Math.abs(index - activeIndex))
              )}
              onFocus={() => {
                setActiveIndex(index);
                revealIndex(index);
              }}
              onBlur={() => setActiveIndex((current) => (current === index ? null : current))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  jumpToAnchor(anchor);
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* "More this way" hints, drawn just outside the scroll viewport so they can
          never intercept the pointer or magnet-select a tick. Purely decorative:
          the wheel already scrolls, so these report state rather than act as
          controls, and each vanishes as soon as its direction runs out. */}
      {canScrollUp && (
        <div
          className={classNames(styles.scrollHint, styles.scrollHintUp)}
          style={{ top: stackTop - SCROLL_HINT_OFFSET }}
          data-testid='message-anchor-rail-more-up'
          aria-hidden='true'
        >
          <span className={styles.scrollHintDot} />
          <span className={styles.scrollHintDot} />
          <span className={styles.scrollHintDot} />
        </div>
      )}
      {canScrollDown && (
        <div
          className={classNames(styles.scrollHint, styles.scrollHintDown)}
          style={{ top: stackTop + viewportHeight + SCROLL_HINT_OFFSET }}
          data-testid='message-anchor-rail-more-down'
          aria-hidden='true'
        >
          <span className={styles.scrollHintDot} />
          <span className={styles.scrollHintDot} />
          <span className={styles.scrollHintDot} />
        </div>
      )}

      {/* Search entry, sitting at the head of the stack so it reads as the first
          anchor. Lives outside the hover zone so hovering it cannot
          magnet-select a tick, and so a click never doubles as a jump. */}
      <button
        type='button'
        className={styles.searchButton}
        style={{ top: searchTop }}
        data-testid='message-anchor-rail-search'
        aria-label={t('messages.anchorRail.searchAria')}
        title={t('messages.anchorRail.searchAria')}
        onClick={openSearchPanel}
      >
        <IconSearch className={styles.searchIcon} />
      </button>

      {activeAnchor && (
        <div
          ref={cardRef}
          className={styles.card}
          style={{ top: cardTop }}
          data-testid='message-anchor-preview'
          onClick={() => jumpToAnchor(activeAnchor)}
        >
          <div className={classNames(styles.cardQuestion, 'text-13px font-medium text-t-primary leading-18px')}>
            {activeAnchor.question}
          </div>
          {activeAnchor.answer && (
            <div className={classNames(styles.cardAnswer, 'text-12px text-t-secondary leading-18px')}>
              {activeAnchor.answer}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageAnchorRail;
