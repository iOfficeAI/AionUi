/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { httpRequestMock, mcpServiceMock, configServiceMock } = vi.hoisted(() => ({
  httpRequestMock: vi.fn(),
  mcpServiceMock: {
    listServers: { invoke: vi.fn() },
    importServers: { invoke: vi.fn() },
    toggleServer: { invoke: vi.fn() },
  },
  configServiceMock: {
    get: vi.fn(),
    setLocal: vi.fn(),
  },
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  httpRequest: httpRequestMock,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: mcpServiceMock,
}));

vi.mock('@/common/config/configService', () => ({
  configService: configServiceMock,
}));

import { ensureBackendMcpCatalog } from '@/renderer/hooks/mcp/catalog';

describe('ensureBackendMcpCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    httpRequestMock.mockResolvedValue({
      'mcp.config': [
        {
          id: 'builtin-1',
          name: 'builtin one',
          enabled: true,
          transport: { type: 'stdio', command: 'builtin', args: [] },
          created_at: 1,
          updated_at: 1,
          original_json: '{}',
          builtin: true,
        },
      ],
    });
    configServiceMock.get.mockReturnValue([]);
    mcpServiceMock.listServers.invoke.mockResolvedValue([
      {
        id: 'user-1',
        name: 'user one',
        enabled: true,
        transport: { type: 'stdio', command: 'user', args: [] },
        created_at: 2,
        updated_at: 2,
        original_json: '{}',
        builtin: false,
      },
    ]);
  });

  it('reads legacy config when needed but does not write mcp catalog back into configService cache', async () => {
    const result = await ensureBackendMcpCatalog();

    expect(result.userServers).toHaveLength(1);
    expect(result.builtinServers).toHaveLength(1);
    expect(result.allServers).toHaveLength(2);
    expect(configServiceMock.setLocal).not.toHaveBeenCalled();
  });
});
