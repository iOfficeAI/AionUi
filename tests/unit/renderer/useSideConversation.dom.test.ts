/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const createSide = vi.fn();
const listSide = vi.fn();
const get = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const sendMessage = vi.fn();
const getConversationMessages = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      createSide: { invoke: (...a: unknown[]) => createSide(...a) },
      listSide: { invoke: (...a: unknown[]) => listSide(...a) },
      get: { invoke: (...a: unknown[]) => get(...a) },
      update: { invoke: (...a: unknown[]) => update(...a) },
      remove: { invoke: (...a: unknown[]) => remove(...a) },
      sendMessage: { invoke: (...a: unknown[]) => sendMessage(...a) },
    },
    database: {
      getConversationMessages: { invoke: (...a: unknown[]) => getConversationMessages(...a) },
    },
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Message: { error: vi.fn(), info: vi.fn() },
}));

import { useSideConversation } from '@/renderer/pages/conversation/components/SideConversationPanel/useSideConversation';
import { emitter } from '@/renderer/utils/emitter';
import { Message } from '@arco-design/web-react';
import type { TChatConversation } from '@/common/config/storage';

const parent = {
  id: 'p1',
  type: 'acp',
  name: 'Main',
  created_at: 0,
  modified_at: 0,
  model: { id: 'm', platform: 'openai', name: 'p', base_url: '', api_key: '', use_model: 'gpt' },
  extra: { backend: 'codex', workspace: '/w' },
} as TChatConversation;

