/**
 * @license
 * Copyright 2025 AIbang (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mcpService } from '@/common/adapter/ipcBridge';
import type { IMcpServer } from '@/common/config/storage';
import { useMcpServerCRUD } from '@/renderer/hooks/mcp/useMcpServerCRUD';

const messageMock = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));
const clientBusinessSettingMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: messageMock,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: {
    createServer: { invoke: vi.fn() },
    updateServer: { invoke: vi.fn() },
    deleteServer: { invoke: vi.fn() },
    toggleServer: { invoke: vi.fn() },
  },
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  isBackendHttpError: (error: unknown) => (error as { status?: number }).status === 404,
}));

vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: clientBusinessSettingMock.get,
  setClientBusinessSetting: clientBusinessSettingMock.set,
}));

const createServer = (enabled: boolean): IMcpServer => ({
  id: 'server-1',
  name: 'Test MCP',
  enabled,
  transport: { type: 'stdio', command: 'node', args: [] },
  tools: [{ name: 'existing-tool' }] as IMcpServer['tools'],
  last_test_status: 'connected',
  created_at: 1,
  updated_at: 1,
  original_json: '{}',
});

const createServerData = (enabled: boolean) => ({
  name: 'Test MCP',
  enabled,
  transport: { type: 'stdio', command: 'node', args: [] },
  original_json: '{}',
});

describe('useMcpServerCRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('electronAPI', undefined);
    clientBusinessSettingMock.get.mockResolvedValue([]);
  });

  it('persists a toggle and preserves locally discovered tools', async () => {
    const server = createServer(true);
    const saveMcpServers = vi.fn((updater: (servers: IMcpServer[]) => IMcpServer[]) =>
      Promise.resolve(updater([server]))
    );
    vi.mocked(mcpService.toggleServer.invoke).mockResolvedValue({ ...server, enabled: false } as never);

    const { result } = renderHook(() => useMcpServerCRUD(saveMcpServers));
    let updatedServer: IMcpServer | undefined;
    await act(async () => {
      updatedServer = await result.current.handleToggleMcpServer(server);
    });

    expect(mcpService.toggleServer.invoke).toHaveBeenCalledWith({ id: server.id });
    expect(updatedServer?.enabled).toBe(false);
    expect(updatedServer?.tools).toEqual(server.tools);
    expect(saveMcpServers).toHaveBeenCalledTimes(1);
  });

  it('keeps the current enabled state when the backend toggle fails', async () => {
    const server = createServer(true);
    const saveMcpServers = vi.fn(() => Promise.resolve());
    vi.mocked(mcpService.toggleServer.invoke).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useMcpServerCRUD(saveMcpServers));
    let updatedServer: IMcpServer | undefined;
    await act(async () => {
      updatedServer = await result.current.handleToggleMcpServer(server);
    });

    expect(updatedServer).toBeUndefined();
    expect(saveMcpServers).not.toHaveBeenCalled();
    expect(messageMock.error).toHaveBeenCalledWith('network down');
  });

  it('persists the requested enabled state after creating a server', async () => {
    const persisted = { ...createServer(false), id: 'server-2' };
    const saveMcpServers = vi.fn(() => Promise.resolve());
    vi.mocked(mcpService.createServer.invoke).mockResolvedValue(persisted as never);
    vi.mocked(mcpService.toggleServer.invoke).mockResolvedValue({ ...persisted, enabled: true } as never);

    const { result } = renderHook(() => useMcpServerCRUD(saveMcpServers));
    let createdServer: IMcpServer | undefined;
    await act(async () => {
      createdServer = await result.current.handleAddMcpServer(createServerData(true));
    });

    expect(mcpService.createServer.invoke).toHaveBeenCalledTimes(1);
    expect(mcpService.toggleServer.invoke).toHaveBeenCalledWith({ id: persisted.id });
    expect(createdServer?.enabled).toBe(true);
    expect(saveMcpServers).toHaveBeenCalledTimes(1);
  });

  it('keeps a server after backend deletion fails', async () => {
    const server = createServer(true);
    const saveMcpServers = vi.fn(() => Promise.resolve());
    vi.mocked(mcpService.deleteServer.invoke).mockRejectedValue(new Error('forbidden'));

    const { result } = renderHook(() => useMcpServerCRUD(saveMcpServers));
    let deleted = false;
    await act(async () => {
      deleted = await result.current.handleDeleteMcpServer(server);
    });

    expect(deleted).toBe(false);
    expect(saveMcpServers).not.toHaveBeenCalled();
    expect(messageMock.error).toHaveBeenCalledWith('forbidden');
  });

  it('removes a server and refreshes Codex config after backend deletion succeeds', async () => {
    const server = createServer(true);
    const otherServer = { ...server, id: 'server-2', name: 'Other MCP' };
    const saveMcpServers = vi.fn((updater: (servers: IMcpServer[]) => IMcpServer[]) =>
      Promise.resolve(updater([server, otherServer]))
    );
    const getStatus = vi.fn(() => Promise.resolve({ authenticated: true }));
    vi.stubGlobal('electronAPI', { aibangAuth: { getStatus } });
    vi.mocked(mcpService.deleteServer.invoke).mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useMcpServerCRUD(saveMcpServers));
    let deleted = false;
    await act(async () => {
      deleted = await result.current.handleDeleteMcpServer(server);
    });

    expect(deleted).toBe(true);
    expect(saveMcpServers).toHaveBeenCalledTimes(1);
    expect(saveMcpServers.mock.calls[0][0]([server, otherServer])).toEqual([otherServer]);
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(messageMock.success).toHaveBeenCalledWith('settings.mcpDeleted');

    vi.unstubAllGlobals();
  });

  it('falls back to local persistence for legacy builtin MCP servers missing from the backend', async () => {
    const server = createServer(true);
    server.builtin = true;
    const saveMcpServers = vi.fn(() => Promise.resolve());
    const backendError = Object.assign(new Error('not found'), { status: 404 });
    vi.mocked(mcpService.toggleServer.invoke).mockRejectedValue(backendError);
    clientBusinessSettingMock.get.mockResolvedValue([server]);

    const { result } = renderHook(() => useMcpServerCRUD(saveMcpServers));
    let updatedServer: IMcpServer | undefined;
    await act(async () => {
      updatedServer = await result.current.handleToggleMcpServer(server);
    });

    expect(updatedServer?.enabled).toBe(false);
    expect(clientBusinessSettingMock.set).toHaveBeenCalledWith('mcp.config', [
      expect.objectContaining({ id: server.id, enabled: false }),
    ]);
    expect(saveMcpServers).toHaveBeenCalledTimes(1);
  });

  it('records deleted builtin names so bootstrap cannot restore them', async () => {
    const server = { ...createServer(true), builtin: true };
    const saveMcpServers = vi.fn(() => Promise.resolve());
    clientBusinessSettingMock.get.mockResolvedValue(['aibang-browser']);
    vi.mocked(mcpService.deleteServer.invoke).mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useMcpServerCRUD(saveMcpServers));
    await act(async () => {
      await result.current.handleDeleteMcpServer(server);
    });

    expect(clientBusinessSettingMock.set).toHaveBeenCalledWith('mcp.deletedBuiltinServerNames', [
      'aibang-browser',
      'Test MCP',
    ]);
  });

  it('deletes legacy builtin servers from local MCP config on backend 404', async () => {
    const server = { ...createServer(true), builtin: true };
    const saveMcpServers = vi.fn(() => Promise.resolve());
    const backendError = Object.assign(new Error('not found'), { status: 404 });
    vi.mocked(mcpService.deleteServer.invoke).mockRejectedValue(backendError);
    clientBusinessSettingMock.get.mockImplementation(async (key: string) => {
      if (key === 'mcp.config') return [server];
      return [];
    });

    const { result } = renderHook(() => useMcpServerCRUD(saveMcpServers));
    let deleted = false;
    await act(async () => {
      deleted = await result.current.handleDeleteMcpServer(server);
    });

    expect(deleted).toBe(true);
    expect(clientBusinessSettingMock.set).toHaveBeenCalledWith('mcp.config', []);
    expect(clientBusinessSettingMock.set).toHaveBeenCalledWith('mcp.deletedBuiltinServerNames', [server.name]);
  });
});
