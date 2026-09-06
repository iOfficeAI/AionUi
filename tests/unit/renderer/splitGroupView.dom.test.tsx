/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The column container's focus wiring. The real column (a full ChatConversation)
 * is replaced by a stub that does the one thing that matters here: register
 * itself with the focused-conversation store and claim focus on pointer-down,
 * exactly as ChatConversation does. Everything asserted below is the
 * container's own behaviour on top of that.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';
import {
  getFocusedConversation,
  getFocusedProject,
  getMountedConversationIds,
  resetFocusedConversationStoreForTest,
  setFocusedConversation,
  useFocusedConversationRegistration,
} from '@/renderer/pages/conversation/hooks/focusedConversationStore';
import type { SplitGroup } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';

const { layoutState, closePreviewIfScopeChanged, mountCounts, markAsRead, minimapClicks } = vi.hoisted(() => ({
  layoutState: { isMobile: false },
  closePreviewIfScopeChanged: vi.fn(),
  mountCounts: new Map<string, number>(),
  markAsRead: vi.fn(),
  minimapClicks: [] as string[],
}));

vi.mock('@/renderer/pages/cron', () => ({ useCronJobsMap: () => ({ markAsRead }) }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.name === 'string' ? `${key}:${options.name}:${String(options.count)}` : key,
  }),
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: layoutState.isMobile, siderCollapsed: false, setSiderCollapsed: () => {} }),
}));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ closePreviewIfScopeChanged }),
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/ConversationLeadingIcon', () => ({
  default: ({ conversation }: { conversation: TChatConversation }) => <span>{conversation.id}</span>,
}));
vi.mock('@/renderer/pages/conversation/hooks/useContainerWidth', () => ({
  useContainerWidth: () => ({ containerRef: { current: null }, containerWidth: 1200 }),
}));
const { reorderMembersMock } = vi.hoisted(() => ({ reorderMembersMock: vi.fn(async () => true) }));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations', () => ({
  useSplitGroupMutations: () => ({ reorderMembers: reorderMembersMock, removeMember: vi.fn() }),
}));
vi.mock('@/renderer/pages/split/SplitGroupColumn', async () => {
  // The real mark the minimap trigger carries, so the stub and the view agree.
  const { COLUMN_DRAG_IGNORE_PROPS } = await import('@/renderer/pages/conversation/hooks/chatColumnContext');
  const Column: React.FC<{
    group: SplitGroup;
    member: TChatConversation;
    focused: boolean;
    headerDragHandle?: {
      label: string;
      isDragging: boolean;
      onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
      onClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
    };
  }> = ({ member, focused, headerDragHandle }) => {
    const registration = useFocusedConversationRegistration(member.id);
    React.useEffect(() => {
      mountCounts.set(member.id, (mountCounts.get(member.id) ?? 0) + 1);
    }, [member.id]);
    return (
      <div data-testid={`split-column-${member.id}`} data-focused={focused ? 'true' : 'false'} {...registration}>
        {headerDragHandle && (
          <div
            data-testid={`split-column-header-${member.id}`}
            data-dragging={headerDragHandle.isDragging ? 'true' : 'false'}
            onPointerDown={headerDragHandle.onPointerDown}
            onClickCapture={headerDragHandle.onClickCapture}
          >
            <button
              type='button'
              data-testid={`split-column-grip-${member.id}`}
              aria-label={headerDragHandle.label}
              onKeyDown={headerDragHandle.onKeyDown}
            />
            <input data-testid={`split-column-input-${member.id}`} />
            <span
              role='button'
              tabIndex={0}
              data-testid={`split-column-minimap-${member.id}`}
              {...COLUMN_DRAG_IGNORE_PROPS}
              onClick={() => minimapClicks.push(member.id)}
            />
          </div>
        )}
        {member.name}
      </div>
    );
  };
  return { SplitGroupColumn: Column };
});

import { SplitGroupView } from '@/renderer/pages/split/SplitGroupView';
import {
  arrowStep,
  columnsRunRightToLeft,
  moveColumn,
  reorderColumns,
  resolveColumnDropIndex,
} from '@/renderer/pages/split/columnReorder';

const member = (id: string, order: number, project_id?: string): TChatConversation =>
  ({
    id,
    name: `Conversation ${id}`,
    type: 'acp',
    created_at: 1,
    modified_at: 1,
    project_id,
    extra: { split_group: { id: 'g1', order }, workspace: `/ws/${id}` },
  }) as TChatConversation;

const trio: SplitGroup = { id: 'g1', members: [member('a', 0, 'p1'), member('b', 1, 'p2'), member('c', 2)] };

const focusedOf = (id: string) => screen.getByTestId(`split-column-${id}`).getAttribute('data-focused');

beforeEach(() => {
  layoutState.isMobile = false;
  closePreviewIfScopeChanged.mockClear();
  markAsRead.mockClear();
  mountCounts.clear();
  minimapClicks.length = 0;
});

afterEach(() => {
  cleanup();
  resetFocusedConversationStoreForTest();
});

