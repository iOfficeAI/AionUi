/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    taskCenter: {
      list: {
        invoke: (...args: unknown[]) => listMock(...args),
      },
    },
  },
}));

const { useTaskCenterList } = await import('@/renderer/pages/task-center/useTaskCenterList');

beforeEach(() => {
  listMock.mockReset();
  listMock.mockResolvedValue({ ok: true, data: { total: 0, items: [] } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTaskCenterList', () => {
  it('fetches on mount with token + empty keyword', async () => {
    listMock.mockResolvedValue({
      ok: true,
      data: { total: 1, items: [{ id: 'a', name: 'Task A' }] },
    });

    const { result } = renderHook(() => useTaskCenterList('tok-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listMock).toHaveBeenCalledWith({
      token: 'tok-1',
      filters: { keyword: '' },
      pageNo: 1,
      perPageSize: 30,
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.total).toBe(1);
  });

  it('debounces keyword updates by 300ms', async () => {
    const { result } = renderHook(() => useTaskCenterList('tok'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = listMock.mock.calls.length;

    act(() => result.current.setKeyword('abc'));

    await waitFor(() => expect(result.current.keyword).toBe('abc'));
    expect(listMock.mock.calls.length).toBe(callsBefore);

    await new Promise((r) => setTimeout(r, 350));
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ keyword: 'abc' }) })
    );
  });

  it('returns error message on failed response', async () => {
    listMock.mockResolvedValue({ ok: false, message: 'HTTP 500' });

    const { result } = renderHook(() => useTaskCenterList('tok'));

    await waitFor(() => expect(result.current.error).toBe('HTTP 500'));
    expect(result.current.items).toHaveLength(0);
  });

  it('refetches when reload() is called', async () => {
    const { result } = renderHook(() => useTaskCenterList('tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = listMock.mock.calls.length;

    act(() => result.current.reload());
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('does not fetch when token is empty', () => {
    renderHook(() => useTaskCenterList(''));
    expect(listMock).not.toHaveBeenCalled();
  });

  it('reset() clears keyword', async () => {
    const { result } = renderHook(() => useTaskCenterList('tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setKeyword('foo'));
    act(() => result.current.reset());
    expect(result.current.keyword).toBe('');
  });

  it('loadMore() appends the next page to items', async () => {
    listMock.mockResolvedValueOnce({
      ok: true,
      data: {
        total: 4,
        items: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      },
    });
    listMock.mockResolvedValueOnce({
      ok: true,
      data: {
        total: 4,
        items: [
          { id: 'c', name: 'C' },
          { id: 'd', name: 'D' },
        ],
      },
    });

    const { result } = renderHook(() => useTaskCenterList('tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(2);

    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.items).toHaveLength(4);
    expect(result.current.pageNo).toBe(2);
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.current.pageNo).toBe(2);
  });
});
