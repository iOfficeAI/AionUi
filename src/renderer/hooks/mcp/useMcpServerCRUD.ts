import type React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigStorage } from '@/common/storage';
import type { IMcpServer } from '@/common/storage';

/**
 * MCP服务器CRUD操作Hook
 * 处理MCP服务器的增加、编辑、删除、启用/禁用等操作
 */
export const useMcpServerCRUD = (mcpServers: IMcpServer[], saveMcpServers: (serversOrUpdater: IMcpServer[] | ((prev: IMcpServer[]) => IMcpServer[])) => Promise<void>, syncMcpToAgents: (server: IMcpServer, skipRecheck?: boolean) => Promise<void>, removeMcpFromAgents: (serverName: string, successMessage?: string) => Promise<void>, checkSingleServerInstallStatus: (serverName: string) => Promise<void>, setAgentInstallStatus: React.Dispatch<React.SetStateAction<Record<string, string[]>>>, message: ReturnType<typeof import('@arco-design/web-react').Message.useMessage>[0]) => {
  const { t } = useTranslation();

  // 添加MCP服务器
  const handleAddMcpServer = useCallback(
    async (serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = Date.now();
      let serverToSync: IMcpServer | null = null;

      // 使用函数式更新，避免闭包问题
      await saveMcpServers((prevServers) => {
        const existingServerIndex = prevServers.findIndex((server) => server.name === serverData.name);

        if (existingServerIndex !== -1) {
          // 如果存在同名服务器，更新现有服务器
          const updatedServers = [...prevServers];
          updatedServers[existingServerIndex] = {
            ...updatedServers[existingServerIndex],
            ...serverData,
            updatedAt: now,
          };
          serverToSync = updatedServers[existingServerIndex];
          return updatedServers;
        } else {
          // 如果不存在同名服务器，添加新服务器
          const newServer: IMcpServer = {
            ...serverData,
            id: `mcp_${now}`,
            createdAt: now,
            updatedAt: now,
          };
          serverToSync = newServer;
          return [...prevServers, newServer];
        }
      });

      // 检查安装状态
      if (serverToSync) {
        setTimeout(() => void checkSingleServerInstallStatus(serverToSync.name), 100);
      }

      // 返回新添加/更新的服务器，用于后续的连接测试
      return serverToSync;
    },
    [saveMcpServers, syncMcpToAgents, message, t, checkSingleServerInstallStatus]
  );

  // 批量导入MCP服务器
  const handleBatchImportMcpServers = useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => {
      const now = Date.now();
      const addedServers: IMcpServer[] = [];

      // 使用函数式更新，避免闭包问题
      await saveMcpServers((prevServers) => {
        const updatedServers = [...prevServers];

        serversData.forEach((serverData, index) => {
          const existingServerIndex = updatedServers.findIndex((server) => server.name === serverData.name);

          if (existingServerIndex !== -1) {
            // 如果存在同名服务器，更新现有服务器
            updatedServers[existingServerIndex] = {
              ...updatedServers[existingServerIndex],
              ...serverData,
              updatedAt: now,
            };
          } else {
            // 如果不存在同名服务器，添加新服务器
            const newServer: IMcpServer = {
              ...serverData,
              id: `mcp_${now}_${index}`,
              createdAt: now,
              updatedAt: now,
            };
            updatedServers.push(newServer);
            addedServers.push(newServer);
          }
        });

        return updatedServers;
      });

      // 检查安装状态
      setTimeout(() => {
        serversData.forEach((serverData) => {
          void checkSingleServerInstallStatus(serverData.name);
        });
      }, 100);

      // 返回新添加的服务器列表，用于后续的连接测试
      return addedServers;
    },
    [saveMcpServers, syncMcpToAgents, message, t, checkSingleServerInstallStatus]
  );

  // 编辑MCP服务器
  const handleEditMcpServer = useCallback(
    async (editingMcpServer: IMcpServer | undefined, serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<IMcpServer | undefined> => {
      if (!editingMcpServer) return undefined;

      let updatedServer: IMcpServer | undefined;

      // 使用函数式更新，避免闭包问题
      await saveMcpServers((prevServers) => {
        updatedServer = {
          ...editingMcpServer,
          ...serverData,
          updatedAt: Date.now(),
        };

        return prevServers.map((server) => (server.id === editingMcpServer.id ? updatedServer : server));
      });

      message.success(t('settings.mcpImportSuccess'));
      // 编辑后立即检查该服务器的安装状态（仅安装状态）
      setTimeout(() => void checkSingleServerInstallStatus(serverData.name), 100);

      // 返回更新后的服务器对象，用于后续的连接测试
      return updatedServer;
    },
    [saveMcpServers, message, t, checkSingleServerInstallStatus]
  );

  // 删除MCP服务器
  const handleDeleteMcpServer = useCallback(
    async (serverId: string) => {
      let targetServer: IMcpServer | undefined;

      // 使用函数式更新，避免闭包问题
      await saveMcpServers((prevServers) => {
        targetServer = prevServers.find((server) => server.id === serverId);
        if (!targetServer) return prevServers;

        return prevServers.filter((server) => server.id !== serverId);
      });

      if (!targetServer) return;

      // 删除后直接更新安装状态，不触发检测
      setAgentInstallStatus((prev) => {
        const updated = { ...prev };
        delete updated[targetServer.name];
        // 同时更新本地存储
        void ConfigStorage.set('mcp.agentInstallStatus', updated).catch(() => {
          // Handle storage error silently
        });
        return updated;
      });

      try {
        // 如果服务器是启用状态，需要从所有agents中删除MCP配置
        if (targetServer.enabled) {
          await removeMcpFromAgents(targetServer.name, t('settings.mcpDeletedWithCleanup'));
        } else {
          message.success(t('settings.mcpDeleted'));
        }
      } catch (error) {
        message.error(t('settings.mcpDeleteError'));
      }
    },
    [saveMcpServers, setAgentInstallStatus, removeMcpFromAgents, message, t]
  );

  // 启用/禁用MCP服务器
  const handleToggleMcpServer = useCallback(
    async (serverId: string, enabled: boolean) => {
      let targetServer: IMcpServer | undefined;
      let updatedTargetServer: IMcpServer | undefined;

      // 使用函数式更新，避免闭包问题
      await saveMcpServers((prevServers) => {
        targetServer = prevServers.find((server) => server.id === serverId);
        if (!targetServer) return prevServers;

        return prevServers.map((server) => {
          if (server.id === serverId) {
            updatedTargetServer = { ...server, enabled, updatedAt: Date.now() };
            return updatedTargetServer;
          }
          return server;
        });
      });

      if (!targetServer || !updatedTargetServer) return;

      try {
        if (enabled) {
          // 如果启用了MCP服务器，只将当前服务器同步到所有检测到的agent
          await syncMcpToAgents(updatedTargetServer, true);
          // 启用后立即检查该服务器的安装状态（仅安装状态）
          setTimeout(() => void checkSingleServerInstallStatus(targetServer.name), 100);
        } else {
          // 如果禁用了MCP服务器，从所有agent中删除该配置
          await removeMcpFromAgents(targetServer.name);
          // 禁用后直接更新UI状态，不需要重新检测
          setAgentInstallStatus((prev) => {
            const updated = { ...prev };
            delete updated[targetServer.name];
            // 同时更新本地存储
            void ConfigStorage.set('mcp.agentInstallStatus', updated).catch(() => {
              // Handle storage error silently
            });
            return updated;
          });
        }
      } catch (error) {
        message.error(enabled ? t('settings.mcpSyncError') : t('settings.mcpRemoveError'));
      }
    },
    [saveMcpServers, syncMcpToAgents, removeMcpFromAgents, checkSingleServerInstallStatus, setAgentInstallStatus, message, t]
  );

  return {
    handleAddMcpServer,
    handleBatchImportMcpServers,
    handleEditMcpServer,
    handleDeleteMcpServer,
    handleToggleMcpServer,
  };
};