describe('SplitGroupView focus wiring (desktop columns)', () => {
  it('mounts every member as a column and focuses the first by default', () => {
    render(<SplitGroupView group={trio} />);
    expect(getMountedConversationIds()).toEqual(['a', 'b', 'c']);
    expect(getFocusedConversation()).toBe('a');
    expect([focusedOf('a'), focusedOf('b'), focusedOf('c')]).toEqual(['true', 'false', 'false']);
  });

  it('draws a divider between every pair of adjacent columns, and none after the last', () => {
    render(<SplitGroupView group={trio} />);
    const dividers = screen.getAllByTestId(/^split-column-divider-/);
    // A neutral hairline, with a neutral grab affordance under the pointer only.
    for (const divider of dividers) {
      const line = divider.querySelector('span') as HTMLElement;
      expect(line.className).toContain('bg-[var(--border-base)]');
      expect(line.className).not.toMatch(/aou-6|primary-6/);
      expect(line.className).toContain('group-hover:');
    }
    expect(dividers.map((divider) => divider.getAttribute('data-testid'))).toEqual([
      'split-column-divider-a',
      'split-column-divider-b',
    ]);
    // Each divider sits inside the frame of the column it follows.
    expect(screen.getByTestId('split-column-frame-a')).toContainElement(dividers[0]);
    expect(
      screen.getByTestId('split-column-frame-c').querySelector('[data-testid^="split-column-divider-"]')
    ).toBeNull();
  });

  it('starts on the member the sidebar asked for', () => {
    render(<SplitGroupView group={trio} requestedFocus='b' />);
    expect(getFocusedConversation()).toBe('b');
    expect(focusedOf('b')).toBe('true');
  });

  it('ignores a focus request for a conversation that is not a member', () => {
    render(<SplitGroupView group={trio} requestedFocus='zzz' />);
    expect(getFocusedConversation()).toBe('a');
  });

  it('moves the highlight to the column the user clicks', () => {
    render(<SplitGroupView group={trio} />);
    fireEvent.pointerDown(screen.getByTestId('split-column-c'));
    expect(getFocusedConversation()).toBe('c');
    expect([focusedOf('a'), focusedOf('c')]).toEqual(['false', 'true']);
  });

  it('publishes the focused column’s project and preview scope, and follows a click across projects', () => {
    render(<SplitGroupView group={trio} />);
    expect(getFocusedProject()).toBe('p1');
    expect(closePreviewIfScopeChanged).toHaveBeenLastCalledWith(expect.stringContaining('p1'));

    fireEvent.pointerDown(screen.getByTestId('split-column-b'));
    expect(getFocusedProject()).toBe('p2');
    expect(closePreviewIfScopeChanged).toHaveBeenLastCalledWith(expect.stringContaining('p2'));

    fireEvent.pointerDown(screen.getByTestId('split-column-c'));
    expect(getFocusedProject()).toBeNull();
  });

  it('keeps a later pill request for another member, once the columns are up', () => {
    const { rerender } = render(<SplitGroupView group={trio} />);
    rerender(<SplitGroupView group={trio} requestedFocus='c' />);
    expect(getFocusedConversation()).toBe('c');
  });

  it('acts on a repeated request for the same member after the user moved on', () => {
    const { rerender } = render(<SplitGroupView group={trio} requestedFocus='b' requestKey='b:1' />);
    fireEvent.pointerDown(screen.getByTestId('split-column-c'));
    expect(getFocusedConversation()).toBe('c');
    rerender(<SplitGroupView group={trio} requestedFocus='b' requestKey='b:2' />);
    expect(getFocusedConversation()).toBe('b');
  });

  it('keeps the column the user clicked when a member before it is removed', () => {
    const { rerender } = render(<SplitGroupView group={trio} />);
    fireEvent.pointerDown(screen.getByTestId('split-column-c'));
    expect(getFocusedConversation()).toBe('c');

    const withoutFirst: SplitGroup = { id: 'g1', members: [trio.members[1], trio.members[2]] };
    rerender(<SplitGroupView group={withoutFirst} />);
    expect(getFocusedConversation()).toBe('c');
    expect(focusedOf('c')).toBe('true');
  });

  it('keeps the column the user clicked when a member is added', () => {
    const { rerender } = render(<SplitGroupView group={trio} />);
    fireEvent.pointerDown(screen.getByTestId('split-column-b'));
    rerender(<SplitGroupView group={{ id: 'g1', members: [...trio.members, member('d', 3)] }} />);
    expect(getFocusedConversation()).toBe('b');
  });

  it('does not reset the focus when the pill body is clicked after an icon request', () => {
    const { rerender } = render(<SplitGroupView group={trio} requestedFocus='b' />);
    expect(getFocusedConversation()).toBe('b');
    fireEvent.pointerDown(screen.getByTestId('split-column-c'));
    rerender(<SplitGroupView group={trio} requestedFocus={undefined} />);
    expect(getFocusedConversation()).toBe('c');
  });

  it('falls back to the oldest remaining column when the focused one is removed', () => {
    const { rerender } = render(<SplitGroupView group={trio} />);
    fireEvent.pointerDown(screen.getByTestId('split-column-b'));
    expect(getFocusedConversation()).toBe('b');

    const pair: SplitGroup = { id: 'g1', members: [trio.members[0], trio.members[2]] };
    rerender(<SplitGroupView group={pair} />);
    expect(getMountedConversationIds()).toEqual(['a', 'c']);
    expect(getFocusedConversation()).toBe('a');
    expect(focusedOf('a')).toBe('true');
  });

  it('never re-points a mounted column at another conversation when membership changes', () => {
    const { rerender } = render(<SplitGroupView group={trio} />);
    const pair: SplitGroup = { id: 'g1', members: [trio.members[0], trio.members[2]] };
    rerender(<SplitGroupView group={pair} />);
    const grown: SplitGroup = { id: 'g1', members: [...pair.members, member('d', 3)] };
    rerender(<SplitGroupView group={grown} />);
    // Surviving columns mounted exactly once; the newcomer mounted fresh.
    expect(mountCounts.get('a')).toBe(1);
    expect(mountCounts.get('c')).toBe(1);
    expect(mountCounts.get('d')).toBe(1);
    expect(getMountedConversationIds()).toEqual(['a', 'c', 'd']);
  });
});

