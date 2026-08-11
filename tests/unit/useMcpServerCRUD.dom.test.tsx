import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMcpServerCRUD } from '@renderer/hooks/mcp/useMcpServerCRUD';
import { Message } from '@arco-design/web-react';
import type { IMcpServer } from '@/common/config/storage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: { set: vi.fn().mockResolvedValue(undefined) },
}));

const makeMockServer = (overrides?: Partial<IMcpServer>): IMcpServer => ({
  id: 'mcp_1',
  name: 'test-server',
  enabled: true,
  createdAt: 1000,
  updatedAt: 1000,
  transport: { type: 'stdio' as const, command: 'echo', args: [] },
  ...overrides,
});

describe('useMcpServerCRUD', () => {
  const saveMcpServers = vi.fn().mockImplementation(async (updater: unknown) => {
    if (typeof updater === 'function') (updater as (prev: IMcpServer[]) => IMcpServer[])([]);
  });
  const syncMcpToAgents = vi.fn().mockResolvedValue(undefined);
  const removeMcpFromAgents = vi.fn().mockResolvedValue(undefined);
  const checkSingleServerInstallStatus = vi.fn().mockResolvedValue(undefined);
  const setAgentInstallStatus = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderCRUD = (servers: IMcpServer[] = []) =>
    renderHook(() =>
      useMcpServerCRUD(
        servers,
        saveMcpServers,
        syncMcpToAgents,
        removeMcpFromAgents,
        checkSingleServerInstallStatus,
        setAgentInstallStatus
      )
    );

  describe('handleToggleMcpServer uses static Message API (Fixes ELECTRON-D)', () => {
    it('calls static Message.error when sync throws, not hook-based message', async () => {
      const server = makeMockServer();
      syncMcpToAgents.mockRejectedValueOnce(new Error('sync failed'));
      saveMcpServers.mockImplementationOnce(async (updater: unknown) => {
        if (typeof updater === 'function') (updater as (prev: IMcpServer[]) => IMcpServer[])([server]);
      });

      const { result } = renderCRUD([server]);

      await act(async () => {
        await result.current.handleToggleMcpServer('mcp_1', true);
      });

      expect(Message.error).toHaveBeenCalledWith('settings.mcpSyncError');
    });

    it('calls static Message.error when remove throws', async () => {
      const server = makeMockServer({ enabled: false });
      removeMcpFromAgents.mockRejectedValueOnce(new Error('remove failed'));
      saveMcpServers.mockImplementationOnce(async (updater: unknown) => {
        if (typeof updater === 'function') (updater as (prev: IMcpServer[]) => IMcpServer[])([server]);
      });

      const { result } = renderCRUD([server]);

      await act(async () => {
        await result.current.handleToggleMcpServer('mcp_1', false);
      });

      expect(Message.error).toHaveBeenCalledWith('settings.mcpRemoveError');
    });
  });

  describe('handleDeleteMcpServer uses static Message API', () => {
    it('shows success via static Message when deleting disabled server', async () => {
      const server = makeMockServer({ enabled: false });
      saveMcpServers.mockImplementationOnce(async (updater: unknown) => {
        if (typeof updater === 'function') (updater as (prev: IMcpServer[]) => IMcpServer[])([server]);
      });

      const { result } = renderCRUD([server]);

      await act(async () => {
        await result.current.handleDeleteMcpServer('mcp_1');
      });

      expect(Message.success).toHaveBeenCalledWith('settings.mcpDeleted');
    });
  });

  describe('handleEditMcpServer uses static Message API', () => {
    it('shows success via static Message after editing', async () => {
      const server = makeMockServer();
      saveMcpServers.mockImplementationOnce(async (updater: unknown) => {
        if (typeof updater === 'function') (updater as (prev: IMcpServer[]) => IMcpServer[])([server]);
      });

      const { result } = renderCRUD([server]);

      await act(async () => {
        await result.current.handleEditMcpServer(server, {
          name: 'updated-server',
          enabled: true,
          transport: server.transport,
        });
      });

      expect(Message.success).toHaveBeenCalledWith('settings.mcpImportSuccess');
    });
  });
});
