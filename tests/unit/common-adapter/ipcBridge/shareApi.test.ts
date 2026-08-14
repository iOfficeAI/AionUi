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
  let nextResponse: unknown = {};
  const provider =
    (method: HttpCall['method']) =>
    <Data, Params = undefined>(path: string | ((params: Params) => string), mapBody?: (params: Params) => unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async (params?: Params) => {
        const resolvedPath = typeof path === 'function' ? path(params as Params) : path;
        const body = method === 'GET' || method === 'DELETE' ? undefined : mapBody ? mapBody(params as Params) : params;
        calls.push({ method, path: resolvedPath, body });
        return nextResponse as Data;
      }),
    });
  const emitter = () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() });
  return {
    calls,
    setNextResponse(value: unknown) {
      nextResponse = value;
    },
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

const sampleShare = {
  id: 'share-1',
  resource_type: 'conversation',
  resource_id: 'conv/1',
  resource_name: 'Planning',
  permission: 'view',
  owner_user_id: 'u1',
  owner_username: 'alice',
  grantee_user_id: 'u2',
  grantee_username: 'bob',
  created_at: 1_700_000_000,
};

describe('share HTTP adapter contract', () => {
  beforeEach(() => {
    httpBridgeMocks.calls.length = 0;
    httpBridgeMocks.setNextResponse({});
    vi.resetModules();
  });

  it('creates a share with the resource grant body', async () => {
    httpBridgeMocks.setNextResponse(sampleShare);
    const { shares } = await import('@/common/adapter/ipcBridge');

    const created = await shares.create.invoke({
      resource_type: 'conversation',
      resource_id: 'conv/1',
      grantee_username: 'bob',
      permission: 'edit',
    });

    expect(httpBridgeMocks.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/api/shares',
      body: {
        resource_type: 'conversation',
        resource_id: 'conv/1',
        grantee_username: 'bob',
        permission: 'edit',
      },
    });
    expect(created).toMatchObject({ id: 'share-1', permission: 'view', grantee_username: 'bob' });
  });

  it('revokes a share by encoded id', async () => {
    const { shares } = await import('@/common/adapter/ipcBridge');

    await shares.revoke.invoke({ id: 'share/with spaces' });

    expect(httpBridgeMocks.calls.at(-1)).toEqual({
      method: 'DELETE',
      path: '/api/shares/share%2Fwith%20spaces',
      body: undefined,
    });
  });

  it('lists shares for a resource with query encoding', async () => {
    httpBridgeMocks.setNextResponse({ items: [sampleShare] });
    const { shares } = await import('@/common/adapter/ipcBridge');

    const page = await shares.listForResource.invoke({
      resource_type: 'project',
      resource_id: 'proj/a+b',
    });

    expect(httpBridgeMocks.calls.at(-1)).toEqual({
      method: 'GET',
      path: '/api/shares?resource_type=project&resource_id=proj%2Fa%2Bb',
      body: undefined,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.resource_type).toBe('conversation');
  });

  it('lists received and granted shares', async () => {
    httpBridgeMocks.setNextResponse([sampleShare]);
    const { shares } = await import('@/common/adapter/ipcBridge');

    const received = await shares.listReceived.invoke();
    const granted = await shares.listGranted.invoke();

    expect(httpBridgeMocks.calls).toEqual([
      { method: 'GET', path: '/api/shares/received', body: undefined },
      { method: 'GET', path: '/api/shares/granted', body: undefined },
    ]);
    expect(received.items[0]?.id).toBe('share-1');
    expect(granted.items[0]?.id).toBe('share-1');
  });

  it('loads the user directory for the picker', async () => {
    httpBridgeMocks.setNextResponse({ users: [{ id: 'u2', username: 'bob' }] });
    const { userDirectory } = await import('@/common/adapter/ipcBridge');

    const directory = await userDirectory.list.invoke();

    expect(httpBridgeMocks.calls.at(-1)).toEqual({
      method: 'GET',
      path: '/api/users/directory',
      body: undefined,
    });
    expect(directory.items).toEqual([{ id: 'u2', username: 'bob' }]);
  });

  it('rejects an invalid create response instead of returning partial data', async () => {
    httpBridgeMocks.setNextResponse({ id: 'broken' });
    const { shares } = await import('@/common/adapter/ipcBridge');

    await expect(
      shares.create.invoke({
        resource_type: 'provider',
        resource_id: 'p1',
        grantee_username: 'bob',
        permission: 'view',
      })
    ).rejects.toThrow('Invalid share response');
  });
});
