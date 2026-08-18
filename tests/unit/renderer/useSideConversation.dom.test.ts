/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const fork = vi.fn();
const createWithConversation = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const sendMessage = vi.fn();
const ensureRuntime = vi.fn();
const getUserConversations = vi.fn();
const getConversationMessages = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      fork: { invoke: (...a: unknown[]) => fork(...a) },
      createWithConversation: { invoke: (...a: unknown[]) => createWithConversation(...a) },
      update: { invoke: (...a: unknown[]) => update(...a) },
      remove: { invoke: (...a: unknown[]) => remove(...a) },
      sendMessage: { invoke: (...a: unknown[]) => sendMessage(...a) },
      ensureRuntime: { invoke: (...a: unknown[]) => ensureRuntime(...a) },
    },
    database: {
      getUserConversations: { invoke: (...a: unknown[]) => getUserConversations(...a) },
      getConversationMessages: { invoke: (...a: unknown[]) => getConversationMessages(...a) },
    },
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Message: { error: vi.fn(), info: vi.fn() },
}));

import { useSideConversation } from '@/renderer/pages/conversation/components/SideConversationPanel/useSideConversation';
import type { TChatConversation } from '@/common/config/storage';

const makeParent = (over: Partial<TChatConversation> = {}): TChatConversation =>
  ({
    id: 'p1',
    type: 'acp',
    name: 'Main',
    created_at: 0,
    modified_at: 0,
    model: { id: 'm', platform: 'openai', name: 'p', base_url: '', api_key: '', use_model: 'gpt' },
    extra: { backend: 'codex', workspace: '/w' },
    ...over,
  }) as TChatConversation;

// Fork-capable parent (claude / codex / Aion CLI backends).
const forkParent = makeParent({ fork_capability: { at_turn: true } });
// Fork-incapable but chatty parent (hermes / pi / custom ACP agents).
const snapshotParent = makeParent({ extra: { backend: 'hermes', workspace: '/w' } });

const childConversation = (id: string, created_at: number, hasTurn: boolean, mode?: 'agent_fork' | 'text_snapshot') =>
  ({
    id,
    type: 'acp',
    name: `Side ${id}`,
    created_at,
    modified_at: hasTurn ? created_at + 1 : created_at,
    model: forkParent.model,
    extra: {
      backend: 'codex',
      side_mode: true,
      ephemeral: true,
      parent_conversation_id: 'p1',
      ...(mode ? { side_fork_mode: mode } : {}),
    },
  }) as TChatConversation;

beforeEach(() => {
  fork.mockReset();
  createWithConversation.mockReset();
  update.mockReset();
  remove.mockReset();
  sendMessage.mockReset();
  ensureRuntime.mockReset();
  getUserConversations.mockReset();
  getConversationMessages.mockReset();
  update.mockResolvedValue(true);
  remove.mockResolvedValue(true);
  ensureRuntime.mockResolvedValue(undefined);
  sendMessage.mockResolvedValue({ msg_id: 'm1' });
  getUserConversations.mockResolvedValue({ items: [], total: 0, has_more: false });
  // Latest-window shape: one newest text row serves as both fork anchor and
  // transcript source.
  getConversationMessages.mockResolvedValue({
    items: [
      {
        id: 'anchor',
        msg_id: 'anchor',
        type: 'text',
        position: 'left',
        content: { content: 'assistant answer' },
      },
    ],
    oldest_cursor: null,
    newest_cursor: 'c',
    has_more_before: false,
    has_more_after: false,
  });
});

describe('useSideConversation — restore', () => {
  it('restores side tabs from the conversation list filtered by side markers', async () => {
    const otherParentChild = {
      ...childConversation('other', 9, true),
      extra: { ...childConversation('other', 9, true).extra, parent_conversation_id: 'p9' },
    };
    getUserConversations.mockResolvedValue({
      items: [
        otherParentChild, // side child of another parent — excluded
        { ...childConversation('nomarker', 8, true), extra: { backend: 'codex' } }, // no side markers — excluded
        childConversation('c2', 2, true, 'text_snapshot'),
        childConversation('c1', 1, false),
      ],
      total: 4,
      has_more: false,
    });
    const restoredParent = {
      ...forkParent,
      extra: { ...forkParent.extra, active_side_id: 'c2', side_panel_hidden: false },
    } as TChatConversation;

    const { result } = renderHook(() => useSideConversation({ parent: restoredParent }));

    await waitFor(() => {
      expect(result.current.tabs.map((tab) => tab.childId)).toEqual(['c1', 'c2']);
    });
    expect(result.current.tabs[0]).toEqual({ childId: 'c1', mode: 'fork', hasTurn: false });
    expect(result.current.tabs[1]).toEqual({ childId: 'c2', mode: 'snapshot', hasTurn: true });
    expect(result.current.activeTabId).toBe('c2');
    expect(result.current.state).toBe('active');
  });
});

