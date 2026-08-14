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
        const body = method === 'GET' || method === 'DELETE' ? undefined : mapBody ? mapBody(params as Params) : params;
        calls.push({ method, path: resolvedPath, body });
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
    stubProvider: vi.fn((_name: string, defaultValue: unknown) => ({
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
    buildProvider: vi.fn(() => ({ provider: vi.fn(), invoke: vi.fn() })),
    buildEmitter: vi.fn(() => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() })),
  },
}));

describe('account HTTP adapter contract', () => {
  beforeEach(() => {
    httpBridgeMocks.calls.length = 0;
  });

  it('changes the current user password without sending a user id', async () => {
    const { authAccount } = await import('@/common/adapter/ipcBridge');

    await authAccount.changePassword.invoke({ current_password: 'old-secret', new_password: 'new-secret' });

    expect(httpBridgeMocks.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/api/auth/change-password',
      body: { current_password: 'old-secret', new_password: 'new-secret' },
    });
  });

  it('maps user edits to field-scoped PATCH endpoints', async () => {
    const { adminUsers } = await import('@/common/adapter/ipcBridge');

    await adminUsers.updateUsername.invoke({ id: 'user/1', username: 'renamed' });
    await adminUsers.updateRole.invoke({ id: 'user/1', role: 'admin' });
    await adminUsers.updateStatus.invoke({ id: 'user/1', status: 'disabled' });

    expect(httpBridgeMocks.calls).toEqual([
      { method: 'PATCH', path: '/api/admin/users/user%2F1/username', body: { username: 'renamed' } },
      { method: 'PATCH', path: '/api/admin/users/user%2F1/role', body: { role: 'admin' } },
      { method: 'PATCH', path: '/api/admin/users/user%2F1/status', body: { status: 'disabled' } },
    ]);
  });

  it('uses explicit endpoints for password reset and session revocation', async () => {
    const { adminUsers } = await import('@/common/adapter/ipcBridge');

    await adminUsers.resetPassword.invoke({ id: 'member-1' });
    await adminUsers.revokeSessions.invoke({ id: 'member-1' });

    expect(httpBridgeMocks.calls).toEqual([
      { method: 'POST', path: '/api/admin/users/member-1/reset-password', body: undefined },
      { method: 'POST', path: '/api/admin/users/member-1/sessions/revoke', body: undefined },
    ]);
  });

  it('encodes the opaque audit cursor and limit', async () => {
    const { adminAudit } = await import('@/common/adapter/ipcBridge');

    await adminAudit.list.invoke({ cursor: 'next/id+value', limit: 50 });

    expect(httpBridgeMocks.calls.at(-1)).toEqual({
      method: 'GET',
      path: '/api/admin/audit?cursor=next%2Fid%2Bvalue&limit=50',
      body: undefined,
    });
  });
});
