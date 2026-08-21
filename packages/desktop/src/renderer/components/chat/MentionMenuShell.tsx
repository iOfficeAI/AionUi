/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useCallback, useEffect, useRef } from 'react';

/** Height cap for single-line rows (`/` commands). Two-line rows (`@`, `@@`)
 *  pass a taller cap so they still show a comparable number of options. */
const DEFAULT_MAX_HEIGHT = 'min(34vh, 260px)';

/** Distance from the bottom at which `onReachEnd` fires — roughly one two-line
 *  row, so the next page is already in flight when the user reaches the floor. */
const REACH_END_THRESHOLD_PX = 48;

type MentionMenuShellProps = {
  /** Index of the active option. A change scrolls that option back into view. */
  activeIndex: number;
  /** Number of rendered options. Re-runs the scroll sync when the option set
   *  changes while `activeIndex` stays put. */
  itemCount: number;
  /** Accessible name for the listbox. */
  label: string;
  loading?: boolean;
  /** Visible header title. Omit for a headerless menu. */
  title?: string;
  /** Secondary header text; only rendered alongside a title. */
  hint?: string;
  maxHeight?: string;
  /** Extra classes for the scroll region (e.g. `flex flex-col gap-2px`). */
  bodyClassName?: string;
  /** Fired when the scroll region nears its bottom, for cursor-paged menus.
   *  May fire repeatedly — the caller is expected to be idempotent while a page
   *  is already in flight. */
  onReachEnd?: () => void;
  children: React.ReactNode;
};

/**
 * The floating frame every send-box command/mention menu shares: glass surface,
 * optional header, and — critically — a height-capped scroll region.
 *
 * That cap is not cosmetic. These menus are anchored bottom-up against the send
 * box (`bottom: calc(100% + 8px)`) inside `ChatLayout`'s `overflow-hidden`
 * content column, so an unbounded list grows straight up past the conversation
 * header and is clipped there: the top rows become unreachable, with no
 * scrollbar to reveal them and no scroll container for the wheel to act on.
 * Options MUST be rendered inside this body, never as a sibling of it.
 */
const MentionMenuShell: React.FC<MentionMenuShellProps> = ({
  activeIndex,
  itemCount,
  label,
  loading = false,
  title,
  hint,
  maxHeight = DEFAULT_MAX_HEIGHT,
  bodyClassName,
  onReachEnd,
  children,
}) => {
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!onReachEnd) return;
      const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
      if (scrollHeight - scrollTop - clientHeight <= REACH_END_THRESHOLD_PX) {
        onReachEnd();
      }
    },
    [onReachEnd]
  );

  // Keyboard navigation must drag the viewport along, or `↑/↓` walks into the
  // clipped region and the selection disappears. Scroll by the exact overflow
  // rather than `scrollIntoView`: the latter also scrolls every ancestor
  // scroller, which here means yanking the message list behind the panel.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const active = body.querySelector('[role="option"][aria-selected="true"]');
    if (!(active instanceof HTMLElement)) return;
    const bodyRect = body.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.top < bodyRect.top) {
      body.scrollTop -= bodyRect.top - activeRect.top;
    } else if (activeRect.bottom > bodyRect.bottom) {
      body.scrollTop += activeRect.bottom - bodyRect.bottom;
    }
  }, [activeIndex, itemCount]);

  return (
    <div
      className='rounded-14px border border-solid shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden'
      style={{
        borderColor: 'var(--color-border-2)',
        background: 'color-mix(in srgb, var(--color-bg-1) 78%, transparent)',
        backdropFilter: 'blur(14px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.1)',
      }}
    >
      {title && (
        <div
          className='px-12px py-8px border-b border-solid flex items-center justify-between gap-8px'
          style={{
            borderColor: 'color-mix(in srgb, var(--color-border-2) 56%, transparent)',
            background: 'color-mix(in srgb, var(--color-bg-1) 84%, transparent)',
          }}
        >
          <div className='text-13px font-semibold text-t-primary'>{title}</div>
          {hint && <div className='text-13px text-t-secondary truncate'>{hint}</div>}
        </div>
      )}
      <div
        ref={bodyRef}
        role='listbox'
        aria-label={label}
        aria-busy={loading}
        className={classNames('overflow-y-auto p-6px', bodyClassName)}
        style={{ maxHeight }}
        onScroll={onReachEnd ? handleScroll : undefined}
      >
        {children}
      </div>
    </div>
  );
};

export default MentionMenuShell;
