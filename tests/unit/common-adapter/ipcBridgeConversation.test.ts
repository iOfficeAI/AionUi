/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type HttpCall = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
};

const httpBridgeMocks = vi.hoisted(() => {
  const calls: HttpCall[] = [];
  const provider =
    (method: HttpCall['method']) =>
    <Data, Params = undefined>(path: string | ((params: Params) => string), mapBody?: (params: Params) => unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async (params?: Params) => {
        const resolvedPath = typeof path === 'function' ? path(params as Params) : path;
        calls.push({
          method,
          path: resolvedPath,
          body: mapBody && params !== undefined ? mapBody(params as Params) : undefined,
        });
        return true as Data;
      }),
    });
  const emitter = () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() });

  return {
    calls,
    httpGet: provider('GET'),
    httpPost: provider('POST'),
    httpPut: provider('PUT'),
    httpPatch: provider('PATCH'),
    httpDelete: provider('DELETE'),
    httpRequest: vi.fn(),
    stubProvider: vi.fn((name: string, defaultValue: unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async () => defaultValue),
    })),
    withResponseMap: vi.fn(
      (
        inner: { provider: unknown; invoke: (params?: unknown) => Promise<unknown> },
        map: (raw: unknown) => unknown
      ) => ({
        provider: inner.provider,
        invoke: vi.fn(async (params?: unknown) => map(await inner.invoke(params))),
      })
    ),
    wsEmitter: vi.fn(emitter),
    wsMappedEmitter: vi.fn(emitter),
    stubEmitter: vi.fn(emitter),
  };
});

vi.mock('@/common/adapter/httpBridge', () => httpBridgeMocks);

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({
      provider: vi.fn(),
      invoke: vi.fn(),
    })),
    buildEmitter: vi.fn(() => ({
      on: vi.fn(() => vi.fn()),
      emit: vi.fn(),
    })),
  },
}));

describe('ipcBridge conversation adapter', () => {
  beforeEach(() => {
    httpBridgeMocks.calls.length = 0;
  });

  it('deletes conversations through the standard conversation endpoint', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');

    await conversation.remove.invoke({ id: 'conv-1' });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'DELETE',
      path: '/api/conversations/conv-1',
      body: undefined,
    });
  });

  // Not formality: when the body mapping drops `sessions`, NEITHER side errors.
  // The user picks a target with `@@`, the message sends fine, and the agent
  // simply never sees the session block — the most likely silent failure in the
  // whole feature.
  it('puts `@@` session references on the wire', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');

    await conversation.sendMessage.invoke({
      input: 'ask them',
      conversation_id: 'conv-1',
      sessions: [{ id: 'conv-target' }],
    });

    const call = httpBridgeMocks.calls.find((entry) => entry.path === '/api/conversations/conv-1/messages');
    expect(call).toBeDefined();
    expect(call?.body).toMatchObject({ content: 'ask them', sessions: [{ id: 'conv-target' }] });
  });

  it('omits `sessions` entirely when the user referenced nothing', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');

    await conversation.sendMessage.invoke({ input: 'plain', conversation_id: 'conv-2' });

    const call = httpBridgeMocks.calls.find((entry) => entry.path === '/api/conversations/conv-2/messages');
    expect(call).toBeDefined();
    expect((call?.body as { sessions?: unknown } | undefined)?.sessions).toBeUndefined();
  });

  it('reads the cross-session master switch off the typed settings endpoint, not the client KV', async () => {
    // Channel matters: this switch is a typed column (migration 040), so it must
    // NOT go through `/api/settings/client`.
    const { systemSettings } = await import('@/common/adapter/ipcBridge');

    await systemSettings.setCrossSessionMessageEnabled.invoke({ enabled: false });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'PATCH',
      path: '/api/settings',
      body: { cross_session_message_enabled: false },
    });
  });

  it('builds the mentionable query with the current conversation excluded', async () => {
    const { sessionMention } = await import('@/common/adapter/ipcBridge');

    await sessionMention.list.invoke({ current_conversation_id: 'conv-here', q: 'auth', limit: 20 });

    const call = httpBridgeMocks.calls.find((entry) => entry.path.startsWith('/api/session-messages/mentionable'));
    expect(call?.path).toContain('current_conversation_id=conv-here');
    expect(call?.path).toContain('q=auth');
    expect(call?.path).toContain('limit=20');
  });
});
