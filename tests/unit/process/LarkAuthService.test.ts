/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { LarkAuthServiceError } from '@/process/services/LarkAuthService';
import {
  configureSharedPersonalModelGateway,
  getSharedLarkAuthService,
  LarkAuthService,
  pollSharedLarkAuthSession,
  resolveDesktopLarkAuthStatus,
} from '@/process/services/LarkAuthService';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('LarkAuthService', () => {
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
    const pollSpy = vi.spyOn(service, 'pollQrSession').mockResolvedValue({ status: 'authenticated', user });
    const sync = vi.fn().mockResolvedValue({ configured: 1, failed: 0, skipped: 0, status: 'completed' });
    configureSharedPersonalModelGateway({ deactivate: vi.fn(), sync });

    await expect(pollSharedLarkAuthSession('QRCODELOGIN:1')).resolves.toEqual({
      status: 'authenticated',
      user,
      personalModelSync: { configured: 1, failed: 0, skipped: 0, status: 'completed' },
    });
    expect(sync).toHaveBeenCalledWith(user, service);
    pollSpy.mockRestore();
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

  it('creates a GEA gateway session and proxies authorized MCP tools without exposing tokens', async () => {
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
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          tools: [
            {
              name: 'search_records',
              description: '搜索记录',
              inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
              sourceCode: 'mcp-001',
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          sourceCode: 'mcp-001',
          toolName: 'search_records',
          result: '{"data":[]}',
          auditId: 'audit-1',
        })
      );
    const service = new LarkAuthService({ baseUrl: 'https://gea.example/gea-boot', fetchImpl });

    await service.pollQrSession('QRCODELOGIN:1');
    const gatewaySession = await service.createMcpGatewaySession('sales_forecast');
    const tools = await gatewaySession.listTools();
    await expect(gatewaySession.callTool(tools[0], { query: '客户A' })).resolves.toEqual({
      result: '{"data":[]}',
      auditId: 'audit-1',
    });

    expect(fetchImpl.mock.calls[2][1]).toMatchObject({
      headers: expect.objectContaining({ 'X-Access-Token': 'platform-token' }),
      body: JSON.stringify({ agentCode: 'sales_forecast', channel: 'CS_CLIENT' }),
    });
    expect(fetchImpl.mock.calls[3][1]?.body).toContain('delegation-token');
    expect(fetchImpl.mock.calls[4][1]?.body).toContain('delegation-token');

    service.logout();
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
    expect(JSON.stringify(fetchImpl.mock.calls.slice(0, 4))).not.toContain('sk-user-sensitive');
  });
});
