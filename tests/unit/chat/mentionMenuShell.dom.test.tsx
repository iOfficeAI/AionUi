/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression suite for the send-box dropdown height cap.
 *
 * The `@@` picker used to render its 20 rows into an unbounded container. Being
 * anchored bottom-up against the send box (`bottom: calc(100% + 8px)`) inside
 * ChatLayout's `overflow-hidden` content column, the list grew ~900px straight
 * up, was clipped at the conversation header, and had no scroll container — so
 * the top rows were unreachable by wheel OR keyboard. These tests pin the two
 * properties that prevent it: a capped scroll region, and keyboard navigation
 * that scrolls the active option back into view.
 */

import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import AtSessionMenu from '@/renderer/components/chat/AtSessionMenu';
import MentionMenuShell from '@/renderer/components/chat/MentionMenuShell';

const ROW_HEIGHT = 40;
const VIEWPORT_HEIGHT = 100;

const renderShell = (activeIndex: number, count: number) =>
  render(
    <MentionMenuShell activeIndex={activeIndex} itemCount={count} label='menu'>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} role='option' aria-selected={index === activeIndex} data-index={index}>
          {`row ${index}`}
        </div>
      ))}
    </MentionMenuShell>
  );

const getListbox = (container: HTMLElement): HTMLElement => {
  const body = container.querySelector('[role="listbox"]');
  if (!(body instanceof HTMLElement)) throw new Error('listbox not rendered');
  return body;
};

/**
 * jsdom does no layout: every rect is zero and `scrollTop` is a no-op setter.
 * Stub both so the shell's overflow math is exercised for real — a fake viewport
 * of VIEWPORT_HEIGHT showing ROW_HEIGHT rows, scrolled by a tracked scrollTop.
 */
const stubLayout = (body: HTMLElement) => {
  const state = { scrollTop: 0 };
  Object.defineProperty(body, 'scrollTop', {
    configurable: true,
    get: () => state.scrollTop,
    set: (value: number) => {
      state.scrollTop = value;
    },
  });
  body.getBoundingClientRect = () => ({ top: 0, bottom: VIEWPORT_HEIGHT, height: VIEWPORT_HEIGHT }) as DOMRect;
  body.querySelectorAll('[role="option"]').forEach((option, index) => {
    (option as HTMLElement).getBoundingClientRect = () => {
      const top = index * ROW_HEIGHT - state.scrollTop;
      return { top, bottom: top + ROW_HEIGHT, height: ROW_HEIGHT } as DOMRect;
    };
  });
  return state;
};

describe('MentionMenuShell', () => {
  it('renders its options inside a height-capped scroll region', () => {
    const { container } = renderShell(0, 20);
    const body = getListbox(container);

    expect(body.className).toContain('overflow-y-auto');
    expect(body.style.maxHeight).toBe('min(34vh, 260px)');
    // The options must live INSIDE the scroller, not beside it.
    expect(body.querySelectorAll('[role="option"]')).toHaveLength(20);
  });

  it('scrolls a below-the-fold active option up into view', () => {
    const { container, rerender } = renderShell(0, 20);
    const body = getListbox(container);
    const state = stubLayout(body);

    // Row 5 spans 200..240 in a 0..100 viewport → needs scrollTop 140.
    rerender(
      <MentionMenuShell activeIndex={5} itemCount={20} label='menu'>
        {Array.from({ length: 20 }, (_, index) => (
          <div key={index} role='option' aria-selected={index === 5} data-index={index}>
            {`row ${index}`}
          </div>
        ))}
      </MentionMenuShell>
    );

    expect(state.scrollTop).toBe(5 * ROW_HEIGHT + ROW_HEIGHT - VIEWPORT_HEIGHT);
  });

  it('asks for the next page only once the scroll nears the bottom', () => {
    const onReachEnd = vi.fn();
    const { container } = render(
      <MentionMenuShell activeIndex={0} itemCount={20} label='menu' onReachEnd={onReachEnd}>
        <div role='option' aria-selected={true}>
          row
        </div>
      </MentionMenuShell>
    );
    const body = getListbox(container);
    // 800px of content in a 100px viewport.
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 800 });
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: VIEWPORT_HEIGHT });
    const scrollTo = (scrollTop: number) => {
      Object.defineProperty(body, 'scrollTop', { configurable: true, value: scrollTop });
      fireEvent.scroll(body);
    };

    scrollTo(300);
    expect(onReachEnd).not.toHaveBeenCalled();

    // 800 - 660 - 100 = 40px left, inside the 48px threshold.
    scrollTo(660);
    expect(onReachEnd).toHaveBeenCalled();
  });

  it('does not attach a scroll handler when no pager was supplied', () => {
    const { container } = render(
      <MentionMenuShell activeIndex={0} itemCount={1} label='menu'>
        <div role='option' aria-selected={true}>
          row
        </div>
      </MentionMenuShell>
    );
    // Scrolling a non-paged menu must not throw; there is nothing to ask for.
    expect(() => fireEvent.scroll(getListbox(container))).not.toThrow();
  });

  it('leaves the scroll position alone when the active option is already visible', () => {
    const { container, rerender } = renderShell(0, 20);
    const body = getListbox(container);
    const state = stubLayout(body);

    // Row 1 spans 40..80, fully inside the 0..100 viewport.
    rerender(
      <MentionMenuShell activeIndex={1} itemCount={20} label='menu'>
        {Array.from({ length: 20 }, (_, index) => (
          <div key={index} role='option' aria-selected={index === 1} data-index={index}>
            {`row ${index}`}
          </div>
        ))}
      </MentionMenuShell>
    );

    expect(state.scrollTop).toBe(0);
  });
});

describe('AtSessionMenu', () => {
  const items = Array.from({ length: 20 }, (_, index) => ({
    id: `c${index}`,
    name: `conversation ${index}`,
    project: 'proj',
    modified_at: 1_700_000_000_000,
  }));

  const renderMenu = (props: Partial<React.ComponentProps<typeof AtSessionMenu>> = {}) =>
    render(
      <AtSessionMenu
        activeIndex={0}
        emptyText='empty'
        items={items}
        label='Conversation mentions'
        loading={false}
        loadingText='loading'
        onHoverItem={() => {}}
        onSelectItem={() => {}}
        formatRelativeTime={() => '3 minutes ago'}
        {...props}
      />
    );

  it('caps its height so a full page of results cannot overflow the chat column', () => {
    const { container } = renderMenu();
    const body = getListbox(container);

    expect(body.className).toContain('overflow-y-auto');
    expect(body.style.maxHeight).toBe('min(40vh, 320px)');
    expect(body.querySelectorAll('[role="option"]')).toHaveLength(20);
  });

  it('shows the next page loading behind the rows already on screen', () => {
    const { container } = renderMenu({ loading: true });
    const body = getListbox(container);

    expect(body.textContent).toContain('loading');
    // The rows stay put — a second page must not blank the list…
    expect(body.querySelectorAll('[role="option"]')).toHaveLength(20);
    // …and the pending row is not selectable, or it would shift every
    // keyboard index by one.
    expect(body.querySelectorAll('[role="option"]')[19]?.textContent).toContain('conversation 19');
  });

  it('shows the loading text alone when there is nothing to page yet', () => {
    const { container } = renderMenu({ items: [], loading: true });
    const body = getListbox(container);

    expect(body.textContent).toBe('loading');
    expect(body.querySelectorAll('[role="option"]')).toHaveLength(0);
  });
});