describe('SplitGroupView on a narrow viewport (tabs)', () => {
  beforeEach(() => {
    layoutState.isMobile = true;
  });

  it('shows one member at a time and focuses it', () => {
    render(<SplitGroupView group={trio} />);
    expect(screen.getByTestId('split-group-view-g1')).toHaveAttribute('data-layout', 'tabs');
    expect(getMountedConversationIds()).toEqual(['a']);
    expect(getFocusedConversation()).toBe('a');
    expect(screen.queryByTestId('split-column-b')).toBeNull();
  });

  it('starts on the requested member', () => {
    render(<SplitGroupView group={trio} requestedFocus='c' />);
    expect(getMountedConversationIds()).toEqual(['c']);
    expect(getFocusedConversation()).toBe('c');
  });

  it('switches the mounted column with the tab strip and moves the focus with it', () => {
    render(<SplitGroupView group={trio} />);
    act(() => {
      fireEvent.click(screen.getByText('b'));
    });
    expect(getMountedConversationIds()).toEqual(['b']);
    expect(getFocusedConversation()).toBe('b');
    expect(getFocusedProject()).toBe('p2');
  });

  it('shows the member a later pill request names, with membership unchanged', () => {
    const { rerender } = render(<SplitGroupView group={trio} />);
    expect(getMountedConversationIds()).toEqual(['a']);
    rerender(<SplitGroupView group={trio} requestedFocus='c' />);
    expect(getMountedConversationIds()).toEqual(['c']);
    expect(getFocusedConversation()).toBe('c');
  });

  it('marks a member read only when its tab is opened', () => {
    render(<SplitGroupView group={trio} />);
    expect(markAsRead).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(screen.getByText('b'));
    });
    expect(markAsRead).toHaveBeenCalledTimes(1);
    expect(markAsRead).toHaveBeenCalledWith('b');
  });

  it('shows a member again when its pill row is clicked a second time', () => {
    const { rerender } = render(<SplitGroupView group={trio} requestedFocus='b' requestKey='b:1' />);
    act(() => {
      fireEvent.click(screen.getByText('c'));
    });
    expect(getMountedConversationIds()).toEqual(['c']);
    rerender(<SplitGroupView group={trio} requestedFocus='b' requestKey='b:2' />);
    expect(getMountedConversationIds()).toEqual(['b']);
  });

  it('does not let a stale focus name pick a member that is not shown', () => {
    setFocusedConversation('c');
    render(<SplitGroupView group={trio} />);
    expect(getMountedConversationIds()).toEqual(['a']);
    expect(getFocusedConversation()).toBe('a');
  });
});

describe('SplitGroupView title', () => {
  it('names the split by its size while it is unnamed', () => {
    render(<SplitGroupView group={trio} />);
    expect(screen.getByTestId('split-group-view-title-g1').textContent).toBe('conversation.splitGroup.blockLabel');
  });

  it('leaves the tab layout bounded: the title takes room from the pane, not from the viewport', () => {
    layoutState.isMobile = true;
    render(<SplitGroupView group={trio} />);
    const view = screen.getByTestId('split-group-view-g1');
    // A bounded flex column: the title and the tab strip hold their own height,
    // and the pane below them takes what is left instead of overflowing. The
    // title is a third shrink-0 sibling in a layout that already had two.
    expect(view.className).toContain('flex-col');
    expect(view.className).toContain('h-full');
    expect(view.className).toContain('min-h-0');
    expect(screen.getByTestId('split-group-view-title-g1').className).toContain('shrink-0');
    const pane = screen.getByTestId('split-column-a').closest('div[class*="flex-1"]');
    expect(pane).not.toBeNull();
    expect(pane?.className).toContain('min-h-0');
  });

  it('shows the name and the size once the group is named, on both layouts', () => {
    render(<SplitGroupView group={{ ...trio, name: 'Research' }} />);
    expect(screen.getByTestId('split-group-view-title-g1').textContent).toBe(
      'conversation.splitGroup.blockLabelNamed:Research:3'
    );
    cleanup();
    layoutState.isMobile = true;
    render(<SplitGroupView group={{ ...trio, name: 'Research' }} />);
    expect(screen.getByTestId('split-group-view-title-g1').textContent).toBe(
      'conversation.splitGroup.blockLabelNamed:Research:3'
    );
  });
});

/**
 * Columns are reordered by grabbing their headers; the view keeps the new
 * order at once and writes it onto the group in one batch, and puts it back
 * when the write is refused. Alt+Arrow on the grip is the keyboard's way.
 */
// Frames laid out side by side, 400px each and 800px tall, so the resolver has rects to read.
const withFrameRects = (body: () => void) => {
  const rect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.hasAttribute('data-column-index')) {
      const index = Number(this.getAttribute('data-column-index'));
      return { left: index * 400, right: index * 400 + 400, width: 400, top: 0, bottom: 800, height: 800 } as DOMRect;
    }
    return rect.call(this);
  };
  try {
    body();
  } finally {
    HTMLElement.prototype.getBoundingClientRect = rect;
  }
};

/** A write that settles when the test says so. */
const deferredWrite = () => {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  return { promise, resolve };
};

