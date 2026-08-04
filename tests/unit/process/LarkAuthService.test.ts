/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { LarkAuthServiceError } from '@/process/services/LarkAuthService';
import { LarkAuthService } from '@/process/services/LarkAuthService';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('LarkAuthService', () => {
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

    service.logout();
    expect(service.getStatus()).toEqual({ authenticated: false });
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
});
