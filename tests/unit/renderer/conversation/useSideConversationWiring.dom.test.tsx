/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const useSideConversationMock = vi.fn();

vi.mock('@/renderer/pages/conversation/components/SideConversationPanel/useSideConversation', () => ({
  useSideConversation: (options: unknown) => useSideConversationMock(options),
}));

import { useSideConversationWiring } from '@/renderer/pages/conversation/components/SideConversationPanel/useSideConversationWiring';
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
  open: vi.fn(),
  openNewTab: vi.fn(),
  reopen: vi.fn(),
  collapse: vi.fn(),
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
});

describe('useSideConversationWiring', () => {
  it('enables side only for non-mobile conversations that resolve to a mode', () => {
    useSideConversationMock.mockReturnValue(baseSide());

    const fork = renderHook(() => useSideConversationWiring(conversation, false)).result.current;
    expect(fork.enableSide).toBe(true);

    const mobile = renderHook(() => useSideConversationWiring(conversation, true)).result.current;
    expect(mobile.enableSide).toBe(false);

    const read_only = renderHook(() =>
      useSideConversationWiring({ ...conversation, type: 'gemini', fork_capability: undefined }, false)
    ).result.current;
    expect(read_only.enableSide).toBe(false);

    const no_id = renderHook(() => useSideConversationWiring(undefined, false)).result.current;
    expect(no_id.enableSide).toBe(false);
  });

  it('opens a new seeded tab when the entry carries a question', () => {
    const side = baseSide();
    useSideConversationMock.mockReturnValue(side);

    const { result } = renderHook(() => useSideConversationWiring(conversation, false));
    result.current.sideControlValue.onOpenSide('what changed?');

    expect(side.openNewTab).toHaveBeenCalledWith('what changed?');
    expect(side.open).not.toHaveBeenCalled();
  });

  it('reuses open() for a bare entry when no tabs exist yet', () => {
    const side = baseSide();
    useSideConversationMock.mockReturnValue(side);

    const { result } = renderHook(() => useSideConversationWiring(conversation, false));
    result.current.sideControlValue.onOpenSide();

    expect(side.open).toHaveBeenCalledTimes(1);
    expect(side.openNewTab).not.toHaveBeenCalled();
  });

  it('always opens a new tab when tabs already exist', () => {
    const side = baseSide({ tabs: [{ childId: 'c1', mode: 'fork', hasTurn: true }], state: 'active', childId: 'c1' });
    useSideConversationMock.mockReturnValue(side);

    const { result } = renderHook(() => useSideConversationWiring(conversation, false));
    result.current.sideControlValue.onOpenSide();

    expect(side.openNewTab).toHaveBeenCalledTimes(1);
  });

  it('routes selection quotes to quoteComposer', () => {
    const side = baseSide();
    useSideConversationMock.mockReturnValue(side);

    const { result } = renderHook(() => useSideConversationWiring(conversation, false));
    const quote = { messageId: 'm1', content: 'selected', position: 'left' as const };
    result.current.sideControlValue.onAskInSide(quote);

    expect(side.quoteComposer).toHaveBeenCalledWith(quote);
  });

  it('renders the dock node only when a child is active and not collapsed', () => {
    const hidden = baseSide({
      tabs: [{ childId: 'c1', mode: 'fork', hasTurn: true }],
      childId: 'c1',
      state: 'collapsed',
    });
    useSideConversationMock.mockReturnValue(hidden);
    const collapsed = renderHook(() => useSideConversationWiring(conversation, false)).result.current;
    expect(collapsed.sideDockOpen).toBe(false);
    expect(collapsed.sideDock).toBeNull();
    expect(collapsed.sideControlValue.sideCollapsed).toBe(true);

    const shown = baseSide({ tabs: [{ childId: 'c1', mode: 'fork', hasTurn: true }], childId: 'c1', state: 'active' });
    useSideConversationMock.mockReturnValue(shown);
    const active = renderHook(() => useSideConversationWiring(conversation, false)).result.current;
    expect(active.sideDockOpen).toBe(true);
    expect(active.sideDock).toBeTruthy();
  });
});