describe('SplitGroupView column reorder', () => {
  const columnOrder = () => screen.getByTestId('split-group-view-g1').getAttribute('data-column-order');

  beforeEach(() => {
    reorderMembersMock.mockClear();
    reorderMembersMock.mockResolvedValue(true);
  });

  it('renders the columns in the group order and hands each header a grip', () => {
    render(<SplitGroupView group={trio} />);
    expect(columnOrder()).toBe('a|b|c');
    expect(screen.getAllByTestId(/^split-column-grip-/).map((e) => e.getAttribute('aria-label'))).toEqual([
      'conversation.splitGroup.reorderHandle',
      'conversation.splitGroup.reorderHandle',
      'conversation.splitGroup.reorderHandle',
    ]);
  });

  it('moves a column with Alt+Arrow, writes the whole order, and says where it went', async () => {
    render(<SplitGroupView group={trio} />);
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
    });
    expect(columnOrder()).toBe('a|c|b');
    expect(reorderMembersMock).toHaveBeenCalledWith('g1', ['a', 'c', 'b']);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('split-group-reorder-status-g1').textContent).toBe('conversation.splitGroup.columnMoved');
  });

  it('says the column moved only once the write has landed, and says so when it is refused', async () => {
    const write = deferredWrite();
    reorderMembersMock.mockReturnValue(write.promise);
    render(<SplitGroupView group={trio} />);
    const status = () => screen.getByTestId('split-group-reorder-status-g1').textContent;
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
    });
    expect(columnOrder()).toBe('a|c|b');
    expect(status()).toBe('');
    await act(async () => {
      write.resolve(false);
      await Promise.resolve();
    });
    expect(columnOrder()).toBe('a|b|c');
    expect(status()).toBe('conversation.splitGroup.columnNotMoved');
  });

  it('empties the live region after a moment, so the same words can be said again', async () => {
    vi.useFakeTimers();
    try {
      render(<SplitGroupView group={trio} />);
      await act(async () => {
        fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
        await Promise.resolve();
      });
      expect(screen.getByTestId('split-group-reorder-status-g1').textContent).toBe(
        'conversation.splitGroup.columnMoved'
      );
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByTestId('split-group-reorder-status-g1').textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing at the edge, and without Alt', async () => {
    render(<SplitGroupView group={trio} />);
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('split-column-grip-a'), { key: 'ArrowLeft', altKey: true });
      fireEvent.keyDown(screen.getByTestId('split-column-grip-b'), { key: 'ArrowRight' });
    });
    expect(columnOrder()).toBe('a|b|c');
    expect(reorderMembersMock).not.toHaveBeenCalled();
  });

  it('puts the columns back when the write is refused', async () => {
    reorderMembersMock.mockResolvedValue(false);
    render(<SplitGroupView group={trio} />);
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(columnOrder()).toBe('a|b|c');
  });

  it('puts the columns back to the order the group confirmed since, not the order the write left from', async () => {
    const write = deferredWrite();
    reorderMembersMock.mockReturnValue(write.promise);
    const view = render(<SplitGroupView group={trio} />);
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
    });
    expect(columnOrder()).toBe('a|c|b');
    // Another window reordered the group while the write was out: the screen
    // holds its own order until the write settles, then takes the group's.
    const elsewhere: SplitGroup = { id: 'g1', members: [trio.members[1], trio.members[0], trio.members[2]] };
    view.rerender(<SplitGroupView group={elsewhere} />);
    expect(columnOrder()).toBe('a|c|b');
    await act(async () => {
      write.resolve(false);
      await Promise.resolve();
    });
    expect(columnOrder()).toBe('b|a|c');
  });

  it('lets a newer optimistic order stand when an older write is the one refused', async () => {
    const settlers: Array<(landed: boolean) => void> = [];
    reorderMembersMock.mockImplementation(() => new Promise<boolean>((resolve) => settlers.push(resolve)));
    render(<SplitGroupView group={trio} />);
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
    });
    expect(columnOrder()).toBe('c|a|b');
    await act(async () => {
      settlers[0](false);
      await Promise.resolve();
    });
    expect(columnOrder()).toBe('c|a|b');
    await act(async () => {
      settlers[1](false);
      await Promise.resolve();
    });
    expect(columnOrder()).toBe('a|b|c');
  });

  it('does not follow the first write back through the group while a second is still out', async () => {
    const settlers: Array<(landed: boolean) => void> = [];
    reorderMembersMock.mockImplementation(() => new Promise<boolean>((resolve) => settlers.push(resolve)));
    const view = render(<SplitGroupView group={trio} />);
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
    });
    expect(columnOrder()).toBe('c|a|b');
    // The first write lands and comes back through the group: a|c|b.
    await act(async () => {
      settlers[0](true);
      await Promise.resolve();
    });
    const firstLanded: SplitGroup = { id: 'g1', members: [trio.members[0], trio.members[2], trio.members[1]] };
    view.rerender(<SplitGroupView group={firstLanded} />);
    expect(columnOrder()).toBe('c|a|b');
    // A move meanwhile is computed from what is on screen, not the stale echo.
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowRight', altKey: true });
    });
    expect(columnOrder()).toBe('a|c|b');
    expect(reorderMembersMock).toHaveBeenLastCalledWith('g1', ['a', 'c', 'b']);
    // The rest land and the group catches up to the last order.
    await act(async () => {
      settlers[1](true);
      settlers[2](true);
      await Promise.resolve();
    });
    view.rerender(<SplitGroupView group={firstLanded} />);
    expect(columnOrder()).toBe('a|c|b');
    // With nothing out, the group is followed again.
    const elsewhere: SplitGroup = { id: 'g1', members: [trio.members[1], trio.members[0], trio.members[2]] };
    view.rerender(<SplitGroupView group={elsewhere} />);
    expect(columnOrder()).toBe('b|a|c');
  });

  it('keeps an id whole whatever characters it holds', () => {
    const odd: SplitGroup = { id: 'g1', members: [member('x|y', 0), member('z', 1)] };
    render(<SplitGroupView group={odd} />);
    expect(screen.getAllByTestId(/^split-column-frame-/).map((e) => e.dataset.testid?.slice(19))).toEqual(['x|y', 'z']);
  });

  it('announces only the newest write when two settle out of order', async () => {
    const settlers: Array<(landed: boolean) => void> = [];
    reorderMembersMock.mockImplementation(() => new Promise<boolean>((resolve) => settlers.push(resolve)));
    render(<SplitGroupView group={trio} />);
    const status = () => screen.getByTestId('split-group-reorder-status-g1').textContent;
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
    });
    await act(async () => {
      settlers[1](true);
      await Promise.resolve();
    });
    expect(status()).toBe('conversation.splitGroup.columnMoved');
    // The older write is refused after the newer one landed: nothing to add.
    await act(async () => {
      settlers[0](false);
      await Promise.resolve();
    });
    expect(status()).toBe('conversation.splitGroup.columnMoved');
    expect(columnOrder()).toBe('c|a|b');
  });

  it('drops the repeat timer with the view', async () => {
    vi.useFakeTimers();
    reorderMembersMock.mockResolvedValue(false);
    try {
      const view = render(<SplitGroupView group={trio} />);
      const refusedMove = async () => {
        await act(async () => {
          fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
          await Promise.resolve();
        });
      };
      await refusedMove();
      await refusedMove();
      expect(screen.getByTestId('split-group-reorder-status-g1').textContent).toBe('');
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says the same words again when a second move ends the same way', async () => {
    vi.useFakeTimers();
    reorderMembersMock.mockResolvedValue(false);
    try {
      render(<SplitGroupView group={trio} />);
      const status = () => screen.getByTestId('split-group-reorder-status-g1').textContent;
      await act(async () => {
        fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
        await Promise.resolve();
      });
      expect(status()).toBe('conversation.splitGroup.columnNotMoved');
      await act(async () => {
        fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
        await Promise.resolve();
      });
      // Emptied first, so the same words are a change the live region sees.
      expect(status()).toBe('');
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(status()).toBe('conversation.splitGroup.columnNotMoved');
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves a newer optimistic order alone when an older write throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const settlers: Array<{ resolve: (landed: boolean) => void; reject: (reason: Error) => void }> = [];
    reorderMembersMock.mockImplementation(
      () => new Promise<boolean>((resolve, reject) => settlers.push({ resolve, reject }))
    );
    try {
      render(<SplitGroupView group={trio} />);
      await act(async () => {
        fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
      });
      await act(async () => {
        fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
      });
      expect(columnOrder()).toBe('c|a|b');
      await act(async () => {
        settlers[0].reject(new Error('ipc down'));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(columnOrder()).toBe('c|a|b');
    } finally {
      error.mockRestore();
    }
  });

  it('treats a write that throws as refused', async () => {
    reorderMembersMock.mockRejectedValue(new Error('ipc down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<SplitGroupView group={trio} />);
      await act(async () => {
        fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(columnOrder()).toBe('a|b|c');
      expect(screen.getByTestId('split-group-reorder-status-g1').textContent).toBe(
        'conversation.splitGroup.columnNotMoved'
      );
    } finally {
      error.mockRestore();
    }
  });

  it('reorders by a pointer drag on the header: third column into the first slot, marker at the slot', () => {
    withFrameRects(() => {
      render(<SplitGroupView group={trio} />);
      const header = screen.getByTestId('split-column-header-c');
      fireEvent.pointerDown(header, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 1000 });
      // A few pixels is still a click.
      fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'mouse', clientX: 1003 });
      expect(header.getAttribute('data-dragging')).toBe('false');
      // Past the threshold it is a drag; over the first column's left half the marker shows at slot 0.
      fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'mouse', clientX: 700 });
      fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'mouse', clientX: 100 });
      expect(header.getAttribute('data-dragging')).toBe('true');
      expect(screen.getByTestId('split-group-view-g1').getAttribute('data-drop-slot')).toBe('0');
      expect(screen.getByTestId('split-column-drop-marker-a-start')).toBeInTheDocument();
      fireEvent.pointerUp(header, { pointerId: 1, pointerType: 'mouse', clientX: 100 });
      expect(columnOrder()).toBe('c|a|b');
      expect(reorderMembersMock).toHaveBeenCalledWith('g1', ['c', 'a', 'b']);
      expect(screen.queryByTestId(/^split-column-drop-marker-/)).toBeNull();
    });
  });

  it('still drags when the header cannot capture the pointer: the listeners are on the window', () => {
    const capture = HTMLElement.prototype.setPointerCapture;
    HTMLElement.prototype.setPointerCapture = () => {
      throw new Error('no capture here');
    };
    try {
      withFrameRects(() => {
        render(<SplitGroupView group={trio} />);
        const header = screen.getByTestId('split-column-header-c');
        fireEvent.pointerDown(header, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 1000, clientY: 20 });
        fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 20 });
        expect(header.getAttribute('data-dragging')).toBe('true');
        fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 20 });
        expect(columnOrder()).toBe('c|a|b');
      });
    } finally {
      HTMLElement.prototype.setPointerCapture = capture;
    }
  });

  it('drops nothing when the pointer is released above or below the columns', () => {
    withFrameRects(() => {
      render(<SplitGroupView group={trio} />);
      const header = screen.getByTestId('split-column-header-c');
      fireEvent.pointerDown(header, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 1000, clientY: 20 });
      fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 20 });
      expect(screen.getByTestId('split-group-view-g1').getAttribute('data-drop-slot')).toBe('0');
      // Same x, but off the top of the columns: no slot, no marker.
      fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: -40 });
      expect(screen.getByTestId('split-group-view-g1').getAttribute('data-drop-slot')).toBeNull();
      expect(screen.queryByTestId(/^split-column-drop-marker-/)).toBeNull();
      fireEvent.pointerUp(header, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 900 });
      expect(header.getAttribute('data-dragging')).toBe('false');
      expect(columnOrder()).toBe('a|b|c');
      expect(reorderMembersMock).not.toHaveBeenCalled();
    });
  });

  it('leaves a press inside the title field to the field: selecting text is not a drag', () => {
    withFrameRects(() => {
      render(<SplitGroupView group={trio} />);
      const header = screen.getByTestId('split-column-header-c');
      const input = screen.getByTestId('split-column-input-c');
      fireEvent.pointerDown(input, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 1000, clientY: 20 });
      fireEvent.pointerMove(input, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 20 });
      expect(header.getAttribute('data-dragging')).toBe('false');
      fireEvent.pointerUp(input, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 20 });
      expect(columnOrder()).toBe('a|b|c');
      expect(reorderMembersMock).not.toHaveBeenCalled();
    });
  });

  it('leaves a press on the minimap trigger to the trigger: a move is not a drag, and its click still fires', () => {
    withFrameRects(() => {
      render(<SplitGroupView group={trio} />);
      const header = screen.getByTestId('split-column-header-c');
      const trigger = screen.getByTestId('split-column-minimap-c');
      fireEvent.pointerDown(trigger, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 1000, clientY: 20 });
      fireEvent.pointerMove(trigger, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 20 });
      expect(header.getAttribute('data-dragging')).toBe('false');
      expect(screen.getByTestId('split-group-view-g1').getAttribute('data-drop-slot')).toBeNull();
      fireEvent.pointerUp(trigger, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 20 });
      fireEvent.click(trigger);
      expect(minimapClicks).toEqual(['c']);
      expect(columnOrder()).toBe('a|b|c');
      expect(reorderMembersMock).not.toHaveBeenCalled();
      // The header beside it is still the drag.
      fireEvent.pointerDown(header, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 1000, clientY: 20 });
      fireEvent.pointerMove(header, { pointerId: 2, pointerType: 'mouse', clientX: 100, clientY: 20 });
      expect(header.getAttribute('data-dragging')).toBe('true');
      fireEvent.pointerUp(header, { pointerId: 2, pointerType: 'mouse', clientX: 100, clientY: 20 });
      expect(columnOrder()).toBe('c|a|b');
    });
  });

  it('leaves a finger held on the minimap trigger to the trigger: no drag after the hold, and its tap still fires', () => {
    vi.useFakeTimers();
    try {
      withFrameRects(() => {
        render(<SplitGroupView group={trio} />);
        const header = screen.getByTestId('split-column-header-c');
        const trigger = screen.getByTestId('split-column-minimap-c');
        fireEvent.pointerDown(trigger, { pointerId: 7, pointerType: 'touch', clientX: 1000, clientY: 20 });
        act(() => {
          vi.advanceTimersByTime(300);
        });
        expect(header.getAttribute('data-dragging')).toBe('false');
        fireEvent.pointerUp(trigger, { pointerId: 7, pointerType: 'touch', clientX: 1000, clientY: 20 });
        fireEvent.click(trigger);
        expect(minimapClicks).toEqual(['c']);
        expect(reorderMembersMock).not.toHaveBeenCalled();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a cancelled pointer go without a drop', () => {
    withFrameRects(() => {
      render(<SplitGroupView group={trio} />);
      const header = screen.getByTestId('split-column-header-c');
      fireEvent.pointerDown(header, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 1000, clientY: 20 });
      fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 20 });
      expect(screen.getByTestId('split-group-view-g1').getAttribute('data-drop-slot')).toBe('0');
      expect(() => fireEvent.pointerCancel(header, { pointerId: 1, pointerType: 'mouse' })).not.toThrow();
      expect(header.getAttribute('data-dragging')).toBe('false');
      expect(screen.queryByTestId(/^split-column-drop-marker-/)).toBeNull();
      expect(columnOrder()).toBe('a|b|c');
      expect(reorderMembersMock).not.toHaveBeenCalled();
    });
  });

  it('hears one pointer at a time: a second one adds no listeners and moves nothing', () => {
    const added = vi.spyOn(window, 'addEventListener');
    try {
      withFrameRects(() => {
        render(<SplitGroupView group={trio} />);
        const header = screen.getByTestId('split-column-header-c');
        fireEvent.pointerDown(header, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 1000, clientY: 20 });
        fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'mouse', clientX: 500, clientY: 20 });
        const listeners = added.mock.calls.length;
        const other = screen.getByTestId('split-column-header-a');
        fireEvent.pointerDown(other, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 20 });
        expect(added.mock.calls.length).toBe(listeners);
        fireEvent.pointerMove(window, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 20 });
        expect(screen.getByTestId('split-group-view-g1').getAttribute('data-drop-slot')).toBe('1');
        fireEvent.pointerUp(window, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 20 });
        expect(header.getAttribute('data-dragging')).toBe('true');
        fireEvent.pointerUp(header, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 20 });
        expect(columnOrder()).toBe('c|a|b');
      });
    } finally {
      added.mockRestore();
    }
  });

  it('ignores Alt+Arrow while the pointer has a column', () => {
    withFrameRects(() => {
      render(<SplitGroupView group={trio} />);
      const header = screen.getByTestId('split-column-header-c');
      fireEvent.pointerDown(header, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 1000, clientY: 20 });
      fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'mouse', clientX: 700, clientY: 20 });
      expect(header.getAttribute('data-dragging')).toBe('true');
      fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
      expect(columnOrder()).toBe('a|b|c');
      expect(reorderMembersMock).not.toHaveBeenCalled();
      fireEvent.pointerUp(header, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 20 });
      expect(columnOrder()).toBe('c|a|b');
    });
  });

  it('lets go of the window and the capture when the view goes mid-drag, and writes nothing', () => {
    const removed = vi.spyOn(window, 'removeEventListener');
    const released = vi.fn();
    const release = HTMLElement.prototype.releasePointerCapture;
    HTMLElement.prototype.releasePointerCapture = released;
    try {
      withFrameRects(() => {
        const view = render(<SplitGroupView group={trio} />);
        const header = screen.getByTestId('split-column-header-c');
        fireEvent.pointerDown(header, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 1000, clientY: 20 });
        fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 20 });
        expect(header.getAttribute('data-dragging')).toBe('true');
        removed.mockClear();
        expect(() => view.unmount()).not.toThrow();
        expect(removed.mock.calls.map(([type]) => type)).toEqual(
          expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel', 'touchmove'])
        );
        expect(released).toHaveBeenCalledWith(1);
        expect(reorderMembersMock).not.toHaveBeenCalled();
      });
    } finally {
      HTMLElement.prototype.releasePointerCapture = release;
      removed.mockRestore();
    }
  });

  it('lets a finger that moves up or down during the hold scroll instead', () => {
    vi.useFakeTimers();
    try {
      withFrameRects(() => {
        render(<SplitGroupView group={trio} />);
        const header = screen.getByTestId('split-column-header-c');
        fireEvent.pointerDown(header, { pointerId: 7, pointerType: 'touch', clientX: 1000, clientY: 20 });
        fireEvent.pointerMove(header, { pointerId: 7, pointerType: 'touch', clientX: 1001, clientY: 40 });
        act(() => {
          vi.advanceTimersByTime(300);
        });
        expect(header.getAttribute('data-dragging')).toBe('false');
        fireEvent.pointerUp(header, { pointerId: 7, pointerType: 'touch', clientX: 1001, clientY: 40 });
        expect(reorderMembersMock).not.toHaveBeenCalled();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('drags after a still hold, and lets go of the timer and the window when the view goes mid-hold', () => {
    vi.useFakeTimers();
    const removed = vi.spyOn(window, 'removeEventListener');
    try {
      withFrameRects(() => {
        const view = render(<SplitGroupView group={trio} />);
        const header = screen.getByTestId('split-column-header-c');
        fireEvent.pointerDown(header, { pointerId: 7, pointerType: 'touch', clientX: 1000, clientY: 20 });
        fireEvent.pointerMove(header, { pointerId: 7, pointerType: 'touch', clientX: 1002, clientY: 22 });
        act(() => {
          vi.advanceTimersByTime(250);
        });
        expect(header.getAttribute('data-dragging')).toBe('true');
        fireEvent.pointerUp(header, { pointerId: 7, pointerType: 'touch', clientX: 100, clientY: 20 });
        expect(columnOrder()).toBe('c|a|b');
        // The drop's own click-swallow tick runs out before the next hold starts.
        act(() => {
          vi.runOnlyPendingTimers();
        });
        // A second hold, cut short by the view going away.
        const again = screen.getByTestId('split-column-header-a');
        fireEvent.pointerDown(again, { pointerId: 8, pointerType: 'touch', clientX: 600, clientY: 20 });
        removed.mockClear();
        view.unmount();
        expect(vi.getTimerCount()).toBe(0);
        expect(removed.mock.calls.map(([type]) => type)).toEqual(
          expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel'])
        );
      });
    } finally {
      removed.mockRestore();
      vi.useRealTimers();
    }
  });

  it('under an RTL locale, drops by the half toward the end and moves with the arrow that points there', async () => {
    document.documentElement.dir = 'rtl';
    try {
      withFrameRects(() => {
        render(<SplitGroupView group={trio} />);
        const header = screen.getByTestId('split-column-header-c');
        // Over a's right half — toward the start of an RTL row: slot 0.
        fireEvent.pointerDown(header, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 1000, clientY: 20 });
        fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'mouse', clientX: 380, clientY: 20 });
        expect(screen.getByTestId('split-group-view-g1').getAttribute('data-drop-slot')).toBe('0');
        // Over a's left half — toward the end: the slot after a.
        fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'mouse', clientX: 20, clientY: 20 });
        expect(screen.getByTestId('split-group-view-g1').getAttribute('data-drop-slot')).toBe('1');
        fireEvent.pointerUp(header, { pointerId: 1, pointerType: 'mouse', clientX: 380, clientY: 20 });
        expect(columnOrder()).toBe('c|a|b');
      });
      // ArrowLeft points toward the end of an RTL row: c, now first, moves to second.
      await act(async () => {
        fireEvent.keyDown(screen.getByTestId('split-column-grip-c'), { key: 'ArrowLeft', altKey: true });
      });
      expect(columnOrder()).toBe('a|c|b');
    } finally {
      document.documentElement.removeAttribute('dir');
    }
  });

  it('tells the page not to pan once a finger has a column', () => {
    vi.useFakeTimers();
    try {
      withFrameRects(() => {
        render(<SplitGroupView group={trio} />);
        const header = screen.getByTestId('split-column-header-c');
        fireEvent.pointerDown(header, { pointerId: 7, pointerType: 'touch', clientX: 1000, clientY: 20 });
        // Before the hold a touch move is the page's: it may scroll.
        expect(fireEvent.touchMove(window, { touches: [{ clientX: 1000, clientY: 25 }] })).toBe(true);
        act(() => {
          vi.advanceTimersByTime(250);
        });
        expect(header.getAttribute('data-dragging')).toBe('true');
        expect(fireEvent.touchMove(window, { touches: [{ clientX: 900, clientY: 25 }] })).toBe(false);
        fireEvent.pointerUp(header, { pointerId: 7, pointerType: 'touch', clientX: 100, clientY: 20 });
        expect(fireEvent.touchMove(window, { touches: [{ clientX: 100, clientY: 25 }] })).toBe(true);
        expect(columnOrder()).toBe('c|a|b');
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('follows the group when its order changes underneath, as after the write lands', () => {
    const view = render(<SplitGroupView group={trio} />);
    const reordered: SplitGroup = { id: 'g1', members: [trio.members[2], trio.members[0], trio.members[1]] };
    view.rerender(<SplitGroupView group={reordered} />);
    expect(columnOrder()).toBe('c|a|b');
  });
});

/** Three columns, and a pointer over one of them: `overLeft` 100, `overWidth` 200. */
const order = ['a', 'b', 'c'];
const over = (overId: string, pointerX: number) => ({ overId, pointerX, overLeft: 100, overWidth: 200 });

describe('columnReorder: where a dragged column lands', () => {
  it('lands before the column under the pointer when the pointer is in its left half', () => {
    expect(resolveColumnDropIndex({ activeId: 'c', ...over('a', 120), order })).toBe(0);
  });

  it('lands after the column under the pointer when the pointer is in its right half', () => {
    expect(resolveColumnDropIndex({ activeId: 'c', ...over('a', 280), order })).toBe(1);
  });

  it('reads the halves the other way round when the columns run right to left', () => {
    // Under RTL the first column is on the right; its left half is the slot after it.
    expect(resolveColumnDropIndex({ activeId: 'c', ...over('a', 120), order, rtl: true })).toBe(1);
    expect(resolveColumnDropIndex({ activeId: 'c', ...over('a', 280), order, rtl: true })).toBe(0);
    expect(resolveColumnDropIndex({ activeId: 'b', ...over('b', 120), order, rtl: true })).toBeNull();
  });

  it('is a no-op on its own slot, from either side', () => {
    // Left half of b when dragging b: the slot before b is where b is.
    expect(resolveColumnDropIndex({ activeId: 'b', ...over('b', 120), order })).toBeNull();
    // Right half of b: the slot after b, minus b itself, is still where b is.
    expect(resolveColumnDropIndex({ activeId: 'b', ...over('b', 280), order })).toBeNull();
    // The right half of a is the slot before b — b's own place.
    expect(resolveColumnDropIndex({ activeId: 'b', ...over('a', 280), order })).toBeNull();
    // And the left half of c is the slot after b — also b's own place.
    expect(resolveColumnDropIndex({ activeId: 'b', ...over('c', 120), order })).toBeNull();
  });

  it('answers nothing for a column or target it does not know', () => {
    expect(resolveColumnDropIndex({ activeId: 'z', ...over('a', 120), order })).toBeNull();
    expect(resolveColumnDropIndex({ activeId: 'a', ...over('z', 120), order })).toBeNull();
  });

  it('puts the column at the slot: third to first, first to last, first after second, unknown alone', () => {
    expect(reorderColumns(order, 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(reorderColumns(order, 'a', 3)).toEqual(['b', 'c', 'a']);
    expect(reorderColumns(order, 'a', 2)).toEqual(['b', 'a', 'c']);
    expect(reorderColumns(order, 'z', 0)).toEqual(order);
  });

  it('moves one slot either way and stays put at the edges', () => {
    expect(moveColumn(order, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveColumn(order, 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveColumn(order, 'a', -1)).toEqual(order);
    expect(moveColumn(order, 'c', 1)).toEqual(order);
  });

  it('turns an arrow into a step toward the end or the start, whichever way the columns run', () => {
    expect(arrowStep('right', false)).toBe(1);
    expect(arrowStep('left', false)).toBe(-1);
    expect(arrowStep('right', true)).toBe(-1);
    expect(arrowStep('left', true)).toBe(1);
  });

  it('reads the direction from the nearest dir, the document included', () => {
    const root = document.createElement('div');
    const inner = document.createElement('div');
    root.appendChild(inner);
    document.body.appendChild(root);
    try {
      expect(columnsRunRightToLeft(inner)).toBe(false);
      // A detached element has no document to run either way; it reads as LTR.
      expect(columnsRunRightToLeft(document.createElement('div'))).toBe(false);
      document.documentElement.dir = 'rtl';
      expect(columnsRunRightToLeft(inner)).toBe(true);
      root.dir = 'ltr';
      expect(columnsRunRightToLeft(inner)).toBe(false);
    } finally {
      document.documentElement.removeAttribute('dir');
      root.remove();
    }
  });
});
