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

const { layoutState, closePreviewIfScopeChanged, mountCounts, markAsRead } = vi.hoisted(() => ({
  layoutState: { isMobile: false },
  closePreviewIfScopeChanged: vi.fn(),
  mountCounts: new Map<string, number>(),
  markAsRead: vi.fn(),
}));

vi.mock('@/renderer/pages/cron', () => ({ useCronJobsMap: () => ({ markAsRead }) }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
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
vi.mock('@/renderer/pages/split/SplitGroupColumn', () => {
  const Column: React.FC<{ group: SplitGroup; member: TChatConversation; focused: boolean }> = ({
    member,
    focused,
  }) => {
    const registration = useFocusedConversationRegistration(member.id);
    React.useEffect(() => {
      mountCounts.set(member.id, (mountCounts.get(member.id) ?? 0) + 1);
    }, [member.id]);
    return (
      <div data-testid={`split-column-${member.id}`} data-focused={focused ? 'true' : 'false'} {...registration}>
        {member.name}
      </div>
    );
  };
  return {
    SplitGroupColumn: Column,
    SplitGroupColumnFrame: Column,
  };
});

import { SplitGroupView } from '@/renderer/pages/split/SplitGroupView';

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

  it('does not let a stale focus name pick a member that is not shown', () => {
    setFocusedConversation('c');
    render(<SplitGroupView group={trio} />);
    expect(getMountedConversationIds()).toEqual(['a']);
    expect(getFocusedConversation()).toBe('a');
  });
});
