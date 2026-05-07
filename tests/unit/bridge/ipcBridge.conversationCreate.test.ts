/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BASE_URL = 'http://127.0.0.1:13400';

type FetchArgs = { url: string; method: string; body: unknown };

function lastFetchCall(mock: ReturnType<typeof vi.fn>): FetchArgs {
  expect(mock).toHaveBeenCalledTimes(1);
  const [url, init] = mock.mock.calls[0] as [string, RequestInit];
  return {
    url,
    method: (init?.method ?? 'GET').toUpperCase(),
    body: init?.body ? JSON.parse(init.body as string) : undefined,
  };
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('ipcBridge.conversation.create — wire-level contract', () => {
  it('omits placeholder model objects from create requests', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        success: true,
        data: {
          id: 'conv-1',
          type: 'acp',
          created_at: 1,
          modified_at: 1,
          name: 'New Conversation',
          extra: { workspace: '/tmp/ws', is_temporary_workspace: false },
        },
      })
    );

    const { conversation } = await import('@/common/adapter/ipcBridge');
    await conversation.create.invoke({
      type: 'acp',
      name: 'New Conversation',
      model: {} as never,
      extra: {
        workspace: '/tmp/ws',
        custom_workspace: true,
        backend: 'claude',
      },
    });

    const call = lastFetchCall(fetchMock);
    expect(call.url).toBe(`${BASE_URL}/api/conversations`);
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({
      type: 'acp',
      id: undefined,
      name: 'New Conversation',
      extra: {
        workspace: '/tmp/ws',
        custom_workspace: true,
        backend: 'claude',
      },
    });
    expect(call.body).not.toHaveProperty('model');
  });

  it('serializes complete models when they are present', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        success: true,
        data: {
          id: 'conv-2',
          type: 'aionrs',
          created_at: 1,
          modified_at: 1,
          name: 'Aionrs',
          model: { provider_id: 'p1', model: 'gpt-4.1-mini' },
          extra: { workspace: '/tmp/ws2', is_temporary_workspace: false },
        },
      })
    );

    const { conversation } = await import('@/common/adapter/ipcBridge');
    await conversation.create.invoke({
      type: 'aionrs',
      name: 'Aionrs',
      model: {
        id: 'p1',
        platform: 'openai',
        name: 'OpenAI',
        base_url: 'https://api.openai.com',
        api_key: 'sk-test',
        use_model: 'gpt-4.1-mini',
      },
      extra: {
        workspace: '/tmp/ws2',
        custom_workspace: true,
      },
    });

    const call = lastFetchCall(fetchMock);
    expect(call.body).toEqual({
      type: 'aionrs',
      id: undefined,
      name: 'Aionrs',
      model: {
        provider_id: 'p1',
        model: 'gpt-4.1-mini',
      },
      extra: {
        workspace: '/tmp/ws2',
        custom_workspace: true,
      },
    });
  });
});
