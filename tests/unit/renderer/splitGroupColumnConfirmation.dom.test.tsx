/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A column confirming that its member is really gone. The backend answering
 * this conversation's own read with 404 is the one thing that means "deleted",
 * and one 404 is asked again before it counts. Reads that fail outright are a
 * different thing — an error is not a deletion — and a stretch of them must
 * not be what stops the confirming re-read from ever landing.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';

type SwrState = {
  data: TChatConversation | null | undefined;
  error?: Error;
  isLoading: boolean;
  isValidating: boolean;
};

let swrState: SwrState = { data: undefined, isLoading: true, isValidating: false };
const swrMutate = vi.fn(async () => undefined);
vi.mock('swr', () => ({ default: () => ({ ...swrState, mutate: swrMutate }) }));

const removeMember = vi.fn(async () => {});
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations', () => ({
  useSplitGroupMutations: () => ({ removeMember }),
}));
vi.mock('@/common', () => ({
  ipcBridge: { conversation: { listChanged: { on: () => () => {} } } },
}));
vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({ getConversationOrNull: vi.fn() }));
vi.mock('@/renderer/pages/conversation/components/ChatConversation', () => ({ default: () => <div /> }));
vi.mock('@/renderer/pages/split/ConversationDropZone', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { SplitGroupColumn } from '@/renderer/pages/split/SplitGroupColumn';

const member = { id: 'b', name: 'B', type: 'acp', created_at: 1, modified_at: 1, extra: {} } as TChatConversation;
const group = { id: 'g', members: [member], leader_id: 'b' } as unknown as Parameters<
  typeof SplitGroupColumn
>[0]['group'];

/** One settled read, for the cases that only care about what the column paints. */
const settleOnce = (state: Partial<SwrState>) => {
  swrState = { data: undefined, isLoading: false, isValidating: false, error: undefined, ...state };
};

/**
 * Drive the column through a sequence of settled reads the way SWR does: each
 * read is preceded by a revalidating pass (`isValidating`), which is what
 * re-runs the confirmation effect for the next answer.
 */
const renderSequence = (reads: Array<Partial<SwrState>>): { read: number } => {
  let read = 0;
  const settle = (state: Partial<SwrState>) => {
    swrState = { data: undefined, isLoading: false, isValidating: false, error: undefined, ...state };
  };
  settle(reads[0]);
  read += 1;
  const view = render(<SplitGroupColumn group={group} member={member} focused />);
  for (const next of reads.slice(1)) {
    swrState = { ...swrState, isValidating: true };
    view.rerender(<SplitGroupColumn group={group} member={member} focused />);
    settle(next);
    read += 1;
    view.rerender(<SplitGroupColumn group={group} member={member} focused />);
  }
  view.unmount();
  return { read };
};

describe('SplitGroupColumn: confirming a deleted member', () => {
  beforeEach(() => {
    removeMember.mockClear();
    swrMutate.mockClear();
  });

  it('asks again after one 404 and removes the member on the second', () => {
    const { read } = renderSequence([{ data: null }, { data: null }]);
    expect(swrMutate).toHaveBeenCalledTimes(1);
    expect(read).toBe(2);
    expect(removeMember).toHaveBeenCalledWith('g', 'b');
  });

  it('still confirms after the retry budget is spent by a stretch of failed reads', () => {
    // The network flaps right after the first 404 and three failed reads spend
    // the nudge budget. That is not a dead end: SWR keeps revalidating a
    // rejected fetch on its own, so the read that finally answers 404 confirms
    // the deletion instead of the column sitting in error for good.
    const offline = { error: new Error('offline') };
    renderSequence([{ data: null }, offline, offline, offline]);
    expect(removeMember).not.toHaveBeenCalled();

    renderSequence([{ data: null }, offline, offline, offline, { data: null }]);
    expect(removeMember).toHaveBeenCalledWith('g', 'b');
  });

  it('never treats a failed read as a deletion', () => {
    const offline = { error: new Error('offline') };
    renderSequence([offline, offline, offline, offline, offline]);
    expect(removeMember).not.toHaveBeenCalled();
  });

  it('outlines the focused column with a hairline, not a heavy primary ring', () => {
    settleOnce({ data: { id: 'b' } as TChatConversation });
    const view = render(<SplitGroupColumn group={group} member={member} focused />);
    const ring = view.getByTestId('split-column-focus-ring-b');
    expect(ring.className).toContain('shadow-[inset_0_0_0_1px_var(--border-base)]');
    expect(ring.className).not.toContain('2px_rgb(var(--primary-6))');
    view.unmount();
  });

  it('leaves an unfocused column with no outline of its own', () => {
    settleOnce({ data: { id: 'b' } as TChatConversation });
    const view = render(<SplitGroupColumn group={group} member={member} focused={false} />);
    expect(view.getByTestId('split-column-focus-ring-b').className).not.toContain('shadow-[inset');
    view.unmount();
  });
});

describe('SplitGroupColumn: the header a column keeps while it has no conversation to show', () => {
  const handle = () => ({
    onPointerDown: vi.fn(),
    onClickCapture: vi.fn(),
    isDragging: false,
    label: 'conversation.splitGroup.reorderHandle',
    onKeyDown: vi.fn(),
  });

  it('keeps the grip on the name while the read is still loading', () => {
    swrState = { data: undefined, isLoading: true, isValidating: true };
    const h = handle();
    render(<SplitGroupColumn group={group} member={member} focused headerDragHandle={h} />);
    const header = screen.getByTestId('split-column-placeholder-header');
    expect(header.getAttribute('data-column-header')).toBe('true');
    expect(header.textContent).toContain('B');
    expect(screen.getByTestId('chat-header-grip')).toHaveAttribute(
      'aria-label',
      'conversation.splitGroup.reorderHandle'
    );
    fireEvent.pointerDown(screen.getByTestId('chat-header-title'));
    expect(h.onPointerDown).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('chat-header-actions').contains(screen.getByTestId('split-column-remove-b'))).toBe(true);
  });

  it('keeps the grip on the name when the conversation could not be loaded', () => {
    settleOnce({ data: null });
    render(<SplitGroupColumn group={group} member={member} focused headerDragHandle={handle()} />);
    expect(screen.getByTestId('split-column-placeholder-header')).toBeInTheDocument();
    expect(screen.getByTestId('chat-header-grip')).toBeInTheDocument();
    expect(screen.getByTestId('split-column-remove-b')).toBeInTheDocument();
  });

  it('shows the band without a grip when there is nothing to reorder', () => {
    swrState = { data: undefined, isLoading: true, isValidating: true };
    render(<SplitGroupColumn group={group} member={member} focused />);
    expect(screen.getByTestId('split-column-placeholder-header')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-header-grip')).toBeNull();
  });
});
