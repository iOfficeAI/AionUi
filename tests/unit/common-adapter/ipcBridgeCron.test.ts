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
        return {} as Data;
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

describe('ipcBridge cron adapter', () => {
  beforeEach(() => {
    httpBridgeMocks.calls.length = 0;
  });

  it('updateJob maps an agent payload to the message field without shell keys', async () => {
    const { cron } = await import('@/common/adapter/ipcBridge');

    await cron.updateJob.invoke({
      job_id: 'cron-1',
      updates: {
        name: 'Renamed',
        target: {
          payload: { kind: 'message', text: 'do the thing' },
          execution_mode: 'new_conversation',
        },
      },
    });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'PUT',
      path: '/api/cron/jobs/cron-1',
      body: {
        name: 'Renamed',
        message: 'do the thing',
        execution_mode: 'new_conversation',
        shell_workspace: undefined,
        shell_timeout_ms: undefined,
      },
    });
  });

  it('updateJob maps a shell payload to the native shell fields', async () => {
    const { cron } = await import('@/common/adapter/ipcBridge');

    await cron.updateJob.invoke({
      job_id: 'cron-2',
      updates: {
        target: {
          payload: {
            kind: 'shell',
            command: 'git fetch --all --prune',
            workspace: '/tmp/forks',
            timeout_ms: 600_000,
          },
          execution_mode: 'existing',
        },
      },
    });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'PUT',
      path: '/api/cron/jobs/cron-2',
      body: {
        message: 'git fetch --all --prune',
        execution_mode: 'existing',
        shell_workspace: '/tmp/forks',
        shell_timeout_ms: 600_000,
      },
    });
  });

  it('updateJob sends an empty shell_workspace to clear the override', async () => {
    const { cron } = await import('@/common/adapter/ipcBridge');

    await cron.updateJob.invoke({
      job_id: 'cron-3',
      updates: {
        target: {
          payload: { kind: 'shell', command: 'echo hi' },
          execution_mode: 'existing',
        },
      },
    });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'PUT',
      path: '/api/cron/jobs/cron-3',
      body: {
        message: 'echo hi',
        execution_mode: 'existing',
        shell_workspace: '',
        shell_timeout_ms: undefined,
      },
    });
  });

  it('addJob posts to /api/cron/jobs and listJobsByConversation scopes the query', async () => {
    const { cron } = await import('@/common/adapter/ipcBridge');

    await cron.addJob.invoke({
      name: 'Mirror repos',
      schedule: { kind: 'cron', expr: '0 9 * * *', tz: 'Asia/Shanghai', description: 'daily' },
      message: 'gh repo fork owner/repo --clone',
      conversation_id: 'conv-1',
      created_by: 'user',
      action: 'shell',
      shell_workspace: '/Users/me/forks',
      shell_timeout_ms: 600_000,
    });
    await cron.listJobsByConversation.invoke({ conversation_id: 'conv 1' });

    // addJob has no request mapper — httpBridge serializes the params as-is.
    expect(httpBridgeMocks.calls[0]).toMatchObject({ method: 'POST', path: '/api/cron/jobs' });
    expect(httpBridgeMocks.calls[1]).toMatchObject({
      method: 'GET',
      path: '/api/cron/jobs?conversation_id=conv%201',
    });
  });
});
