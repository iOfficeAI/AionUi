/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';

type RouteHandler = (ctx: {
  params: Record<string, string>;
  body: unknown;
  path: string;
}) => unknown | Promise<unknown>;

const mockBridge = vi.hoisted(() => {
  type Route = { method: string; pattern: string; handler: RouteHandler };
  const routes: Route[] = [];
  const calls: Array<{ method: string; path: string; body: unknown }> = [];

  const matchRoute = (pattern: string, path: string): Record<string, string> | null => {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');
    if (patternParts.length !== pathParts.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < patternParts.length; i += 1) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];
      if (patternPart.startsWith(':')) {
        params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      } else if (patternPart !== pathPart) {
        return null;
      }
    }
    return params;
  };

  const createFactory =
    (method: string) => (pathOrFn: string | ((params: never) => string), mapBody?: (params: never) => unknown) => ({
      provider: () => {},
      invoke: async (params?: never) => {
        const path = typeof pathOrFn === 'function' ? pathOrFn(params as never) : pathOrFn;
        const body = mapBody && params !== undefined ? mapBody(params as never) : method === 'GET' ? undefined : params;
        calls.push({ method, path, body });
        const route = routes.find((candidate) => candidate.method === method && matchRoute(candidate.pattern, path));
        if (!route) throw new Error(`unexpected ${method} ${path}`);
        return route.handler({ params: matchRoute(route.pattern, path) ?? {}, body, path });
      },
    });

  return {
    calls,
    reset: () => {
      routes.length = 0;
      calls.length = 0;
    },
    onGet: (pattern: string, handler: RouteHandler) => routes.push({ method: 'GET', pattern, handler }),
    onPost: (pattern: string, handler: RouteHandler) => routes.push({ method: 'POST', pattern, handler }),
    module: {
      httpGet: createFactory('GET'),
      httpPost: createFactory('POST'),
      httpPut: createFactory('PUT'),
      httpPatch: createFactory('PATCH'),
      httpDelete: createFactory('DELETE'),
      httpRequest: vi.fn(),
      stubProvider: vi.fn((name: string, value: unknown) => ({ provider: () => {}, invoke: async () => value })),
      withResponseMap: (inner: { invoke: (params?: never) => Promise<unknown> }, map: (value: never) => unknown) => ({
        provider: () => {},
        invoke: async (params?: never) => map((await inner.invoke(params)) as never),
      }),
      wsEmitter: () => ({ on: () => () => {}, emit: () => {} }),
      wsMappedEmitter: () => ({ on: () => () => {}, emit: () => {} }),
      stubEmitter: () => ({ on: () => () => {}, emit: () => {} }),
    },
  };
});

vi.mock('@/common/adapter/httpBridge', () => mockBridge.module);

import { conversation as conversationBridge } from '@/common/adapter/ipcBridge';

function parentConversation(): TChatConversation {
  return {
    id: 'parent-1',
    type: 'acp',
    name: 'Parent',
    created_at: 1,
    modified_at: 1,
    model: { id: 'm', platform: 'openai', name: 'gpt', base_url: '', api_key: '', use_model: 'gpt' },
    extra: { backend: 'codex', workspace: '/w' },
  } as TChatConversation;
}

describe('ipcBridge side conversation routes', () => {
  it('maps createSide to the side conversation endpoint and payload', async () => {
    mockBridge.reset();
    mockBridge.onPost('/api/conversations/:parentId/side', ({ params, body }) => {
      expect(params.parentId).toBe('parent-1');
      expect(body).toEqual({
        guardrail: 'reference_readonly',
        initial_prompt: 'Explain this',
        forked_at_msg_id: 'msg-1',
      });
      return { conversation_id: 'child-1', fork_mode: 'text_snapshot', created: true };
    });

    await expect(
      conversationBridge.createSide.invoke({
        parent: parentConversation(),
        forked_at_msg_id: 'msg-1',
        initial_prompt: 'Explain this',
      })
    ).resolves.toEqual({ conversation_id: 'child-1', fork_mode: 'text_snapshot', created: true });
    expect(mockBridge.calls[0]).toMatchObject({ method: 'POST', path: '/api/conversations/parent-1/side' });
  });

  it('maps listSide and converts API conversations back to storage shape', async () => {
    mockBridge.reset();
    mockBridge.onGet('/api/conversations/:parentId/side', ({ params }) => {
      expect(params.parentId).toBe('parent-1');
      return [
        {
          id: 'child-1',
          type: 'acp',
          name: 'Child',
          created_at: 1,
          modified_at: 2,
          model: { provider_id: 'model-1', model: 'gpt' },
          extra: { side_mode: true, parent_conversation_id: 'parent-1' },
        },
      ];
    });

    const result = await conversationBridge.listSide.invoke({ parent_id: 'parent-1' });

    expect(result[0]).toMatchObject({
      id: 'child-1',
      created_at: 1,
      modified_at: 2,
      model: { id: 'model-1', use_model: 'gpt' },
      extra: { side_mode: true, parent_conversation_id: 'parent-1' },
    });
    expect(mockBridge.calls[0]).toMatchObject({ method: 'GET', path: '/api/conversations/parent-1/side' });
  });
});