beforeEach(() => {
  createSide.mockReset();
  listSide.mockReset();
  get.mockReset();
  update.mockReset();
  remove.mockReset();
  sendMessage.mockReset();
  getConversationMessages.mockReset();
  update.mockResolvedValue(true);
  listSide.mockResolvedValue([]);
  get.mockResolvedValue(null);
  remove.mockResolvedValue(true);
  sendMessage.mockResolvedValue({ msg_id: 'm1' });
  (Message.error as unknown as { mockClear: () => void }).mockClear();
  emitter.removeAllListeners('sendbox.fill.scoped');
  emitter.removeAllListeners('sendbox.fill.scoped.handled');
  getConversationMessages.mockResolvedValue({
    items: [
      {
        id: 'm2',
        conversation_id: 'p1',
        type: 'text',
        msg_id: 'm2',
        content: { content: '助手回复' },
        position: 'left',
        created_at: 2,
      },
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  emitter.removeAllListeners('sendbox.fill.scoped');
  emitter.removeAllListeners('sendbox.fill.scoped.handled');
});

describe('useSideConversation', () => {
  it('restores side tabs from the parent side list after remount', async () => {
    listSide.mockResolvedValue([
      {
        id: 'c2',
        type: 'acp',
        name: 'Side 2',
        created_at: 2,
        modified_at: 3,
        extra: { fork_mode: 'agent_fork', side_mode: true, parent_conversation_id: 'p1' },
      },
      {
        id: 'c1',
        type: 'acp',
        name: 'Side 1',
        created_at: 1,
        modified_at: 1,
        extra: { fork_mode: 'text_snapshot', side_mode: true, parent_conversation_id: 'p1' },
      },
    ]);
    const restoredParent = {
      ...parent,
      extra: { ...parent.extra, active_side_id: 'c2', side_panel_hidden: false },
    } as TChatConversation;

    const { result } = renderHook(() => useSideConversation({ parent: restoredParent }));

    await waitFor(() => {
      expect(result.current.tabs.map((tab) => tab.childId)).toEqual(['c1', 'c2']);
    });
    expect(result.current.activeTabId).toBe('c2');
    expect(result.current.state).toBe('active');
  });

  it('does not label a restoring side tab as snapshot before fork mode hydration', async () => {
    let resolveListSide: (children: TChatConversation[]) => void;
    listSide.mockReturnValue(
      new Promise<TChatConversation[]>((resolve) => {
        resolveListSide = resolve;
      })
    );
    get.mockReturnValue(new Promise(() => {}));
    const restoredParent = {
      ...parent,
      extra: { ...parent.extra, active_side_id: 'c1', side_panel_hidden: false },
    } as TChatConversation;

    const { result } = renderHook(() => useSideConversation({ parent: restoredParent, initialChildId: 'c1' }));

    expect(result.current.tabs[0]?.childId).toBe('c1');
    expect(result.current.tabs[0]?.forkMode).toBeUndefined();

    act(() => {
      resolveListSide([
        {
          id: 'c1',
          type: 'acp',
          name: 'Side 1',
          created_at: 1,
          modified_at: 1,
          extra: { fork_mode: 'agent_fork', side_mode: true, parent_conversation_id: 'p1' },
        } as TChatConversation,
      ]);
    });

    await waitFor(() => {
      expect(result.current.tabs[0]?.forkMode).toBe('agent_fork');
    });
  });

  it('open() creates first tab and re-open without question does not create again', async () => {
    createSide.mockResolvedValue({ conversation_id: 'c1', fork_mode: 'text_snapshot', created: true });
    const { result } = renderHook(() => useSideConversation({ parent }));
    await act(async () => {
      await result.current.open();
    });
    expect(createSide).toHaveBeenCalledTimes(1);
    expect(result.current.tabs).toHaveLength(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'p1',
        merge_extra: true,
        updates: expect.objectContaining({
          extra: expect.objectContaining({ active_side_id: 'c1', side_panel_hidden: false }),
        }),
      })
    );
    await act(async () => {
      await result.current.collapse();
    });
    expect(result.current.state).toBe('collapsed');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'p1',
        updates: expect.objectContaining({
          extra: expect.objectContaining({ active_side_id: 'c1', side_panel_hidden: true }),
        }),
      })
    );
    await act(async () => {
      await result.current.open();
    });
    expect(createSide).toHaveBeenCalledTimes(1);
    expect(result.current.state).not.toBe('collapsed');
  });

  it('openNewTab() always creates another child', async () => {
    createSide
      .mockResolvedValueOnce({ conversation_id: 'c1', fork_mode: 'text_snapshot', created: true })
      .mockResolvedValueOnce({ conversation_id: 'c2', fork_mode: 'text_snapshot', created: true });
    const { result } = renderHook(() => useSideConversation({ parent }));
    await act(async () => {
      await result.current.openNewTab();
      await result.current.openNewTab();
    });
    expect(createSide).toHaveBeenCalledTimes(2);
    expect(result.current.tabs.map((t) => t.childId)).toEqual(['c1', 'c2']);
  });

  it('discardTab removes one tab; collapse keeps tabs', async () => {
    createSide.mockResolvedValue({ conversation_id: 'c1', fork_mode: 'text_snapshot', created: true });
    const { result } = renderHook(() => useSideConversation({ parent }));
    await act(async () => {
      await result.current.open();
    });
    act(() => result.current.collapse());
    expect(result.current.tabs).toHaveLength(1);
    await act(async () => {
      await result.current.discardTab('c1');
    });
    expect(remove).toHaveBeenCalledWith({ id: 'c1' });
    expect(result.current.tabs).toHaveLength(0);
    expect(result.current.state).toBe('none');
  });

  it('promote clears ephemeral flag on active tab', async () => {
    createSide.mockResolvedValue({ conversation_id: 'c1', fork_mode: 'agent_fork', created: true });
    const { result } = renderHook(() => useSideConversation({ parent }));
    await act(async () => {
      await result.current.open();
    });
    act(() => result.current.markTurn());
    await act(async () => {
      await result.current.promote();
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', merge_extra: true }));
    expect(result.current.state).toBe('promoted');
  });

  it('clears stale side state and reports create errors when parent id is missing', async () => {
    const emptyParent = { ...parent, id: '' } as TChatConversation;
    const { result } = renderHook(() => useSideConversation({ parent: emptyParent, initialChildId: 'stale-child' }));

    await waitFor(() => {
      expect(result.current.tabs).toEqual([]);
    });
    expect(result.current.activeTabId).toBeUndefined();

    await act(async () => {
      await result.current.open();
    });

    expect(createSide).not.toHaveBeenCalled();
    expect(Message.error).toHaveBeenCalledWith('Side conversation requires a parent conversation');
  });

  it('logs restore and parent sync failures without breaking tab creation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    listSide.mockRejectedValue(new Error('list failed'));
    update.mockRejectedValue(new Error('sync failed'));
    createSide.mockResolvedValue({ conversation_id: 'c1', fork_mode: 'text_snapshot', created: true });

    const { result } = renderHook(() => useSideConversation({ parent }));

    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith('[useSideConversation] restore side tabs failed:', expect.any(Error));
    });

    await act(async () => {
      await result.current.open();
    });

    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith('[useSideConversation] syncParentSideState failed:', expect.any(Error));
    });
    expect(result.current.childId).toBe('c1');
  });

  it('hydrates a legacy initial child fork mode from conversation details', async () => {
    get.mockResolvedValue({
      id: 'c1',
      type: 'acp',
      name: 'Side 1',
      created_at: 1,
      modified_at: 1,
      extra: { fork_mode: 'agent_fork', side_mode: true, parent_conversation_id: 'p1' },
    });
    const restoredParent = {
      ...parent,
      extra: { ...parent.extra, side_conversation_id: 'c1', side_panel_hidden: true },
    } as TChatConversation;

    const { result } = renderHook(() => useSideConversation({ parent: restoredParent, initialChildId: 'c1' }));

    await waitFor(() => {
      expect(result.current.tabs[0]?.forkMode).toBe('agent_fork');
    });
    expect(result.current.state).toBe('collapsed');
  });

  it('uses in-memory parent messages for prompted side creation', async () => {
    createSide.mockResolvedValue({ conversation_id: 'c1', fork_mode: 'agent_fork', created: true });
    const { result } = renderHook(() =>
      useSideConversation({
        parent,
        getParentMessages: () => [
          { id: 'older', msg_id: 'older-msg', conversation_id: 'p1', created_at: 1 } as never,
          { id: 'newer', msg_id: 'newer-msg', conversation_id: 'p1', created_at: 2 } as never,
        ],
      })
    );

    await act(async () => {
      await result.current.open('  explain this  ');
    });

    expect(getConversationMessages).not.toHaveBeenCalled();
    expect(createSide).toHaveBeenCalledWith(
      expect.objectContaining({
        initial_prompt: 'explain this',
        forked_at_msg_id: 'newer-msg',
      })
    );
    expect(result.current.tabs[0]).toEqual(
      expect.objectContaining({ childId: 'c1', forkMode: 'agent_fork', hasTurn: true })
    );
    expect(result.current.state).toBe('active');
  });

  it('reopens and selects restored tabs', async () => {
    listSide.mockResolvedValue([
      {
        id: 'c1',
        type: 'acp',
        name: 'Side 1',
        created_at: 1,
        modified_at: 1,
        extra: { fork_mode: 'text_snapshot', side_mode: true, parent_conversation_id: 'p1' },
      },
      {
        id: 'c2',
        type: 'acp',
        name: 'Side 2',
        created_at: 2,
        modified_at: 2,
        extra: { fork_mode: 'agent_fork', side_mode: true, parent_conversation_id: 'p1' },
      },
    ]);
    const restoredParent = {
      ...parent,
      extra: { ...parent.extra, active_side_id: 'c1', side_panel_hidden: true },
    } as TChatConversation;
    const { result } = renderHook(() => useSideConversation({ parent: restoredParent }));

    await waitFor(() => {
      expect(result.current.state).toBe('collapsed');
    });

    act(() => {
      result.current.reopen();
    });
    expect(result.current.activeTabId).toBe('c1');
    expect(result.current.state).toBe('empty');

    act(() => {
      result.current.selectTab('c2');
    });
    expect(result.current.activeTabId).toBe('c2');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'p1',
        updates: expect.objectContaining({
          extra: expect.objectContaining({ active_side_id: 'c2', side_panel_hidden: false }),
        }),
      })
    );
  });

  it('reports remove failures through discard()', async () => {
    createSide.mockResolvedValue({ conversation_id: 'c1', fork_mode: 'text_snapshot', created: true });
    remove.mockRejectedValue(new Error('remove failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useSideConversation({ parent }));
    await act(async () => {
      await result.current.open();
    });

    await act(async () => {
      await result.current.discard();
    });

    expect(warn).toHaveBeenCalledWith('[useSideConversation] discardTab failed:', expect.any(Error));
    expect(Message.error).toHaveBeenCalledWith('remove failed');
    expect(result.current.state).toBe('none');
  });

  it('fills the side composer for new and existing tabs until the fill is handled', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0) as unknown as number
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => window.clearTimeout(id));
    const onFill = vi.fn();
    emitter.on('sendbox.fill.scoped', onFill);
    createSide.mockResolvedValue({ conversation_id: 'c1', fork_mode: 'text_snapshot', created: true });

    const { result, unmount } = renderHook(() => useSideConversation({ parent }));

    await act(async () => {
      await result.current.fillComposer('   ');
    });
    expect(createSide).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.fillComposer('  explain this  ');
    });
    expect(createSide).toHaveBeenCalledTimes(1);
    expect(result.current.activeTabId).toBe('c1');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(onFill).toHaveBeenCalledWith({ conversation_id: 'c1', text: 'explain this' });

    act(() => {
      emitter.emit('sendbox.fill.scoped.handled', { conversation_id: 'c1', text: 'explain this' });
    });
    unmount();
  });

  it('fills an existing side composer without creating another tab', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0) as unknown as number
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => window.clearTimeout(id));
    const onFill = vi.fn();
    emitter.on('sendbox.fill.scoped', onFill);
    createSide.mockResolvedValue({ conversation_id: 'c1', fork_mode: 'text_snapshot', created: true });

    const { result, unmount } = renderHook(() => useSideConversation({ parent }));

    await act(async () => {
      await result.current.open();
    });

    await act(async () => {
      await result.current.fillComposer('follow up');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(createSide).toHaveBeenCalledTimes(1);
    expect(onFill).toHaveBeenLastCalledWith({ conversation_id: 'c1', text: 'follow up' });

    unmount();
  });
});
