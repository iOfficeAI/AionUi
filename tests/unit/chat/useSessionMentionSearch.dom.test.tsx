/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();

vi.mock('@/common/adapter/ipcBridge', () => ({
  sessionMention: { list: { invoke: (...args: unknown[]) => list(...args) } },
}));

// Imported after the mock so the hook picks up the stubbed bridge.
const { useSessionMentionSearch } = await import('@/renderer/hooks/chat/useSessionMentionSearch');

describe('useSessionMentionSearch', () => {
  beforeEach(() => {
    list.mockReset();
    list.mockResolvedValue({ items: [{ id: 'c1', name: 'auth', modified_at: 1 }] });
  });

  it('does not call the endpoint while disabled', async () => {
    renderHook(() => useSessionMentionSearch({ query: 'a', conversationId: 'c0', enabled: false }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(list).not.toHaveBeenCalled();
  });

  it('fetches once enabled and exposes the items', async () => {
    const { result } = renderHook(() => useSessionMentionSearch({ query: 'a', conversationId: 'c0', enabled: true }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ q: 'a', current_conversation_id: 'c0' }));
  });

  it('excludes the current conversation by passing it to the endpoint', async () => {
    // The hard filter lives server-side, so the only thing the client must get
    // right is naming the conversation the picker is open in.
    const { result } = renderHook(() =>
      useSessionMentionSearch({ query: '', conversationId: 'conv_here', enabled: true })
    );
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ current_conversation_id: 'conv_here' }));
    expect(result.current.items).toBeDefined();
  });

  it('debounces rapid query changes into a single request', async () => {
    const { rerender } = renderHook(
      (props: { query: string }) =>
        useSessionMentionSearch({ query: props.query, conversationId: 'c0', enabled: true }),
      {
        initialProps: { query: 'a' },
      }
    );
    rerender({ query: 'au' });
    rerender({ query: 'aut' });
    rerender({ query: 'auth' });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ q: 'auth' }));
  });

  it('surfaces a failure as empty items rather than throwing', async () => {
    list.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSessionMentionSearch({ query: 'a', conversationId: 'c0', enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
  });

  it('clears the items when it becomes disabled', async () => {
    const { result, rerender } = renderHook(
      (props: { enabled: boolean }) =>
        useSessionMentionSearch({ query: 'a', conversationId: 'c0', enabled: props.enabled }),
      {
        initialProps: { enabled: true },
      }
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    rerender({ enabled: false });
    await waitFor(() => expect(result.current.items).toEqual([]));
  });

  it('reports hasMore only when the endpoint returned a cursor', async () => {
    list.mockResolvedValue({ items: [{ id: 'c1', name: 'auth', modified_at: 1 }], next_cursor: 'cur1' });
    const { result } = renderHook(() => useSessionMentionSearch({ query: 'a', conversationId: 'c0', enabled: true }));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
  });

  it('drops a page that lands after the query moved on', async () => {
    // The picker pages on scroll, so a slow second page can land after the user
    // has typed another character. Appending it would splice results for the old
    // query onto the new list.
    list.mockResolvedValueOnce({ items: [{ id: 'c1', name: 'auth', modified_at: 2 }], next_cursor: 'cur1' });
    const { result, rerender } = renderHook(
      (props: { query: string }) =>
        useSessionMentionSearch({ query: props.query, conversationId: 'c0', enabled: true }),
      { initialProps: { query: 'auth' } }
    );
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    // Assigned synchronously by the Promise executor below.
    let releaseStalePage!: (value: unknown) => void;
    list.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseStalePage = resolve;
      })
    );
    result.current.loadMore();

    // The query changes while that page is still in flight.
    list.mockResolvedValue({ items: [{ id: 'c9', name: 'docs', modified_at: 1 }] });
    rerender({ query: 'docs' });
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(['c9']));

    releaseStalePage({ items: [{ id: 'c2', name: 'auth-2', modified_at: 1 }], next_cursor: 'cur2' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.items.map((item) => item.id)).toEqual(['c9']);
  });

  it('appends the next page instead of replacing the current one', async () => {
    list.mockResolvedValueOnce({ items: [{ id: 'c1', name: 'auth', modified_at: 2 }], next_cursor: 'cur1' });
    const { result } = renderHook(() => useSessionMentionSearch({ query: 'a', conversationId: 'c0', enabled: true }));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    list.mockResolvedValueOnce({ items: [{ id: 'c2', name: 'docs', modified_at: 1 }] });
    result.current.loadMore();
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.items.map((item) => item.id)).toEqual(['c1', 'c2']);
    expect(result.current.hasMore).toBe(false);
  });
});
