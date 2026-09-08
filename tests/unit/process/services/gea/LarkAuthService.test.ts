/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureSharedPersonalModelGateway,
  createSharedWebHostLarkAuth,
  ElectronLarkAuthSessionStore,
  ensureSharedPersonalModels,
  getSharedLarkAuthService,
  initializeSharedPersonalModelGateway,
  LarkAuthService,
  LarkAuthServiceError,
  type LarkAuthSafeStorageAdapter,
  pollSharedLarkAuthSession,
  resetSharedLarkAuthServiceForTests,
  resolveDesktopLarkAuthStatus,
  resolveLarkAuthSessionFileName,
  syncSharedGeaSessionToBackend,
} from '@/process/services/gea/LarkAuthService';
import { initializeGeaEnvironment, resetGeaEnvironmentForTests } from '@/process/services/gea/GeaEnvironmentService';

const httpRequestMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/common/adapter/httpBridge', () => ({
  httpRequest: httpRequestMock,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function verifiedUserInfoResponse(loginTenantId: string): unknown {
  return {
    success: true,
    result: { userInfo: { id: '10086', username: 'zhangsan', realname: '张三', loginTenantId } },
  };
}

const xor = (value: Buffer): Buffer => Buffer.from(value.map((byte) => byte ^ 0xa5));
const listen = (server: Server): Promise<void> =>
  new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const close = (server: Server): Promise<void> => new Promise<void>((resolve) => server.close(() => resolve()));

