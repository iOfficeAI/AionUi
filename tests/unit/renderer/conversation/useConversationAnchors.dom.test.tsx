/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadAllConversationMessagesPaged = vi.fn();

vi.mock('@/renderer/utils/chat/messagePagination', () => ({
  loadAllConversationMessagesPaged: (...args: unknown[]) => loadAllConversationMessagesPaged(...args),
}));

const { useConversationAnchors } =
  await import('@/renderer/pages/conversation/Messages/anchorRail/useConversationAnchors');

/** Builds one user/assistant turn pair. */
const turn = (n: number): TMessage[] =>
  [
    {
      id: `u-${n}`,
      msg_id: `u-${n}`,
      conversation_id: 'c1',
      type: 'text',
      position: 'right',
      created_at: n * 2,
      content: { content: `question ${n}` },
    },
    {
      id: `a-${n}`,
      msg_id: `a-${n}`,
      conversation_id: 'c1',
      type: 'text',
      position: 'left',
      created_at: n * 2 + 1,
      content: { content: `answer ${n}` },
    },
  ] as unknown as TMessage[];

const history = (count: number) => Array.from({ length: count }, (_, i) => turn(i + 1)).flat();

describe('useConversationAnchors', () => {
  beforeEach(() => {
    loadAllConversationMessagesPaged.mockReset();
  });

  it('covers the whole history even when the chat area has only paged in the tail', async () => {
    // The regression this exists for: reopening an old conversation used to show a
    // rail with only the newest page's turns, so earlier ones had no tick at all.
    loadAllConversationMessagesPaged.mockResolvedValue(history(40));
    const paged = history(40).slice(-4); // chat area holds the last 2 turns

    const { result } = renderHook(() => useConversationAnchors('c1', paged));

    await waitFor(() => expect(result.current).toHaveLength(40));
    expect(result.current[0]?.question).toContain('question 1');
    expect(result.current[39]?.question).toContain('question 40');
  });

  it('reads previews rather than whole message bodies', async () => {
    loadAllConversationMessagesPaged.mockResolvedValue(history(3));
    renderHook(() => useConversationAnchors('c1', []));

    await waitFor(() => expect(loadAllConversationMessagesPaged).toHaveBeenCalled());
    expect(loadAllConversationMessagesPaged).toHaveBeenCalledWith('c1', { contentMode: 'compact' });
  });

  it('lets newly sent messages extend the rail without re-reading history', async () => {
    loadAllConversationMessagesPaged.mockResolvedValue(history(5));
    const { result, rerender } = renderHook(({ live }) => useConversationAnchors('c1', live), {
      initialProps: { live: history(5) },
    });

    await waitFor(() => expect(result.current).toHaveLength(5));

    // A new turn arrives in memory; the rail must grow immediately.
    rerender({ live: history(6) });
    await waitFor(() => expect(result.current).toHaveLength(6));
    expect(loadAllConversationMessagesPaged).toHaveBeenCalledTimes(1);
  });

  it('drops the previous conversation ticks when switching', async () => {
    loadAllConversationMessagesPaged.mockImplementation((id: string) =>
      Promise.resolve(id === 'c1' ? history(30) : history(2))
    );

    const { result, rerender } = renderHook(({ id }) => useConversationAnchors(id, []), {
      initialProps: { id: 'c1' },
    });
    await waitFor(() => expect(result.current).toHaveLength(30));

    rerender({ id: 'c2' });
    // Must not keep showing c1's 30 ticks while c2 is open.
    await waitFor(() => expect(result.current).toHaveLength(2));
  });

  it('ignores a slow response that lands after the conversation changed', async () => {
    let resolveFirst: ((messages: TMessage[]) => void) | undefined;
    loadAllConversationMessagesPaged.mockImplementation((id: string) => {
      if (id === 'c1') return new Promise<TMessage[]>((resolve) => (resolveFirst = resolve));
      return Promise.resolve(history(3));
    });

    const { result, rerender } = renderHook(({ id }) => useConversationAnchors(id, []), {
      initialProps: { id: 'c1' },
    });
    rerender({ id: 'c2' });
    await waitFor(() => expect(result.current).toHaveLength(3));

    // c1's request finally resolves — it must not overwrite c2's ticks.
    await act(async () => {
      resolveFirst?.(history(30));
    });
    expect(result.current).toHaveLength(3);
  });

  it('falls back to the in-memory list when the history read fails', async () => {
    loadAllConversationMessagesPaged.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useConversationAnchors('c1', history(2)));

    // Degrades to whatever the chat area has, rather than rendering nothing.
    await waitFor(() => expect(result.current).toHaveLength(2));
  });

  it('renders no ticks without a conversation', () => {
    const { result } = renderHook(() => useConversationAnchors(undefined, []));
    expect(result.current).toEqual([]);
    expect(loadAllConversationMessagesPaged).not.toHaveBeenCalled();
  });
});
