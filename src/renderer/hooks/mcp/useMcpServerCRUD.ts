import type React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigStorage } from '@/common/storage';
import type { IMcpServer } from '@/common/storage';

/**
 * MCP服务器CRUD操作Hook
 * 处理MCP服务器的增加、编辑、删除、启用/禁用等操作
 */
export const useMcpServerCRUD = (
  mcpServers: IMcpServer[],
  saveMcpServers: (servers: IMcpServer[]) => void,
  syncMcpToAgents: (server: IMcpServer, skipRecheck?: boolean) => Promise<void>,
  removeMcpFromAgents: (serverName: string, successMessage?: string) => Promise<void>,
  checkSingleServerInstallStatus: (serverName: string) => Promise<void>,
  setAgentInstallStatus: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
  message: any
) => {
  const { t } = useTranslation();

  // 添加MCP服务器
  const handleAddMcpServer = useCallback(
    async (serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = Date.now();
      let serverToSync: IMcpServer | null = null;

      // 检查是否存在同名服务器
      const existingServerIndex = mcpServers.findIndex((server) => server.name === serverData.name);

      if (existingServerIndex !== -1) {
        // 如果存在同名服务器，更新现有服务器
        const updatedServers = [...mcpServers];
        updatedServers[existingServerIndex] = {
          ...updatedServers[existingServerIndex],
          ...serverData,
          updatedAt: now,
        };
        serverToSync = updatedServers[existingServerIndex];
        saveMcpServers(updatedServers);
      } else {
        // 如果不存在同名服务器，添加新服务器
        const newServer: IMcpServer = {
          ...serverData,
          id: `mcp_${now}`,
          createdAt: now,
          updatedAt: now,
        };
        serverToSync = newServer;
        const updatedServers = [...mcpServers, newServer];
        saveMcpServers(updatedServers);
      }

      // 如果服务器启用，自动同步到所有agents
      try {
        if (serverData.enabled && serverToSync) {
          await syncMcpToAgents(serverToSync, true);
        }
      } catch (error) {
        console.error('同步MCP服务器失败:', error);
      }

      // 检查安装状态
      setTimeout(() => void checkSingleServerInstallStatus(serverData.name), 100);
    },
    [mcpServers, saveMcpServers, syncMcpToAgents, message, t, checkSingleServerInstallStatus]
  );

  // 批量导入MCP服务器
  const handleBatchImportMcpServers = useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => {
      const now = Date.now();
      const updatedServers = [...mcpServers];
      const addedServers: IMcpServer[] = [];
      const updatedServerNames: string[] = [];

      serversData.forEach((serverData, index) => {
        const existingServerIndex = updatedServers.findIndex((server) => server.name === serverData.name);

        if (existingServerIndex !== -1) {
          // 如果存在同名服务器，更新现有服务器
          updatedServers[existingServerIndex] = {
            ...updatedServers[existingServerIndex],
            ...serverData,
            updatedAt: now,
          };
          updatedServerNames.push(serverData.name);
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

      saveMcpServers(updatedServers);

      // 批量导入后自动同步启用的服务器到所有agents
      try {
        for (const serverData of serversData) {
          if (serverData.enabled) {
            // 查找完整的服务器对象进行同步
            const serverToSync = updatedServers.find((server) => server.name === serverData.name);
            if (serverToSync) {
              await syncMcpToAgents(serverToSync, true);
            }
          }
        }
      } catch (error) {
        console.error('批量同步MCP服务器失败:', error);
      }

      // 检查安装状态
      setTimeout(() => {
        serversData.forEach((serverData) => {
          void checkSingleServerInstallStatus(serverData.name);
        });
      }, 100);
    },
    [mcpServers, saveMcpServers, syncMcpToAgents, message, t, checkSingleServerInstallStatus]
  );

  // 编辑MCP服务器
  const handleEditMcpServer = useCallback(
    (editingMcpServer: IMcpServer | undefined, serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!editingMcpServer) return;

      const updatedServer: IMcpServer = {
        ...editingMcpServer,
        ...serverData,
        updatedAt: Date.now(),
      };

      const updatedServers = mcpServers.map((server) => (server.id === editingMcpServer.id ? updatedServer : server));
      saveMcpServers(updatedServers);
      message.success(t('settings.mcpImportSuccess'));
      // 编辑后立即检查该服务器的安装状态（仅安装状态）
      setTimeout(() => void checkSingleServerInstallStatus(serverData.name), 100);
    },
    [mcpServers, saveMcpServers, message, t, checkSingleServerInstallStatus]
  );

  // 删除MCP服务器
  const handleDeleteMcpServer = useCallback(
    async (serverId: string) => {
      const targetServer = mcpServers.find((server) => server.id === serverId);
      if (!targetServer) return;

      // 先从本地状态中删除
      const updatedServers = mcpServers.filter((server) => server.id !== serverId);
      saveMcpServers(updatedServers);

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
    [mcpServers, saveMcpServers, setAgentInstallStatus, removeMcpFromAgents, message, t]
  );

  // 启用/禁用MCP服务器
  const handleToggleMcpServer = useCallback(
    async (serverId: string, enabled: boolean) => {
      const targetServer = mcpServers.find((server) => server.id === serverId);
      if (!targetServer) return;

      const updatedServers = mcpServers.map((server) => (server.id === serverId ? { ...server, enabled, updatedAt: Date.now() } : server));

      saveMcpServers(updatedServers);

      try {
        if (enabled) {
          // 如果启用了MCP服务器，只将当前服务器同步到所有检测到的agent
          const updatedTargetServer = updatedServers.find((server) => server.id === serverId);
          if (!updatedTargetServer) return;
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
    [mcpServers, saveMcpServers, syncMcpToAgents, removeMcpFromAgents, checkSingleServerInstallStatus, setAgentInstallStatus, message, t]
  );

  return {
    handleAddMcpServer,
    handleBatchImportMcpServers,
    handleEditMcpServer,
    handleDeleteMcpServer,
    handleToggleMcpServer,
  };
};