beforeEach(() => {
  delete process.env.AIONUI_GEA_BASE_URL;
  delete process.env.AUTH_BROKER_PUBLIC_URL;
  resetGeaEnvironmentForTests();
  initializeGeaEnvironment({ isPackaged: false });
  resetSharedLarkAuthServiceForTests();
  httpRequestMock.mockClear();
  httpRequestMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('LarkAuthService', () => {
  it('reads only role-granted sales-plan permission codes without exposing credentials or allAuth', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/sys/user/getUserInfo')) return jsonResponse(verifiedUserInfoResponse('1001'));
      expect(String(input)).toBe('https://gea.example/gea-boot/sys/permission/getUserPermissionByToken');
      expect(init?.headers).toMatchObject({ 'X-Access-Token': 'private-token', 'X-Tenant-Id': '1001' });
      return jsonResponse({
        success: true,
        result: {
          codeList: ['sales-plan:plan:category-approve', 'sys:user:edit', 'sales-plan:plan:category-approve'],
          allAuth: [{ action: 'sales-plan:plan:approve' }],
        },
      });
    });
    const service = new LarkAuthService({ baseUrl: 'https://gea.example/gea-boot', fetchImpl });
    await service.initializeSession({
      load: async () => ({ accessToken: 'private-token' }),
      save: async () => {},
      clear: async () => {},
    });
    const result = await service.getStatusWithPermissions();
    expect(result.user).toMatchObject({
      id: '10086',
      tenantId: '1001',
      permissionCodes: ['sales-plan:plan:category-approve'],
    });
    expect(JSON.stringify(result)).not.toContain('private-token');
    expect(JSON.stringify(result)).not.toContain('allAuth');
  });

  it('rejects permission reads for a different verified identity before returning the current user', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(verifiedUserInfoResponse('1001')));
    const service = new LarkAuthService({ baseUrl: 'https://gea.example/gea-boot', fetchImpl });
    await service.initializeSession({
      load: async () => ({ accessToken: 'private-token' }),
      save: async () => {},
      clear: async () => {},
    });
    for (const identity of [
      { provider: 'lark' as const, issuer: 'https://gea.example/gea-boot', tenant_id: '1001', subject: 'other-user' },
      {
        provider: 'lark' as const,
        issuer: 'https://gea.example/gea-boot',
        tenant_id: 'other-tenant',
        subject: '10086',
      },
      { provider: 'lark' as const, issuer: 'https://other.example/gea-boot', tenant_id: '1001', subject: '10086' },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- independently exercise each rejected identity against one service.
      await expect(service.getStatusWithPermissions(identity)).rejects.toThrow();
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('drops previously granted permissions when a fresh permission read fails', async () => {
    let fail = false;
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/sys/user/getUserInfo')) return jsonResponse(verifiedUserInfoResponse('1001'));
      if (fail) throw new TypeError('offline');
      return jsonResponse({ success: true, result: { codeList: ['sales-plan:plan:category-approve'] } });
    });
    const service = new LarkAuthService({ baseUrl: 'https://gea.example/gea-boot', fetchImpl });
    await service.initializeSession({
      load: async () => ({ accessToken: 'private-token' }),
      save: async () => {},
      clear: async () => {},
    });
    expect((await service.getStatusWithPermissions()).user?.permissionCodes).toEqual([
      'sales-plan:plan:category-approve',
    ]);
    fail = true;
    expect(await service.getStatusWithPermissions()).toMatchObject({
      authenticated: true,
      user: { permissionCodes: undefined },
    });
  });

  it('does not return an old user permission result after logout during the read', async () => {
    let resolvePermission!: (value: Response) => void;
    const service = new LarkAuthService({
      baseUrl: 'https://gea.example/gea-boot',
      fetchImpl: async (input) => {
        if (String(input).endsWith('/sys/user/getUserInfo')) return jsonResponse(verifiedUserInfoResponse('1001'));
        return new Promise<Response>((resolve) => {
          resolvePermission = resolve;
        });
      },
    });
    await service.initializeSession({
      load: async () => ({ accessToken: 'private-token' }),
      save: async () => {},
      clear: async () => {},
    });
    const pending = service.getStatusWithPermissions();
    await service.logout();
    resolvePermission(jsonResponse({ success: true, result: { codeList: ['sales-plan:plan:category-approve'] } }));
    await expect(pending).rejects.toThrow();
    expect(service.getStatus().authenticated).toBe(false);
  });

  it.each([
    'http://gea.example/gea-boot',
    'https://user:password@gea.example/gea-boot',
    'https://gea.example/gea-boot?tenant=1',
    'https://gea.example/gea-boot#fragment',
  ])('rejects an unsafe GEA base URL: %s', (baseUrl) => {
    expect(() => new LarkAuthService({ baseUrl })).toThrow();
  });

  it('isolates persisted login sessions by GEA environment', () => {
    expect(resolveLarkAuthSessionFileName('https://gea.synear.cn/gea-boot')).toBe('lark-auth-session.bin');
    expect(resolveLarkAuthSessionFileName('https://gea.synear.cn/gea-boot/')).toBe('lark-auth-session.bin');

    const testFile = resolveLarkAuthSessionFileName('https://gea.synear.cn:4443/gea-boot');
    expect(testFile).toMatch(/^lark-auth-session-[a-f0-9]{12}\.bin$/);
    expect(testFile).not.toBe(resolveLarkAuthSessionFileName('https://gea.synear.cn:5555/gea-boot'));
  });

  it('uses the local system user in desktop development', () => {
    expect(resolveDesktopLarkAuthStatus(false, { authenticated: false })).toEqual({
      authenticated: true,
      user: {
        id: 'system_default_user',
        realname: 'admin',
        username: 'admin',
      },
    });
  });

  it('can require real GEA authentication during desktop development', () => {
    vi.stubEnv('AIONUI_GEA_REQUIRE_AUTH', '1');
    const status = { authenticated: false };

    expect(resolveDesktopLarkAuthStatus(false, status)).toBe(status);
  });

  it('preserves the authenticated GEA user in desktop development', () => {
    const status = {
      authenticated: true,
      user: { id: '10086', realname: '张三', username: 'zhangsan' },
    };

    expect(resolveDesktopLarkAuthStatus(false, status)).toBe(status);
  });

  it('preserves the real GEA authentication status in packaged builds', () => {
    const status = {
      authenticated: true,
      user: { id: '10086', realname: '张三', username: 'zhangsan' },
    };

    expect(resolveDesktopLarkAuthStatus(true, status)).toBe(status);
  });

  it('automatically syncs personal models for the authenticated GEA user', async () => {
    const service = getSharedLarkAuthService();
    const user = { id: '10086', realname: '张三', username: 'zhangsan' };
    const pollSpy = vi.spyOn(service, 'pollQrSessionWithIdentity').mockResolvedValue({
      identity: {
        provider: 'lark',
        issuer: 'https://gea.example/gea-boot',
        tenant_id: '1001',
        subject: user.id,
      },
      result: { status: 'authenticated', user },
    });
    const statusSpy = vi.spyOn(service, 'getStatus').mockReturnValue({ authenticated: true, user });
    const permissionSpy = vi
      .spyOn(service, 'getStatusWithPermissions')
      .mockResolvedValue({ authenticated: true, user });
    const forwardSpy = vi.spyOn(service, 'forwardGatewayAuthSession').mockImplementation(async (forward) => {
      await forward({ accessToken: 'sensitive-token', tenantId: 'tenant-1' });
      return true;
    });
    const sync = vi.fn().mockResolvedValue({ configured: 1, failed: 0, skipped: 0, status: 'completed' });
    configureSharedPersonalModelGateway({ deactivate: vi.fn(), sync });

    await expect(pollSharedLarkAuthSession('QRCODELOGIN:1')).resolves.toEqual({
      status: 'authenticated',
      user,
      personalModelSync: { configured: 1, failed: 0, skipped: 0, status: 'completed' },
    });
    expect(sync).toHaveBeenCalledWith(user, service);
    expect(httpRequestMock).toHaveBeenCalledWith('PUT', '/api/gea/auth/session', {
      accessToken: 'sensitive-token',
      tenantId: 'tenant-1',
    });
    pollSpy.mockRestore();
    statusSpy.mockRestore();
    permissionSpy.mockRestore();
    forwardSpy.mockRestore();
  });

  it('clears the persisted desktop session when AionCore reports upstream reauthentication is required', async () => {
    const service = getSharedLarkAuthService();
    const statusSpy = vi.spyOn(service, 'getStatus').mockReturnValue({
      authenticated: true,
      user: { id: '10086', realname: '张三', username: 'zhangsan' },
    });
    const forwardSpy = vi.spyOn(service, 'forwardGatewayAuthSession').mockImplementation(async (forward) => {
      await forward({ accessToken: 'expired-token', tenantId: 'tenant-1' });
      return true;
    });
    const logoutSpy = vi.spyOn(service, 'logout').mockResolvedValue(undefined);
    const deactivate = vi.fn().mockResolvedValue(undefined);
    configureSharedPersonalModelGateway({ deactivate, sync: vi.fn() });
    httpRequestMock.mockResolvedValueOnce({ authenticated: false, reauthRequired: true });

    await expect(syncSharedGeaSessionToBackend()).resolves.toBe(false);

    expect(httpRequestMock).toHaveBeenCalledWith('GET', '/api/gea/auth/session');
    expect(forwardSpy).not.toHaveBeenCalled();
    expect(logoutSpy).toHaveBeenCalledOnce();
    expect(deactivate).toHaveBeenCalledOnce();
    statusSpy.mockRestore();
    forwardSpy.mockRestore();
    logoutSpy.mockRestore();
  });

  it('re-forwards the persisted desktop session when AionCore restarted without rejecting the token', async () => {
    const service = getSharedLarkAuthService();
    const statusSpy = vi.spyOn(service, 'getStatus').mockReturnValue({
      authenticated: true,
      user: { id: '10086', realname: '张三', username: 'zhangsan' },
    });
    const forwardSpy = vi.spyOn(service, 'forwardGatewayAuthSession').mockImplementation(async (forward) => {
      await forward({ accessToken: 'persisted-token', tenantId: 'tenant-1' });
      return true;
    });
    const logoutSpy = vi.spyOn(service, 'logout').mockResolvedValue(undefined);
    httpRequestMock
      .mockResolvedValueOnce({ authenticated: false, reauthRequired: false })
      .mockResolvedValueOnce(undefined);

    await expect(syncSharedGeaSessionToBackend()).resolves.toBe(true);

    expect(httpRequestMock).toHaveBeenNthCalledWith(1, 'GET', '/api/gea/auth/session');
    expect(httpRequestMock).toHaveBeenNthCalledWith(2, 'PUT', '/api/gea/auth/session', {
      accessToken: 'persisted-token',
      tenantId: 'tenant-1',
    });
    expect(logoutSpy).not.toHaveBeenCalled();
    statusSpy.mockRestore();
    forwardSpy.mockRestore();
    logoutSpy.mockRestore();
  });

  it('restores personal model routes for an authenticated session during startup', async () => {
    const service = getSharedLarkAuthService();
    const user = { id: '10086', realname: '张三', username: 'zhangsan' };
    const statusSpy = vi.spyOn(service, 'getStatus').mockReturnValue({ authenticated: true, user });
    const sync = vi.fn().mockResolvedValue({ configured: 1, failed: 0, skipped: 0, status: 'completed' });

    await expect(initializeSharedPersonalModelGateway({ deactivate: vi.fn(), sync })).resolves.toEqual({
      configured: 1,
      failed: 0,
      skipped: 0,
      status: 'completed',
    });
    expect(sync).toHaveBeenCalledWith(user, service);
    statusSpy.mockRestore();
  });

  it('retries an incomplete personal model restore and stops once the gateway is ready', async () => {
    const service = getSharedLarkAuthService();
    const user = { id: '10086', realname: '张三', username: 'zhangsan' };
    const statusSpy = vi.spyOn(service, 'getStatus').mockReturnValue({ authenticated: true, user });
    const sync = vi
      .fn()
      .mockResolvedValueOnce({ configured: 0, failed: 1, skipped: 0, status: 'partial' })
      .mockResolvedValueOnce({ configured: 1, failed: 0, skipped: 0, status: 'completed' });
    configureSharedPersonalModelGateway({ deactivate: vi.fn(), sync });

    await ensureSharedPersonalModels();
    await ensureSharedPersonalModels();
    await ensureSharedPersonalModels();

    expect(sync).toHaveBeenCalledTimes(2);
    statusSpy.mockRestore();
  });

  it('deactivates stale personal model routes when startup has no authenticated GEA session', async () => {
    const service = getSharedLarkAuthService();
    const statusSpy = vi.spyOn(service, 'getStatus').mockReturnValue({ authenticated: false });
    const deactivate = vi.fn().mockResolvedValue(undefined);
    const sync = vi.fn();

    await expect(initializeSharedPersonalModelGateway({ deactivate, sync })).resolves.toEqual({
      configured: 0,
      failed: 0,
      reason: 'notAuthenticated',
      skipped: 0,
      status: 'notAuthenticated',
    });
    expect(deactivate).toHaveBeenCalledOnce();
    expect(sync).not.toHaveBeenCalled();
    statusSpy.mockRestore();
  });

  it('creates a QR session using the GEA state format', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: true, result: { qrcodeId: 'QRCODELOGIN:1234567890' } })
    );
    const service = new LarkAuthService({ baseUrl: 'https://gea.example/gea-boot/', fetchImpl });

    const session = await service.createQrSession();
    const loginUrl = new URL(session.loginUrl);
    const state = new URL(loginUrl.searchParams.get('state')!);

    expect(session.qrcodeId).toBe('QRCODELOGIN:1234567890');
    expect(state.searchParams.get('feishuScanQrcodeId')).toBe('QRCODELOGIN:1234567890');
    expect(loginUrl.searchParams.get('tenantId')).toBe('0');
  });

  it('uses the same configured GEA base URL as AionCore for QR login', async () => {
    vi.stubEnv('AIONUI_GEA_BASE_URL', 'https://gea.example:4443/gea-boot');
    vi.stubEnv('AUTH_BROKER_PUBLIC_URL', 'https://gea.example/gea-boot');
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: true, result: { qrcodeId: 'QRCODELOGIN:1234567890' } })
    );
    const service = new LarkAuthService({ fetchImpl });

    await service.createQrSession();

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://gea.example:4443/gea-boot/sys/getLoginQrcode');
  });

  it('constructs the shared authentication service only after the Main environment is finalized', () => {
    resetSharedLarkAuthServiceForTests();
    resetGeaEnvironmentForTests();
    initializeGeaEnvironment({
      env: { AIONUI_GEA_BASE_URL: 'https://final-gea.example:4443/gea-boot///' },
      isPackaged: true,
    });

    expect(getSharedLarkAuthService().getBaseUrl()).toBe('https://final-gea.example:4443/gea-boot');
  });

  it('builds the exact server-only identity from the normalized GEA issuer and verified user', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { success: true, token: 'sensitive-token' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: { userInfo: { id: '10086', username: 'zhangsan', realname: '张三', loginTenantId: '1001' } },
        })
      );
    const service = new LarkAuthService({ baseUrl: 'https://gea.example:4443/gea-boot///', fetchImpl });

    const result = await service.pollQrSessionWithIdentity('QRCODELOGIN:1');

    expect(result).toEqual({
      identity: {
        provider: 'lark',
        issuer: 'https://gea.example:4443/gea-boot',
        tenant_id: '1001',
        subject: '10086',
      },
      result: {
        status: 'authenticated',
        user: { id: '10086', username: 'zhangsan', realname: '张三' },
      },
    });
    expect(JSON.stringify(result)).not.toContain('sensitive-token');
  });

  it.each([undefined, null, ''] as const)(
    'fails closed when the verified identity tenant is %s',
    async (loginTenantId) => {
      const save = vi.fn();
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ success: true, result: { success: true, token: 'sensitive-token' } }))
        .mockResolvedValueOnce(
          jsonResponse({
            success: true,
            result: {
              userInfo: {
                id: '10086',
                username: 'zhangsan',
                realname: '张三',
                ...(loginTenantId === undefined ? {} : { loginTenantId }),
              },
            },
          })
        );
      const service = new LarkAuthService({
        fetchImpl,
        sessionStore: { clear: vi.fn(), load: vi.fn(), save },
      });

      await expect(service.pollQrSessionWithIdentity('QRCODELOGIN:1')).rejects.toMatchObject<LarkAuthServiceError>({
        code: 'invalidResponse',
      });
      expect(save).not.toHaveBeenCalled();
      expect(service.getStatus()).toEqual({ authenticated: false });
    }
  );

  it('keeps otherwise identical users in different verified tenants as different identities', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { success: true, token: 'token-a' } }))
      .mockResolvedValueOnce(jsonResponse(verifiedUserInfoResponse('1001')))
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { success: true, token: 'token-b' } }))
      .mockResolvedValueOnce(jsonResponse(verifiedUserInfoResponse('1002')));
    const service = new LarkAuthService({ baseUrl: 'https://gea.example/gea-boot', fetchImpl });

    const first = await service.pollQrSessionWithIdentity('QR-A');
    const second = await service.pollQrSessionWithIdentity('QR-B');

    expect(first.identity).toEqual({
      provider: 'lark',
      issuer: 'https://gea.example/gea-boot',
      tenant_id: '1001',
      subject: '10086',
    });
    expect(second.identity).toEqual({
      provider: 'lark',
      issuer: 'https://gea.example/gea-boot',
      tenant_id: '1002',
      subject: '10086',
    });
  });

  it('does not expose a process-global logout through the WebHost auth adapter', () => {
    expect(createSharedWebHostLarkAuth()).not.toHaveProperty('logout');
  });

  it('does not forward a WebHost user GEA credential into process-global Core state', async () => {
    const service = getSharedLarkAuthService();
    const verified = {
      identity: {
        provider: 'lark' as const,
        issuer: 'https://gea.example/gea-boot',
        tenant_id: '1001',
        subject: 'user-1',
      },
      result: {
        status: 'authenticated' as const,
        user: { id: 'user-1', realname: '张三', username: 'zhangsan' },
      },
    };
    const pollSpy = vi.spyOn(service, 'pollQrSessionWithIdentity').mockResolvedValue(verified);
    const permissionSpy = vi
      .spyOn(service, 'getStatusWithPermissions')
      .mockResolvedValue({ authenticated: true, user: verified.result.user });

    await expect(createSharedWebHostLarkAuth().pollQrSession('qr-1')).resolves.toEqual({
      identity: verified.identity,
      publicResult: { success: true, data: verified.result },
    });
    expect(httpRequestMock).not.toHaveBeenCalled();
    expect(permissionSpy).toHaveBeenCalledWith(verified.identity);
    permissionSpy.mockRestore();
    pollSpy.mockRestore();
  });

  it.each([
    ['-1', 'pending'],
    ['-2', 'expired'],
  ] as const)('maps the GEA token sentinel %s to %s', async (token, status) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, result: { token } }));
    const service = new LarkAuthService({ fetchImpl });

    await expect(service.pollQrSession('QRCODELOGIN:1')).resolves.toEqual({ status });
  });

  it('keeps an authenticated session in memory after GEA returns a token', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { success: true, token: 'sensitive-token' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: {
            userInfo: {
              id: '10086',
              username: 'zhangsan',
              realname: '张三',
              avatar: '/sys/common/static/avatar.png',
            },
          },
        })
      );
    const service = new LarkAuthService({ fetchImpl });

    await expect(service.pollQrSession('QRCODELOGIN:1')).resolves.toMatchObject({
      status: 'authenticated',
      user: {
        avatar: 'https://gea.synear.cn/gea-boot/sys/common/static/avatar.png',
        id: '10086',
        realname: '张三',
        username: 'zhangsan',
      },
    });
    expect(service.getStatus()).toMatchObject({ authenticated: true, user: { realname: '张三' } });

    const userInfoRequest = fetchImpl.mock.calls[1];
    expect(userInfoRequest[0]).toBe('https://gea.synear.cn/gea-boot/sys/user/getUserInfo');
    expect(userInfoRequest[1]?.headers).toMatchObject({ 'X-Access-Token': 'sensitive-token' });

    await service.logout();
    expect(service.getStatus()).toEqual({ authenticated: false });
  });

  it('restores an authenticated session after the app process restarts', async () => {
    let storedSession: { accessToken: string } | null = null;
    const sessionStore = {
      load: vi.fn(async () => storedSession),
      save: vi.fn(async (session: { accessToken: string }) => {
        storedSession = session;
      }),
      clear: vi.fn(async () => {
        storedSession = null;
      }),
    };
    const loginFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { success: true, token: 'persisted-token' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: { userInfo: { id: '10086', username: 'zhangsan', realname: '张三', loginTenantId: 1 } },
        })
      );
    const firstProcess = new LarkAuthService({ fetchImpl: loginFetch, sessionStore });

    await firstProcess.pollQrSession('QRCODELOGIN:1');
    expect(sessionStore.save).toHaveBeenCalledWith({ accessToken: 'persisted-token' });

    const restoreFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        result: { userInfo: { id: '10086', username: 'zhangsan', realname: '张三', loginTenantId: 1 } },
      })
    );
    const restartedProcess = new LarkAuthService({ fetchImpl: restoreFetch, sessionStore });
    await restartedProcess.initializeSession();

    expect(restartedProcess.getStatus()).toMatchObject({
      authenticated: true,
      user: { id: '10086', realname: '张三' },
    });
    expect(restoreFetch).toHaveBeenCalledWith(
      'https://gea.synear.cn/gea-boot/sys/user/getUserInfo',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Access-Token': 'persisted-token' }) })
    );

    await restartedProcess.logout();
    expect(sessionStore.clear).toHaveBeenCalledOnce();
    expect(storedSession).toBeNull();
  });

  it('keeps the authenticated session in memory when secure persistence is unavailable', async () => {
    const sessionStore = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockRejectedValue(new LarkAuthServiceError('secureStorageUnavailable')),
      clear: vi.fn(),
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { success: true, token: 'sensitive-token' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: { userInfo: { id: '10086', username: 'zhangsan', realname: '张三', loginTenantId: 1 } },
        })
      );
    const service = new LarkAuthService({ fetchImpl, sessionStore });

    await expect(service.pollQrSession('QRCODELOGIN:1')).resolves.toMatchObject({
      status: 'authenticated',
      user: { id: '10086' },
    });
    expect(service.getStatus()).toMatchObject({ authenticated: true, user: { id: '10086' } });
  });

  it('clears a persisted session when GEA rejects the token', async () => {
    const sessionStore = {
      load: vi.fn().mockResolvedValue({ accessToken: 'expired-token' }),
      save: vi.fn(),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ success: false }, 401));
    const service = new LarkAuthService({ fetchImpl, sessionStore });

    await service.initializeSession();

    expect(service.getStatus()).toEqual({ authenticated: false });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sessionStore.clear).toHaveBeenCalledOnce();
  });

  it('retries restoration after a transient network failure', async () => {
    const sessionStore = {
      load: vi.fn().mockResolvedValue({ accessToken: 'persisted-token' }),
      save: vi.fn(),
      clear: vi.fn(),
    };
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: { userInfo: { id: '10086', username: 'zhangsan', realname: '张三', loginTenantId: 1 } },
        })
      );
    const service = new LarkAuthService({ fetchImpl, sessionStore });

    await service.initializeSession();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(service.getStatus()).toMatchObject({ authenticated: true, user: { id: '10086' } });
    expect(sessionStore.clear).not.toHaveBeenCalled();
  });

  it('does not report logout success when the persisted session cannot be removed', async () => {
    const sessionStore = {
      load: vi.fn().mockResolvedValue({ accessToken: 'persisted-token' }),
      save: vi.fn(),
      clear: vi.fn().mockRejectedValue(new Error('disk unavailable')),
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        result: { userInfo: { id: '10086', username: 'zhangsan', realname: '张三', loginTenantId: 1 } },
      })
    );
    const service = new LarkAuthService({ fetchImpl, sessionStore });
    await service.initializeSession();

    await expect(service.logout()).rejects.toThrow('disk unavailable');
    expect(service.getStatus()).toMatchObject({ authenticated: true, user: { id: '10086' } });
  });

  it('does not access secure storage when no persisted desktop session exists', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aionui-lark-auth-empty-'));
    const storage: LarkAuthSafeStorageAdapter = {
      isEncryptionAvailable: vi.fn(() => true),
      getSelectedStorageBackend: vi.fn(() => 'keychain'),
      encryptString: vi.fn(),
      decryptString: vi.fn(),
    };

    try {
      const store = new ElectronLarkAuthSessionStore(path.join(tempDir, 'missing-session.bin'), storage);

      await expect(store.load()).resolves.toBeNull();
      expect(storage.isEncryptionAvailable).not.toHaveBeenCalled();
      expect(storage.getSelectedStorageBackend).not.toHaveBeenCalled();
      expect(storage.decryptString).not.toHaveBeenCalled();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('persists the desktop session only as encrypted bytes and removes invalid data', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aionui-lark-auth-'));
    const filePath = path.join(tempDir, 'lark-auth-session.bin');
    const storage: LarkAuthSafeStorageAdapter = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'gnome_libsecret',
      encryptString: (value) => xor(Buffer.from(value, 'utf8')),
      decryptString: (value) => xor(value).toString('utf8'),
    };

    try {
      const store = new ElectronLarkAuthSessionStore(filePath, storage);
      await store.save({ accessToken: 'sensitive-platform-token' });

      const persisted = await readFile(filePath);
      expect(persisted.toString('utf8')).not.toContain('sensitive-platform-token');
      await expect(new ElectronLarkAuthSessionStore(filePath, storage).load()).resolves.toEqual({
        accessToken: 'sensitive-platform-token',
      });

      await writeFile(filePath, xor(Buffer.from('{"version":1}', 'utf8')));
      await expect(new ElectronLarkAuthSessionStore(filePath, storage).load()).resolves.toBeNull();
      await expect(readFile(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('preserves a persisted desktop session when secure storage denies decryption', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aionui-lark-auth-denied-'));
    const filePath = path.join(tempDir, 'lark-auth-session.bin');
    const encrypted = Buffer.from('encrypted-session');
    const storage: LarkAuthSafeStorageAdapter = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'keychain',
      encryptString: vi.fn(),
      decryptString: () => {
        throw new Error('keychain authorization denied');
      },
    };

    try {
      await writeFile(filePath, encrypted);
      const store = new ElectronLarkAuthSessionStore(filePath, storage);

      await expect(store.load()).rejects.toMatchObject<LarkAuthServiceError>({
        code: 'secureStorageUnavailable',
      });
      await expect(readFile(filePath)).resolves.toEqual(encrypted);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects desktop session persistence when secure storage is unavailable', async () => {
    const storage: LarkAuthSafeStorageAdapter = {
      isEncryptionAvailable: () => false,
      getSelectedStorageBackend: () => 'basic_text',
      encryptString: vi.fn(),
      decryptString: vi.fn(),
    };
    const store = new ElectronLarkAuthSessionStore('/tmp/aionui-unavailable-session.bin', storage);

    await expect(store.save({ accessToken: 'sensitive-token' })).rejects.toMatchObject<LarkAuthServiceError>({
      code: 'secureStorageUnavailable',
    });
  });

  it('rejects an invalid GEA response without accepting an empty token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, result: { success: true, token: '' } }));
    const service = new LarkAuthService({ fetchImpl });

    await expect(service.pollQrSession('QRCODELOGIN:1')).rejects.toMatchObject<LarkAuthServiceError>({
      code: 'invalidResponse',
    });
  });

  it('reports a network error when GEA cannot be reached', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    const service = new LarkAuthService({ fetchImpl });

    await expect(service.createQrSession()).rejects.toMatchObject<LarkAuthServiceError>({ code: 'networkError' });
  });

  it('does not forward a GEA credential across an origin redirect', async () => {
    let redirectedRequests = 0;
    const redirectedHeaders: string[] = [];
    const redirectTarget = http.createServer((req, res) => {
      redirectedRequests += 1;
      redirectedHeaders.push(req.headers['x-access-token'] ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(verifiedUserInfoResponse('1')));
    });
    await listen(redirectTarget);
    const redirectedPort = (redirectTarget.address() as AddressInfo).port;
    const source = http.createServer((req, res) => {
      if (req.url?.startsWith('/sys/getQrcodeToken')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: true, result: { success: true, token: 'sensitive-token' } }));
        return;
      }
      res.writeHead(302, { location: `http://127.0.0.1:${redirectedPort}/credential-target` });
      res.end();
    });
    await listen(source);
    const sourcePort = (source.address() as AddressInfo).port;
    const service = new LarkAuthService({
      allowLoopbackHttp: true,
      baseUrl: `http://127.0.0.1:${sourcePort}`,
    });

    try {
      await expect(service.pollQrSession('QRCODELOGIN:1')).rejects.toMatchObject<LarkAuthServiceError>({
        code: 'networkError',
      });
      expect(redirectedRequests).toBe(0);
      expect(redirectedHeaders).toEqual([]);
      expect(service.getStatus()).toEqual({ authenticated: false });
    } finally {
      await Promise.all([close(source), close(redirectTarget)]);
    }
  });

  it('does not authenticate when the current-user response is empty', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { success: true, token: 'sensitive-token' } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, result: {} }));
    const service = new LarkAuthService({ fetchImpl });

    await expect(service.pollQrSession('QRCODELOGIN:1')).rejects.toMatchObject<LarkAuthServiceError>({
      code: 'invalidResponse',
    });
    expect(service.getStatus()).toEqual({ authenticated: false });
  });

  it('creates a GEA gateway session and invalidates it on logout', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { success: true, token: 'platform-token' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: { userInfo: { id: '10086', username: 'zhangsan', realname: '张三' } },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: {
            accessDecision: { allowed: true, code: 'ALLOW' },
            gatewayContext: {
              agentId: 'sales_forecast',
              sessionId: 'session-1',
              conversationId: 'conversation-1',
            },
            delegationToken: 'delegation-token',
          },
        })
      );
    const service = new LarkAuthService({ baseUrl: 'https://gea.example/gea-boot', fetchImpl });

    await service.pollQrSession('QRCODELOGIN:1');
    const gatewaySession = await service.createMcpGatewaySession('sales_forecast');

    expect(fetchImpl.mock.calls[2][1]).toMatchObject({
      headers: expect.objectContaining({ 'X-Access-Token': 'platform-token' }),
      body: expect.stringContaining('"consumerCode":"sales_forecast"'),
    });

    await service.logout();
    await expect(gatewaySession.listTools()).rejects.toMatchObject({ code: 'GEA_LOGIN_REQUIRED' });
  });

  it('uses the platform token to claim a personal credential and the personal secret only for model discovery', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { success: true, token: 'platform-token' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: { userInfo: { id: '10086', username: 'zhangsan', realname: '张三', loginTenantId: 1 } },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: {
            records: [
              {
                id: 'credential-1',
                tenantId: 1,
                accessKeyId: 'uk-gea-1',
                agentId: 'sales-forecast',
                status: 'PENDING_CLAIM',
              },
            ],
            total: 1,
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: {
            credentialId: 'credential-1',
            accessKeyId: 'uk-gea-1',
            agentCode: 'sales-forecast',
            baseUrl: 'https://model.example/v1',
            secret: 'sk-user-sensitive',
            status: 'ENABLED',
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'deepseek-v4-flash' }] }));
    const service = new LarkAuthService({ baseUrl: 'https://gea.example/gea-boot', fetchImpl });
    await service.pollQrSession('QRCODELOGIN:1');

    await expect(service.listPersonalModelCredentials()).resolves.toEqual([
      {
        credentialId: 'credential-1',
        tenantId: '1',
        accessKeyId: 'uk-gea-1',
        agentCode: 'sales-forecast',
        status: 'PENDING_CLAIM',
      },
    ]);
    const claimed = await service.claimPersonalModelCredential('credential-1', '1');
    await expect(service.listPersonalModels(claimed.baseUrl, claimed.secret)).resolves.toEqual(['deepseek-v4-flash']);

    expect(fetchImpl.mock.calls[2][1]?.headers).toMatchObject({
      'X-Access-Token': 'platform-token',
      'X-Tenant-Id': '1',
    });
    expect(fetchImpl.mock.calls[3][0]).toContain('/my/claim?id=credential-1');
    expect(fetchImpl.mock.calls[3][1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        'X-Access-Token': 'platform-token',
        'X-Tenant-Id': '1',
      }),
    });
    expect(fetchImpl.mock.calls[4][1]?.headers).toMatchObject({ Authorization: 'Bearer sk-user-sensitive' });
    expect(fetchImpl.mock.calls.every(([, init]) => init?.redirect === 'error')).toBe(true);
    expect(JSON.stringify(fetchImpl.mock.calls.slice(0, 4))).not.toContain('sk-user-sensitive');
  });
});
