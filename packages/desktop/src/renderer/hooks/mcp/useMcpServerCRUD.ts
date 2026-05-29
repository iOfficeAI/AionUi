import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Message } from '@arco-design/web-react';
import { mcpService } from '@/common/adapter/ipcBridge';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { configService } from '@/common/config/configService';
import type { IMcpServer } from '@/common/config/storage';

const getMcpRequestErrorMessage = (error: unknown, fallback: string): string => {
  if (isBackendHttpError(error) && error.backendMessage.trim()) return error.backendMessage;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
};

/**
 * MCP服务器CRUD操作Hook
 * 处理MCP服务器的增加、编辑、删除、启用/禁用等操作
 */
export const useMcpServerCRUD = (
  mcpServers: IMcpServer[],
  reloadMcpServers: () => Promise<IMcpServer[]>,
  checkSingleServerInstallStatus: (server_name: string) => Promise<void>,
  setAgentInstallStatus: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
) => {
  const { t } = useTranslation();
  const togglingServerIdsRef = useRef<Set<string>>(new Set());
  const [togglingServerIds, setTogglingServerIds] = useState<Set<string>>(() => new Set());

  const setServerToggling = useCallback((serverId: string, isToggling: boolean) => {
    const next = new Set(togglingServerIdsRef.current);

    if (isToggling) {
      next.add(serverId);
    } else {
      next.delete(serverId);
    }

    togglingServerIdsRef.current = next;
    setTogglingServerIds(next);
  }, []);

  // 添加MCP服务器
  const handleAddMcpServer = useCallback(
    async (serverData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>) => {
      try {
        const server = await mcpService.createServer.invoke(serverData);
        await reloadMcpServers();
        setTimeout(() => void checkSingleServerInstallStatus(server.name), 100);
        return server;
      } catch (error) {
        Message.error(getMcpRequestErrorMessage(error, t('settings.mcpImportFailed')));
        return undefined;
      }
    },
    [reloadMcpServers, checkSingleServerInstallStatus, t]
  );

  // 批量导入MCP服务器
  const handleBatchImportMcpServers = useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>[]) => {
      try {
        const servers = await mcpService.batchImportServers.invoke({ servers: serversData });
        await reloadMcpServers();
        setTimeout(() => {
          servers.forEach((server) => void checkSingleServerInstallStatus(server.name));
        }, 100);
        return servers;
      } catch (error) {
        Message.error(getMcpRequestErrorMessage(error, t('settings.mcpImportFailed')));
        return [];
      }
    },
    [reloadMcpServers, checkSingleServerInstallStatus, t]
  );

  // 编辑MCP服务器
  const handleEditMcpServer = useCallback(
    async (
      editingMcpServer: IMcpServer | undefined,
      serverData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>
    ): Promise<IMcpServer | undefined> => {
      if (!editingMcpServer) return undefined;

      try {
        const updated = await mcpService.updateServer.invoke({
          id: editingMcpServer.id,
          data: {
            name: serverData.name,
            description: serverData.description,
            transport: serverData.transport,
            original_json: serverData.original_json,
          },
        });
        await reloadMcpServers();

        Message.success(t('settings.mcpImportSuccess'));
        setTimeout(() => void checkSingleServerInstallStatus(updated.name), 100);
        return updated;
      } catch (error) {
        Message.error(getMcpRequestErrorMessage(error, t('settings.mcpImportFailed')));
        return undefined;
      }
    },
    [reloadMcpServers, t, checkSingleServerInstallStatus]
  );

  // 删除MCP服务器
  const handleDeleteMcpServer = useCallback(
    async (serverId: string) => {
      const targetServer = mcpServers.find((server) => server.id === serverId);

      await mcpService.deleteServer.invoke(serverId);
      await reloadMcpServers();

      if (targetServer) {
        setAgentInstallStatus((prev) => {
          const updated = { ...prev };
          delete updated[targetServer.name];
          void configService.set('mcp.agentInstallStatus', updated).catch(() => {
            // Handle storage error silently
          });
          return updated;
        });
      }

      Message.success(targetServer?.enabled ? t('settings.mcpDeletedWithCleanup') : t('settings.mcpDeleted'));
    },
    [mcpServers, reloadMcpServers, setAgentInstallStatus, t]
  );

  // 启用/禁用MCP服务器
  const handleToggleMcpServer = useCallback(
    async (serverId: string, enabled: boolean) => {
      if (togglingServerIdsRef.current.has(serverId)) return;

      setServerToggling(serverId, true);

      try {
        const updatedServer = await mcpService.toggleServer.invoke(serverId);
        await reloadMcpServers();

        if (updatedServer.enabled !== enabled) {
          Message.error(enabled ? t('settings.mcpSyncError') : t('settings.mcpRemoveError'));
          return;
        }

        if (enabled) {
          setTimeout(() => void checkSingleServerInstallStatus(updatedServer.name), 100);
          return;
        }

        setAgentInstallStatus((prev) => {
          const updated = { ...prev };
          delete updated[updatedServer.name];
          void configService.set('mcp.agentInstallStatus', updated).catch(() => {
            // Handle storage error silently
          });
          return updated;
        });
      } catch {
        Message.error(enabled ? t('settings.mcpSyncError') : t('settings.mcpRemoveError'));
      } finally {
        setServerToggling(serverId, false);
      }
    },
    [reloadMcpServers, checkSingleServerInstallStatus, setAgentInstallStatus, setServerToggling, t]
  );

  return {
    togglingServerIds,
    handleAddMcpServer,
    handleBatchImportMcpServers,
    handleEditMcpServer,
    handleDeleteMcpServer,
    handleToggleMcpServer,
  };
};
