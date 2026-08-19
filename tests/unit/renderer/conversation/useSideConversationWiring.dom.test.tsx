/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';

const useSideConversationMock = vi.fn();

const dockPropsMock = vi.fn();
vi.mock('@/renderer/pages/conversation/components/SideConversationPanel/SideConversationDock', () => ({
  default: (props: Record<string, unknown>) => {
    dockPropsMock(props);
    return <div data-testid='side-dock' />;
  },
}));

vi.mock('@/renderer/pages/conversation/components/SideConversationPanel/useSideConversation', () => ({
  useSideConversation: (options: unknown) => useSideConversationMock(options),
}));

import { useSideConversationWiring } from '@/renderer/pages/conversation/components/SideConversationPanel/useSideConversationWiring';
import {
  getSideConversationUi,
  resetSideConversationUiForTest,
} from '@/renderer/pages/conversation/components/SideConversationPanel/sideConversationUiStore';
import { EXPLORER_SHOW_SIDE_EVENT, WORKSPACE_OPEN_EVENT } from '@/renderer/utils/workspace/workspaceEvents';
import type { SideTab } from '@/renderer/pages/conversation/components/SideConversationPanel/useSideConversation';
import type { TChatConversation } from '@/common/config/storage';

const conversation = {
  id: 'p1',
  type: 'acp',
  name: 'Main',
  created_at: 0,
  modified_at: 0,
  model: { id: 'm', platform: 'openai', name: 'p', base_url: '', api_key: '', use_model: 'gpt' },
  extra: { backend: 'claude' },
  fork_capability: { at_turn: false },
} as unknown as TChatConversation;

const baseSide = (over: Partial<Record<string, unknown>> = {}) => ({
  state: 'none',
  childId: undefined,
  tabs: [] as SideTab[],
  activeTabId: undefined,
  mode: 'fork',
  promotedIds: new Set<string>(),
  open: vi.fn(),
  openNewTab: vi.fn(),
  selectTab: vi.fn(),
  promote: vi.fn(),
  discard: vi.fn(),
  discardTab: vi.fn(),
  fillComposer: vi.fn(),
  quoteComposer: vi.fn(),
  ...over,
});

beforeEach(() => {
  useSideConversationMock.mockReset();
  resetSideConversationUiForTest();
});

