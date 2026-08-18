/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', token: 'test-token' } }),
}));

import { useKnowledgeBaseList } from '@/renderer/hooks/knowledge-base/useKnowledgeBaseList';

const PERSONAL_URL_FRAGMENT = '/project/aiknowledge/aiknowledgebaselist/listJSON.do?mdCode=view_knowledge_user';
const SHARED_URL_FRAGMENT = '/jdbc/common/basecommonlist/listJSON.do?mdCode=share_knowledge_base';

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const personalRow = {
  id: 'p_remote_1',
  name: '工程资料',
  flgPublicDesc: '工程资料库',
  storageBaseDesc: '工程相关',
  fileCount: 5,
  createTime: '2026-08-01',
  shareObject: 'me',
};

const sharedRow = {
  id: 's_remote_1',
  name: 'Shared Doc',
  shareObject: 'team',
  fileCount: 10,
  createTime: '2026-08-02',
};

const stubFetch = (impl: (url: string) => Promise<Response>) => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => impl(String(input)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('useKnowledgeBaseList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches both personal and shared lists with the AIPaaS token', async () => {
    const fetchMock = stubFetch(async (url) => {
      if (url.includes(PERSONAL_URL_FRAGMENT)) return jsonResponse({ Rows: [personalRow] });
      if (url.includes(SHARED_URL_FRAGMENT)) return jsonResponse({ Rows: [sharedRow] });
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { result } = renderHook(() => useKnowledgeBaseList());

    await waitFor(() => {
      expect(result.current.personalItems).toHaveLength(1);
      expect(result.current.sharedItems).toHaveLength(1);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(calls.some((u) => u.includes(PERSONAL_URL_FRAGMENT))).toBe(true);
    expect(calls.some((u) => u.includes(SHARED_URL_FRAGMENT))).toBe(true);

    for (const [arg, options] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(arg).toMatch(/^https?:\/\//);
      expect(options.headers).toMatchObject({ Token: 'test-token' });
    }
  });

  it('maps personal rows with isShared=false and source=user', async () => {
    stubFetch(async (url) => {
      if (url.includes(PERSONAL_URL_FRAGMENT)) return jsonResponse({ Rows: [personalRow] });
      if (url.includes(SHARED_URL_FRAGMENT)) return jsonResponse({ Rows: [] });
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { result } = renderHook(() => useKnowledgeBaseList());

    await waitFor(() => expect(result.current.personalItems).toHaveLength(1));

    const item = result.current.personalItems[0];
    expect(item).toMatchObject({
      id: 'p_remote_1',
      name: '工程资料',
      description: '工程资料库',
      owner: 'me',
      documentCount: 5,
      createdAt: '2026-08-01',
      isShared: false,
      source: 'user',
    });
  });

  it('keeps shared rows mapped with isShared=true and source=builtin', async () => {
    stubFetch(async (url) => {
      if (url.includes(PERSONAL_URL_FRAGMENT)) return jsonResponse({ Rows: [] });
      if (url.includes(SHARED_URL_FRAGMENT)) return jsonResponse({ Rows: [sharedRow] });
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { result } = renderHook(() => useKnowledgeBaseList());

    await waitFor(() => expect(result.current.sharedItems).toHaveLength(1));

    const item = result.current.sharedItems[0];
    expect(item).toMatchObject({
      id: 's_remote_1',
      name: 'Shared Doc',
      isShared: true,
      source: 'builtin',
      owner: 'team',
      documentCount: 10,
    });
  });

  it('clears personal items when personal fetch fails (no fallback)', async () => {
    stubFetch(async (url) => {
      if (url.includes(PERSONAL_URL_FRAGMENT)) throw new Error('network down');
      if (url.includes(SHARED_URL_FRAGMENT)) return jsonResponse({ Rows: [sharedRow] });
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { result } = renderHook(() => useKnowledgeBaseList());

    await waitFor(() => expect(result.current.sharedItems).toHaveLength(1));
    expect(result.current.personalItems).toEqual([]);
    expect(result.current.personalError).toBe('network down');
  });

  it('treats missing Rows as empty list', async () => {
    stubFetch(async (url) => {
      if (url.includes(PERSONAL_URL_FRAGMENT)) return jsonResponse({});
      if (url.includes(SHARED_URL_FRAGMENT)) return jsonResponse({ Rows: [sharedRow] });
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { result } = renderHook(() => useKnowledgeBaseList());

    await waitFor(() => expect(result.current.sharedItems).toHaveLength(1));
    expect(result.current.personalItems).toEqual([]);
    expect(result.current.personalError).toBeNull();
  });

  it('runs personal and shared fetches concurrently (Promise.all)', async () => {
    const callOrder: string[] = [];
    let resolvePersonal!: (r: Response) => void;
    let resolveShared!: (r: Response) => void;

    stubFetch(async (url) => {
      if (url.includes(PERSONAL_URL_FRAGMENT)) {
        callOrder.push('personal:start');
        return new Promise<Response>((resolve) => {
          resolvePersonal = (r) => {
            callOrder.push('personal:end');
            resolve(r);
          };
        });
      }
      if (url.includes(SHARED_URL_FRAGMENT)) {
        callOrder.push('shared:start');
        return new Promise<Response>((resolve) => {
          resolveShared = (r) => {
            callOrder.push('shared:end');
            resolve(r);
          };
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { result } = renderHook(() => useKnowledgeBaseList());

    await waitFor(() => {
      expect(callOrder).toEqual(['personal:start', 'shared:start']);
    });

    await act(async () => {
      resolvePersonal(jsonResponse({ Rows: [personalRow] }));
      resolveShared(jsonResponse({ Rows: [sharedRow] }));
    });

    await waitFor(() => {
      expect(result.current.personalItems).toHaveLength(1);
      expect(result.current.sharedItems).toHaveLength(1);
    });

    expect(callOrder).toEqual(['personal:start', 'shared:start', 'personal:end', 'shared:end']);
  });

  it('loadKnowledgeBases refreshes both lists on demand', async () => {
    let personalCallCount = 0;
    stubFetch(async (url) => {
      if (url.includes(PERSONAL_URL_FRAGMENT)) {
        personalCallCount += 1;
        return jsonResponse({ Rows: [{ ...personalRow, id: `p_${personalCallCount}` }] });
      }
      if (url.includes(SHARED_URL_FRAGMENT)) return jsonResponse({ Rows: [sharedRow] });
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { result } = renderHook(() => useKnowledgeBaseList());

    await waitFor(() => expect(result.current.personalItems[0]?.id).toBe('p_1'));

    await act(async () => {
      await result.current.loadKnowledgeBases();
    });

    await waitFor(() => expect(result.current.personalItems[0]?.id).toBe('p_2'));
    expect(personalCallCount).toBe(2);
  });

  it('loadPersonalKnowledgeBases fetches only the personal endpoint', async () => {
    let personalCallCount = 0;
    let sharedCallCount = 0;
    stubFetch(async (url) => {
      if (url.includes(PERSONAL_URL_FRAGMENT)) {
        personalCallCount += 1;
        return jsonResponse({ Rows: [{ ...personalRow, id: `p_${personalCallCount}` }] });
      }
      if (url.includes(SHARED_URL_FRAGMENT)) {
        sharedCallCount += 1;
        return jsonResponse({ Rows: [sharedRow] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { result } = renderHook(() => useKnowledgeBaseList());

    await waitFor(() => expect(result.current.personalItems[0]?.id).toBe('p_1'));
    const sharedCountAfterMount = sharedCallCount;

    await act(async () => {
      await result.current.loadPersonalKnowledgeBases('test-token');
    });

    await waitFor(() => expect(result.current.personalItems[0]?.id).toBe('p_2'));
    expect(personalCallCount).toBe(2);
    expect(sharedCallCount).toBe(sharedCountAfterMount);
  });

  it('loadSharedKnowledgeBases fetches only the shared endpoint', async () => {
    let sharedCallCount = 0;
    let personalCallCount = 0;
    stubFetch(async (url) => {
      if (url.includes(SHARED_URL_FRAGMENT)) {
        sharedCallCount += 1;
        return jsonResponse({ Rows: [{ ...sharedRow, id: `s_${sharedCallCount}` }] });
      }
      if (url.includes(PERSONAL_URL_FRAGMENT)) {
        personalCallCount += 1;
        return jsonResponse({ Rows: [personalRow] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { result } = renderHook(() => useKnowledgeBaseList());

    await waitFor(() => expect(result.current.sharedItems[0]?.id).toBe('s_1'));
    const personalCountAfterMount = personalCallCount;

    await act(async () => {
      await result.current.loadSharedKnowledgeBases('test-token');
    });

    await waitFor(() => expect(result.current.sharedItems[0]?.id).toBe('s_2'));
    expect(sharedCallCount).toBe(2);
    expect(personalCallCount).toBe(personalCountAfterMount);
  });
});