describe('useSideConversation — fork mode', () => {
  it('creates a side tab through the native fork API and marks it as a side child', async () => {
    fork.mockResolvedValue(childConversation('c1', 1, false, 'agent_fork'));

    const { result } = renderHook(() => useSideConversation({ parent: forkParent }));

    await act(async () => {
      await result.current.open('first question');
    });

    expect(fork).toHaveBeenCalledWith({ conversation_id: 'p1', message_id: 'anchor' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'c1',
        updates: {
          extra: {
            side_mode: true,
            ephemeral: true,
            parent_conversation_id: 'p1',
            side_fork_mode: 'agent_fork',
            forked_at_msg_id: 'anchor',
          },
        },
        merge_extra: true,
      })
    );
    expect(ensureRuntime).toHaveBeenCalledWith({ conversation_id: 'c1' });
    expect(sendMessage).toHaveBeenCalledWith({ conversation_id: 'c1', input: 'first question' });
    expect(result.current.tabs).toEqual([{ childId: 'c1', mode: 'fork', hasTurn: true }]);
    expect(result.current.state).toBe('active');
  });

  it('does not re-create on open() when tabs already exist (unhides instead)', async () => {
    getUserConversations.mockResolvedValue({
      items: [childConversation('c1', 1, false)],
      total: 1,
      has_more: false,
    });
    const { result } = renderHook(() =>
      useSideConversation({
        parent: { ...forkParent, extra: { ...forkParent.extra, side_panel_hidden: true } } as TChatConversation,
      })
    );

    await waitFor(() => {
      expect(result.current.state).toBe('collapsed');
    });

    await act(async () => {
      await result.current.open();
    });

    expect(fork).not.toHaveBeenCalled();
    expect(result.current.state).toBe('empty');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'p1',
        updates: { extra: expect.objectContaining({ active_side_id: 'c1', side_panel_hidden: false }) },
        merge_extra: true,
      })
    );
  });

  it('openNewTab() always forks another child', async () => {
    getUserConversations.mockResolvedValue({
      items: [childConversation('c1', 1, false)],
      total: 1,
      has_more: false,
    });
    fork.mockResolvedValue(childConversation('c2', 2, false, 'agent_fork'));

    const { result } = renderHook(() => useSideConversation({ parent: forkParent }));
    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(1);
    });

    await act(async () => {
      await result.current.openNewTab();
    });

    expect(fork).toHaveBeenCalledTimes(1);
    expect(result.current.tabs.map((tab) => tab.childId)).toEqual(['c1', 'c2']);
  });

  it('surfaces SIDE_PARENT_EMPTY when the parent has no messages to fork from', async () => {
    getConversationMessages.mockResolvedValue({
      items: [],
      oldest_cursor: null,
      newest_cursor: null,
      has_more_before: false,
      has_more_after: false,
    });

    const { result } = renderHook(() => useSideConversation({ parent: forkParent }));

    await act(async () => {
      await result.current.open();
    });

    expect(fork).not.toHaveBeenCalled();
    expect(result.current.state).toBe('none');
  });
});

describe('useSideConversation — snapshot mode', () => {
  it('creates a clone carrying a one-time transcript reference for fork-incapable parents', async () => {
    createWithConversation.mockResolvedValue(childConversation('c1', 1, false, 'text_snapshot'));

    const { result } = renderHook(() => useSideConversation({ parent: snapshotParent }));

    expect(result.current.mode).toBe('snapshot');

    await act(async () => {
      await result.current.open('summarize this');
    });

    expect(fork).not.toHaveBeenCalled();
    expect(createWithConversation).toHaveBeenCalledTimes(1);
    const cloneArg = createWithConversation.mock.calls[0][0].conversation;
    expect(cloneArg.id).not.toBe('p1');
    expect(cloneArg.name).toBe('↳ Main');
    expect(cloneArg.extra.parent_conversation_id).toBeUndefined();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'c1',
        updates: {
          extra: expect.objectContaining({
            side_mode: true,
            ephemeral: true,
            parent_conversation_id: 'p1',
            side_fork_mode: 'text_snapshot',
          }),
        },
        merge_extra: true,
      })
    );
    // The transcript reference is delivered as one framed first message that
    // also carries the initial question.
    expect(getConversationMessages).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: 'p1', limit: 60, content_mode: 'compact' })
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: 'c1', input: expect.any(String) })
    );
    expect(result.current.tabs).toEqual([{ childId: 'c1', mode: 'snapshot', hasTurn: true }]);
  });

  it('skips the bootstrap message when the parent has no text messages', async () => {
    getConversationMessages.mockResolvedValue({
      items: [],
      oldest_cursor: null,
      newest_cursor: null,
      has_more_before: false,
      has_more_after: false,
    });
    createWithConversation.mockResolvedValue(childConversation('c1', 1, false, 'text_snapshot'));

    const { result } = renderHook(() => useSideConversation({ parent: snapshotParent }));

    await act(async () => {
      await result.current.open();
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.current.tabs).toEqual([{ childId: 'c1', mode: 'snapshot', hasTurn: false }]);
  });
});

describe('useSideConversation — lifecycle', () => {
  it('discardTab removes the tab and deletes the child conversation', async () => {
    getUserConversations.mockResolvedValue({
      items: [childConversation('c1', 1, false), childConversation('c2', 2, false)],
      total: 2,
      has_more: false,
    });
    const { result } = renderHook(() =>
      useSideConversation({
        parent: { ...forkParent, extra: { ...forkParent.extra, active_side_id: 'c2' } } as TChatConversation,
      })
    );
    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(2);
    });

    await act(async () => {
      await result.current.discardTab('c2');
    });

    expect(remove).toHaveBeenCalledWith({ id: 'c2' });
    expect(result.current.tabs.map((tab) => tab.childId)).toEqual(['c1']);
    expect(result.current.activeTabId).toBe('c1');
  });

  it('promote clears the ephemeral marker on the child', async () => {
    getUserConversations.mockResolvedValue({
      items: [childConversation('c1', 1, false)],
      total: 1,
      has_more: false,
    });
    const { result } = renderHook(() => useSideConversation({ parent: forkParent }));
    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(1);
    });

    await act(async () => {
      await result.current.promote();
    });

    expect(update).toHaveBeenCalledWith({
      id: 'c1',
      updates: { extra: { ephemeral: false } },
      merge_extra: true,
    });
    expect(result.current.state).toBe('promoted');
  });
});