describe('useSideConversationWiring', () => {
  it('enables side for every conversation that resolves to a mode (mobile included)', () => {
    useSideConversationMock.mockReturnValue(baseSide());

    const fork = renderHook(() => useSideConversationWiring(conversation)).result.current;
    expect(fork.enableSide).toBe(true);

    const read_only = renderHook(() =>
      useSideConversationWiring({ ...conversation, type: 'gemini', fork_capability: undefined })
    ).result.current;
    expect(read_only.enableSide).toBe(false);

    const no_id = renderHook(() => useSideConversationWiring(undefined)).result.current;
    expect(no_id.enableSide).toBe(false);
  });

  it('opens a new seeded tab when the entry carries a question', () => {
    const side = baseSide();
    useSideConversationMock.mockReturnValue(side);

    const { result } = renderHook(() => useSideConversationWiring(conversation));
    result.current.sideControlValue.onOpenSide('what changed?');

    expect(side.openNewTab).toHaveBeenCalledWith('what changed?');
    expect(side.open).not.toHaveBeenCalled();
  });

  it('reuses open() for a bare entry when no tabs exist yet', () => {
    const side = baseSide();
    useSideConversationMock.mockReturnValue(side);

    const { result } = renderHook(() => useSideConversationWiring(conversation));
    result.current.sideControlValue.onOpenSide();

    expect(side.open).toHaveBeenCalledTimes(1);
    expect(side.openNewTab).not.toHaveBeenCalled();
  });

  it('always opens a new tab when tabs already exist', () => {
    const side = baseSide({ tabs: [{ childId: 'c1', mode: 'fork', hasTurn: true }], state: 'active', childId: 'c1' });
    useSideConversationMock.mockReturnValue(side);

    const { result } = renderHook(() => useSideConversationWiring(conversation));
    result.current.sideControlValue.onOpenSide();

    expect(side.openNewTab).toHaveBeenCalledTimes(1);
  });

  it('routes selection quotes to quoteComposer', () => {
    const side = baseSide();
    useSideConversationMock.mockReturnValue(side);

    const { result } = renderHook(() => useSideConversationWiring(conversation));
    const quote = { messageId: 'm1', content: 'selected', position: 'left' as const };
    result.current.sideControlValue.onAskInSide(quote);

    expect(side.quoteComposer).toHaveBeenCalledWith(quote);
  });

  it('entry points expand the sidebar and ask the explorer to show the side tab', () => {
    const side = baseSide();
    useSideConversationMock.mockReturnValue(side);
    const events: string[] = [];
    const onOpen = () => events.push(WORKSPACE_OPEN_EVENT);
    const onShowSide = () => events.push(EXPLORER_SHOW_SIDE_EVENT);
    window.addEventListener(WORKSPACE_OPEN_EVENT, onOpen);
    window.addEventListener(EXPLORER_SHOW_SIDE_EVENT, onShowSide);

    try {
      const { result } = renderHook(() => useSideConversationWiring(conversation));
      result.current.sideControlValue.onOpenSide();
      result.current.sideControlValue.onAskInSide({ messageId: 'm1', content: 'x', position: 'left' });

      expect(events).toEqual([
        WORKSPACE_OPEN_EVENT,
        EXPLORER_SHOW_SIDE_EVENT,
        WORKSPACE_OPEN_EVENT,
        EXPLORER_SHOW_SIDE_EVENT,
      ]);
    } finally {
      window.removeEventListener(WORKSPACE_OPEN_EVENT, onOpen);
      window.removeEventListener(EXPLORER_SHOW_SIDE_EVENT, onShowSide);
    }
  });

  it('publishes the side tab model to the ui store and wires its actions', () => {
    const side = baseSide({
      tabs: [
        { childId: 'c1', mode: 'fork', hasTurn: true, label: 'first question' },
        { childId: 'c2', mode: 'snapshot', hasTurn: false },
      ],
      childId: 'c1',
      activeTabId: 'c1',
      state: 'active',
      promotedIds: new Set(['c1']),
    });
    useSideConversationMock.mockReturnValue(side);

    const { unmount } = renderHook(() => useSideConversationWiring(conversation));

    const snapshot = getSideConversationUi();
    expect(snapshot).toBeTruthy();
    expect(snapshot?.parentId).toBe('p1');
    expect(snapshot?.threads).toEqual([
      { id: 'c1', label: 'first question', mode: 'fork', promoted: true },
      { id: 'c2', label: undefined, mode: 'snapshot', promoted: false },
    ]);
    expect(snapshot?.activeThreadId).toBe('c1');
    expect(snapshot?.content).toBeTruthy();

    snapshot?.selectTab('c2');
    expect(side.selectTab).toHaveBeenCalledWith('c2');

    snapshot?.discardTab('c2');
    expect(side.discardTab).toHaveBeenCalledWith('c2');

    snapshot?.openNewTab();
    expect(side.openNewTab).toHaveBeenCalledWith();

    snapshot?.promoteCurrent();
    expect(side.promote).toHaveBeenCalledTimes(1);

    // Content node is the stripped dock bound to the active child.
    render(snapshot?.content as React.ReactElement);
    expect(dockPropsMock).toHaveBeenCalledWith(expect.objectContaining({ childId: 'c1' }));

    unmount();
    expect(getSideConversationUi()).toBeNull();
  });

  it('publishes nothing when side is unsupported', () => {
    useSideConversationMock.mockReturnValue(baseSide());
    renderHook(() => useSideConversationWiring({ ...conversation, type: 'gemini', fork_capability: undefined }));
    expect(getSideConversationUi()).toBeNull();
  });

  it('content node follows childId changes', () => {
    const side = baseSide({
      tabs: [{ childId: 'c1', mode: 'fork', hasTurn: true }],
      childId: 'c1',
      activeTabId: 'c1',
      state: 'active',
    });
    useSideConversationMock.mockReturnValue(side);

    const { rerender } = renderHook(() => useSideConversationWiring(conversation));
    expect(getSideConversationUi()?.activeThreadId).toBe('c1');

    act(() => {
      side.childId = 'c2';
      side.activeTabId = 'c2';
      rerender();
    });
    expect(getSideConversationUi()?.activeThreadId).toBe('c2');
  });
});
